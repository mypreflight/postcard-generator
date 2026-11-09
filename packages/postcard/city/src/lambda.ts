import { timingSafeEqual } from "node:crypto";
import { readLambdaInvokerOptions, readS3Options } from "./config";
import { BadRequestError, type ProviderError, RouteNotFoundError, UnauthorizedError } from "./errors";
import type { HandlerParams, HandlerResponse } from "./handler";
import { DRAW_EVENT, type DrawEvent, LambdaInvoker } from "./invoker";
import { Logger } from "./logger";
import { S3Client } from "./s3";
import { PostcardService } from "./service";

const CONTEXT = "PostcardLambda";

const ROUTE = "/city";

const SECRET_HEADER = "x-require-whisk-auth";

export type FunctionUrlEvent = {
  rawPath: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext: { http: { method: string } };
};

export type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type LambdaHandler = (event: unknown) => Promise<LambdaResult>;

export type Serving = Pick<PostcardService, "serve">;

const logger = new Logger(CONTEXT);

function createS3(): S3Client {
  const options = readS3Options();
  const store = new S3Client(options);

  logger.log(`Storing postcards at ${options.endpoint}/${options.prefix}.`);

  return store;
}

function createInvoker(): LambdaInvoker | null {
  const options = readLambdaInvokerOptions();

  logger.log(
    options
      ? `Renders are handed to asynchronous invocations of ${options.functionName}.`
      : "No function to invoke, so renders happen while the caller waits.",
  );

  return options ? new LambdaInvoker(options) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDrawEvent(event: unknown): event is DrawEvent {
  return isRecord(event) && event.kind === DRAW_EVENT && isRecord(event.params);
}

function isFunctionUrlEvent(event: unknown): event is FunctionUrlEvent {
  if (!isRecord(event) || typeof event.rawPath !== "string" || !isRecord(event.requestContext)) {
    return false;
  }

  const http = event.requestContext.http;

  return isRecord(http) && typeof http.method === "string";
}

function respond({ statusCode, body }: HandlerResponse): LambdaResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function refuse(error: ProviderError): LambdaResult {
  return respond({
    statusCode: error.status,
    body: { error: { code: error.code, message: error.message, status: error.status } },
  });
}

function isAuthorised(event: FunctionUrlEvent): boolean {
  const secret = (process.env.POSTCARD_FUNCTION_SECRET ?? "").trim();

  if (!secret) {
    logger.error("POSTCARD_FUNCTION_SECRET is not set, so every request is refused.");

    return false;
  }

  const expected = Buffer.from(secret);
  const given = Buffer.from(event.headers?.[SECRET_HEADER] ?? "");

  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createHandler(service: Serving): LambdaHandler {
  return async (event) => {
    if (isDrawEvent(event)) {
      return respond(await service.serve({ ...event.params, background: true } as HandlerParams));
    }

    if (!isFunctionUrlEvent(event)) {
      logger.error("Refused an event that is neither a Function URL request nor a draw.");

      return refuse(new BadRequestError("The function answers Function URL requests and its own draws only."));
    }

    const method = event.requestContext.http.method;

    if (!isAuthorised(event)) {
      logger.warn(`Refused ${method} ${event.rawPath} without the function secret.`);

      return refuse(new UnauthorizedError());
    }

    if (event.rawPath !== ROUTE) {
      return refuse(new RouteNotFoundError(event.rawPath));
    }

    const params: HandlerParams & { __ow_method: string } = {
      ...event.queryStringParameters,
      __ow_method: method.toLowerCase(),
    };

    return respond(await service.serve(params));
  };
}

export const handler = createHandler(
  new PostcardService({ context: CONTEXT, store: createS3, scheduler: createInvoker }),
);
