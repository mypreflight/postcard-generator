import { OpenAiClient } from "./client";
import { readDefaults } from "./config";
import { type HandlerParams, handleRequest } from "./handler";
import { Logger } from "./logger";
import type { Defaults } from "./request";

const DEFAULT_BASE_URL = "https://api.openai.com";

const DEFAULT_MODEL = "gpt-image-2";

const logger = new Logger("PostcardFunction");

let client: OpenAiClient | undefined;
let defaults: Defaults | undefined;

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

function resolveDefaults(): Defaults {
  if (!defaults) {
    defaults = readDefaults();
  }

  return defaults;
}

export function resetClient(): void {
  client = undefined;
  defaults = undefined;
}

export async function main(args: HandlerParams): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}> {
  const { statusCode, body } = await handleRequest(resolveClient(), args ?? {}, resolveDefaults());

  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body,
  };
}
