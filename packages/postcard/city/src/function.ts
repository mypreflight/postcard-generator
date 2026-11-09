import { readSchedulerOptions, readSpacesOptions } from "./config";
import type { HandlerParams } from "./handler";
import { Logger } from "./logger";
import { Scheduler, type SchedulerOptions } from "./scheduler";
import { PostcardService } from "./service";
import { SpacesClient } from "./spaces";

const CONTEXT = "PostcardFunction";

const logger = new Logger(CONTEXT);

function createSpaces(): SpacesClient {
  const options = readSpacesOptions();
  const spaces = new SpacesClient(options);

  logger.log(`Storing postcards at ${options.endpoint}/${options.prefix} as ${options.acl}.`);

  return spaces;
}

function describeRoutes(options: SchedulerOptions): string {
  return [
    options.platform ? `background activations of ${options.platform.actionName}` : null,
    options.web ? `web calls to ${options.web.url}` : null,
  ]
    .filter(Boolean)
    .join(", falling back to ");
}

function createScheduler(): Scheduler | null {
  const options = readSchedulerOptions();

  logger.log(
    options
      ? `Renders are handed to ${describeRoutes(options)}.`
      : "No way to hand a render off, so renders happen while the caller waits.",
  );

  return options ? new Scheduler(options) : null;
}

const service = new PostcardService({ context: CONTEXT, store: createSpaces, scheduler: createScheduler });

export function resetClient(): void {
  service.reset();
}

export async function main(args: HandlerParams): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}> {
  const headers = { "Content-Type": "application/json" };

  const { statusCode, body } = await service.serve(args);

  return { statusCode, headers, body };
}
