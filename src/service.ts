import { OpenAiClient } from "./client";
import { readDefaults } from "./config";
import { ProviderError } from "./errors";
import { type HandlerResponse, handleRequest } from "./handler";
import type { RenderScheduler } from "./invoker";
import { describeError, Logger, stackOf } from "./logger";
import type { Defaults, RequestParams } from "./request";
import type { PostcardStore } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com";

const DEFAULT_MODEL = "gpt-image-2";

export type Wiring = {
  context: string;
  store: () => PostcardStore;
  scheduler: () => RenderScheduler | null;
};

type Resolved = {
  client: OpenAiClient;
  store: PostcardStore;
  defaults: Defaults;
  scheduler: RenderScheduler | null;
};

export class PostcardService {
  private readonly logger: Logger;
  private client: OpenAiClient | undefined;
  private store: PostcardStore | undefined;
  private defaults: Defaults | undefined;
  private scheduler: RenderScheduler | null | undefined;

  constructor(private readonly wiring: Wiring) {
    this.logger = new Logger(wiring.context);
  }

  reset(): void {
    this.client = undefined;
    this.store = undefined;
    this.defaults = undefined;
    this.scheduler = undefined;
  }

  async serve(params: RequestParams, background = false): Promise<HandlerResponse> {
    // Resolving configuration can fail, and a throw here would escape the function
    // as an opaque platform error rather than as an answer the caller can read.
    let resolved: Resolved;

    try {
      resolved = {
        client: this.resolveClient(),
        store: this.resolveStore(),
        defaults: this.resolveDefaults(),
        scheduler: this.resolveScheduler(),
      };
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : 500;
      const code = error instanceof ProviderError ? error.code : "MISCONFIGURED";

      this.logger.error(`Cannot serve postcards: ${describeError(error)}`, stackOf(error));

      return {
        statusCode: status,
        body: { error: { code, message: describeError(error), status } },
      };
    }

    const scheduler = background ? null : resolved.scheduler;

    return handleRequest(resolved.client, resolved.store, params, resolved.defaults, scheduler);
  }

  private resolveClient(): OpenAiClient {
    if (!this.client) {
      const baseUrl = process.env.OPENAI_API_HOST ?? DEFAULT_BASE_URL;
      const model = process.env.POSTCARD_MODEL ?? DEFAULT_MODEL;

      this.client = new OpenAiClient({
        baseUrl,
        apiKey: process.env.OPENAI_API_KEY ?? "",
        model,
      });

      this.logger.log(`Cold start. Drawing postcards with ${model} at ${baseUrl}.`);
    }

    return this.client;
  }

  private resolveStore(): PostcardStore {
    if (!this.store) {
      this.store = this.wiring.store();
    }

    return this.store;
  }

  private resolveDefaults(): Defaults {
    if (!this.defaults) {
      this.defaults = readDefaults();
    }

    return this.defaults;
  }

  private resolveScheduler(): RenderScheduler | null {
    if (this.scheduler === undefined) {
      this.scheduler = this.wiring.scheduler();
    }

    return this.scheduler;
  }
}
