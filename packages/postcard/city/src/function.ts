import { OpenAiClient } from "./client";
import { readDefaults, readSchedulerOptions, readSpacesOptions } from "./config";
import { ProviderError } from "./errors";
import { type HandlerParams, handleRequest } from "./handler";
import { describeError, Logger, stackOf } from "./logger";
import type { Defaults } from "./request";
import { Scheduler, type SchedulerOptions } from "./scheduler";
import { SpacesClient } from "./spaces";

const DEFAULT_BASE_URL = "https://api.openai.com";

const DEFAULT_MODEL = "gpt-image-2";

const logger = new Logger("PostcardFunction");

let client: OpenAiClient | undefined;
let spaces: SpacesClient | undefined;
let defaults: Defaults | undefined;
let scheduler: Scheduler | null | undefined;

function resolveClient(): OpenAiClient {
  if (!client) {
    const baseUrl = process.env.OPENAI_API_HOST ?? DEFAULT_BASE_URL;
    const model = process.env.POSTCARD_MODEL ?? DEFAULT_MODEL;

    client = new OpenAiClient({
      baseUrl,
      apiKey: process.env.OPENAI_API_KEY ?? "",
      model,
    });

    logger.log(`Cold start. Drawing postcards with ${model} at ${baseUrl}.`);
  }

  return client;
}

function resolveSpaces(): SpacesClient {
  if (!spaces) {
    const options = readSpacesOptions();

    spaces = new SpacesClient(options);

    logger.log(`Storing postcards at ${options.endpoint}/${options.prefix} as ${options.acl}.`);
  }

  return spaces;
}

function resolveDefaults(): Defaults {
  if (!defaults) {
    defaults = readDefaults();
  }

  return defaults;
}

function describeRoutes(options: SchedulerOptions): string {
  return [
    options.platform ? `background activations of ${options.platform.actionName}` : null,
    options.web ? `web calls to ${options.web.url}` : null,
  ]
    .filter(Boolean)
    .join(", falling back to ");
}

function resolveScheduler(): Scheduler | null {
  if (scheduler === undefined) {
    const options = readSchedulerOptions();

    scheduler = options ? new Scheduler(options) : null;

    logger.log(
      options
        ? `Renders are handed to ${describeRoutes(options)}.`
        : "No way to hand a render off, so renders happen while the caller waits.",
    );
  }

  return scheduler;
}

export function resetClient(): void {
  client = undefined;
  spaces = undefined;
  defaults = undefined;
  scheduler = undefined;
}

export async function main(args: HandlerParams): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}> {
  const headers = { "Content-Type": "application/json" };

  // Resolving configuration can fail, and a throw here would escape the function
  // as an opaque platform error rather than as an answer the caller can read.
  let resolved: {
    client: OpenAiClient;
    spaces: SpacesClient;
    defaults: Defaults;
    scheduler: Scheduler | null;
  };

  try {
    resolved = {
      client: resolveClient(),
      spaces: resolveSpaces(),
      defaults: resolveDefaults(),
      scheduler: resolveScheduler(),
    };
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 500;
    const code = error instanceof ProviderError ? error.code : "MISCONFIGURED";

    logger.error(`Cannot serve postcards: ${describeError(error)}`, stackOf(error));

    return {
      statusCode: status,
      headers,
      body: { error: { code, message: describeError(error), status } },
    };
  }

  const { statusCode, body } = await handleRequest(
    resolved.client,
    resolved.spaces,
    args ?? {},
    resolved.defaults,
    resolved.scheduler,
  );

  return { statusCode, headers, body };
}
