export abstract class ProviderError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends ProviderError {
  readonly status = 400;
  readonly code = "BAD_REQUEST";
}

export class PostcardRejectedError extends ProviderError {
  readonly status = 422;
  readonly code = "POSTCARD_REJECTED";

  constructor(reason: string) {
    super(`OpenAI refused to draw this postcard: ${reason}`);
  }
}

export class OpenAiRateLimitedError extends ProviderError {
  readonly status = 429;
  readonly code = "OPENAI_RATE_LIMITED";

  constructor() {
    super("OpenAI is rate limiting image generation.");
  }
}

export class OpenAiUnavailableError extends ProviderError {
  readonly status = 502;
  readonly code = "OPENAI_UNAVAILABLE";

  constructor() {
    super("OpenAI is unavailable.");
  }
}

export class PostcardUnreadableError extends ProviderError {
  readonly status = 502;
  readonly code = "POSTCARD_UNREADABLE";

  constructor() {
    super("OpenAI answered without a usable image payload.");
  }
}

export class PostcardTooLargeError extends ProviderError {
  readonly status = 502;
  readonly code = "POSTCARD_TOO_LARGE";

  constructor(bytes: number, limit: number) {
    super(
      `The encoded postcard is ${bytes} bytes and a function result may not exceed ${limit}. ` +
        "Ask for a smaller size, or for format=jpeg with a lower POSTCARD_COMPRESSION.",
    );
  }
}
