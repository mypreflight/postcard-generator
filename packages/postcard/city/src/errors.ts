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

export class SpacesUnavailableError extends ProviderError {
  readonly status = 502;
  readonly code = "SPACES_UNAVAILABLE";

  constructor() {
    super("The postcard was drawn but could not be stored.");
  }
}

export class MisconfiguredError extends ProviderError {
  readonly status = 500;
  readonly code = "MISCONFIGURED";

  constructor(reason: string) {
    super(reason);
  }
}
