import type { OpenAiClient } from "./client";
import { ProviderError } from "./errors";
import { describeError, Logger, stackOf } from "./logger";
import { buildPrompt } from "./prompt";
import { type Defaults, parseRequest, type RequestParams } from "./request";
import type { SpacesClient } from "./spaces";
import { CONTENT_TYPES, EXTENSIONS, type Postcard, type PostcardRequest } from "./types";

export type HandlerParams = RequestParams;

export type HandlerResponse = {
  statusCode: number;
  body: unknown;
};

const logger = new Logger("PostcardHandler");

function describeRequest(params: HandlerParams): string {
  return [
    `city=${params.city ?? "-"}`,
    `country=${params.country ?? "-"}`,
    `continent=${params.continent ?? "-"}`,
    `uuid=${params.uuid ?? "-"}`,
    params.size ? `size=${params.size}` : "",
    params.quality ? `quality=${params.quality}` : "",
    params.format ? `format=${params.format}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function drawAndStore(client: OpenAiClient, spaces: SpacesClient, request: PostcardRequest): Promise<Postcard> {
  const prompt = buildPrompt(request.city, request.country, request.continent);
  const image = await client.draw(request, prompt);
  const contentType = CONTENT_TYPES[request.format];

  const stored = await spaces.store(
    `${request.uuid}.${EXTENSIONS[request.format]}`,
    Buffer.from(image.base64, "base64"),
    contentType,
  );

  return {
    city: request.city,
    country: request.country,
    continent: request.continent,
    uuid: request.uuid,
    model: client.model,
    size: request.size,
    quality: request.quality,
    format: request.format,
    contentType,
    bytes: image.bytes,
    prompt,
    key: stored.key,
    url: stored.url,
  };
}

export async function handleRequest(
  client: OpenAiClient,
  spaces: SpacesClient,
  params: HandlerParams,
  defaults: Defaults,
): Promise<HandlerResponse> {
  const startedAt = Date.now();

  try {
    const request = parseRequest(params, defaults);
    const postcard = await drawAndStore(client, spaces, request);

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
