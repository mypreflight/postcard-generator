import {
  OpenAiRateLimitedError,
  OpenAiUnavailableError,
  PostcardRejectedError,
  PostcardUnreadableError,
} from "./errors";
import { describeError, Logger } from "./logger";
import type { PostcardRequest, RenderedImage } from "./types";

const GENERATIONS_PATH = "/v1/images/generations";

const TIMEOUT_MS = 240_000;

const RETRIES = 1;

const BACKOFF_MS = 1_000;

const CACHE_TTL_MS = 86_400_000;

const CACHE_MAX_ENTRIES = 8;

const REJECTION_CODES = ["moderation_blocked", "content_policy_violation", "invalid_prompt"];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type OpenAiClientOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

type OpenAiErrorBody = {
  error?: { code?: string; type?: string; message?: string };
};

type OpenAiImageBody = {
  data?: { b64_json?: string }[];
};

export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly model: string;
  private readonly cache = new Map<string, { value: RenderedImage; expiresAt: number }>();

  constructor(options: OpenAiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async draw(request: PostcardRequest, prompt: string): Promise<RenderedImage> {
    return this.cached(cacheKey(request), async () => {
      const startedAt = Date.now();
      const response = await this.post(prompt, request);
      const image = await this.readImage(response);

      this.logger.log(
        `Drew ${request.city}, ${request.country} as ${image.bytes} ${request.format} bytes in ${Date.now() - startedAt}ms.`,
      );

      return image;
    });
  }

  private async cached(key: string, produce: () => Promise<RenderedImage>): Promise<RenderedImage> {
    const entry = this.cache.get(key);

    if (entry && entry.expiresAt > Date.now()) {
      this.logger.debug(`Serving ${key} from cache.`);

      return entry.value;
    }

    const value = await produce();
    this.remember(key, value);

    return value;
  }

  private remember(key: string, value: RenderedImage): void {
    this.cache.delete(key);

    while (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.cache.delete(oldest);
    }

    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private async post(prompt: string, request: PostcardRequest): Promise<Response> {
    const payload: Record<string, unknown> = {
      model: this.model,
      prompt,
      n: 1,
      size: request.size,
      quality: request.quality,
      background: "opaque",
      output_format: request.format,
    };

    if (request.format === "jpeg") {
      payload.output_compression = request.compression;
    }

    const response = await this.fetchWithRetry(payload);

    if (!response.ok) {
      await this.raiseFor(response);
    }

    return response;
  }

  private async raiseFor(response: Response): Promise<never> {
    const body = await this.readErrorBody(response);
    const code = body.error?.code ?? body.error?.type ?? "unknown";
    const message = body.error?.message ?? "no message";

    if (response.status === 429) {
      this.logger.warn(`OpenAI rate limited image generation: ${message}`);

      throw new OpenAiRateLimitedError();
    }

    if (response.status === 400 && REJECTION_CODES.includes(code)) {
      this.logger.warn(`OpenAI rejected the prompt with ${code}: ${message}`);

      throw new PostcardRejectedError(message);
    }

    this.logger.error(`OpenAI answered ${response.status} ${code}: ${message}`);

    throw new OpenAiUnavailableError();
  }

  private async readErrorBody(response: Response): Promise<OpenAiErrorBody> {
    try {
      return JSON.parse(await response.text()) as OpenAiErrorBody;
    } catch {
      return {};
    }
  }

  private async readImage(response: Response): Promise<RenderedImage> {
    let body: OpenAiImageBody;

    try {
      body = (await response.json()) as OpenAiImageBody;
    } catch (error) {
      this.logger.warn(`Could not read the OpenAI response: ${describeError(error)}`);

      throw new PostcardUnreadableError();
    }

    const base64 = body.data?.[0]?.b64_json;

    if (!base64) {
      this.logger.warn("OpenAI answered without b64_json image data.");

      throw new PostcardUnreadableError();
    }

    return { base64, bytes: decodedBytes(base64) };
  }

  private async fetchWithRetry(payload: Record<string, unknown>): Promise<Response> {
    const url = `${this.baseUrl}${GENERATIONS_PATH}`;

    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        return await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt === RETRIES) {
          this.logger.error(`Could not reach ${url} in ${RETRIES + 1} attempts: ${describeError(error)}`);

          throw new OpenAiUnavailableError();
        }

        const backoff = BACKOFF_MS * 2 ** attempt;
        this.logger.warn(
          `Attempt ${attempt + 1} to reach ${url} failed: ${describeError(error)}. Retrying in ${backoff}ms.`,
        );

        await delay(backoff);
      }
    }

    throw new OpenAiUnavailableError();
  }
}

function decodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;

  return (base64.length / 4) * 3 - padding;
}

function cacheKey(request: PostcardRequest): string {
  return [
    request.city.toLowerCase(),
    request.country.toLowerCase(),
    request.continent.toLowerCase(),
    request.size,
    request.quality,
    request.format,
    request.format === "jpeg" ? request.compression : "-",
  ].join("|");
}
