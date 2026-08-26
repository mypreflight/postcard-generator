import type { OpenAiClient } from "./client";
import { PostcardTooLargeError, ProviderError } from "./errors";
import { describeError, Logger, stackOf } from "./logger";
import { buildPrompt } from "./prompt";
import { type Defaults, parseRequest, type RequestParams } from "./request";
import { CONTENT_TYPES, type Postcard, type PostcardRequest } from "./types";

export type HandlerParams = RequestParams;

export type HandlerResponse = {
  statusCode: number;
  body: unknown;
};

const MAX_RESULT_BYTES = 1_000_000;

const logger = new Logger("PostcardHandler");

function describeRequest(params: HandlerParams): string {
  return [
    `city=${params.city ?? "-"}`,
    params.size ? `size=${params.size}` : "",
    params.quality ? `quality=${params.quality}` : "",
    params.format ? `format=${params.format}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function draw(client: OpenAiClient, request: PostcardRequest): Promise<Postcard> {
  const prompt = buildPrompt(request.city);
  const image = await client.draw(request, prompt);

  return {
    city: request.city,
    model: client.model,
    size: request.size,
    quality: request.quality,
    format: request.format,
    contentType: CONTENT_TYPES[request.format],
    bytes: image.bytes,
    prompt,
    image: image.base64,
  };
}

function withinResultLimit(postcard: Postcard): Postcard {
  const encoded = Buffer.byteLength(JSON.stringify(postcard));

  if (encoded > MAX_RESULT_BYTES) {
    throw new PostcardTooLargeError(encoded, MAX_RESULT_BYTES);
  }

  return postcard;
}

export async function handleRequest(
  client: OpenAiClient,
  params: HandlerParams,
  defaults: Defaults,
): Promise<HandlerResponse> {
  const startedAt = Date.now();

  try {
    const request = parseRequest(params, defaults);
    const postcard = withinResultLimit(await draw(client, request));

    logger.log(`Served ${describeRequest(params)} in ${Date.now() - startedAt}ms.`);

    return { statusCode: 200, body: postcard };
  } catch (error) {
    if (error instanceof ProviderError) {
      logger.warn(
        `Request ${describeRequest(params)} failed after ${Date.now() - startedAt}ms ` +
          `with ${error.status} ${error.code}: ${error.message}`,
      );

      return {
        statusCode: error.status,
        body: {
          error: {
            code: error.code,
            message: error.message,
            status: error.status,
          },
        },
      };
    }

    logger.error(
      `Request ${describeRequest(params)} crashed after ${Date.now() - startedAt}ms: ${describeError(error)}`,
      stackOf(error),
    );

    return {
      statusCode: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Postcard generation failed.",
          status: 500,
        },
      },
    };
  }
}
