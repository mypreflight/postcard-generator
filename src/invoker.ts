import { describeError, Logger } from "./logger";
import { type Credentials, signRequest } from "./sigv4";

const SERVICE = "lambda";

const API_VERSION = "2015-03-31";

const TIMEOUT_MS = 10_000;

const ACCEPTED = 202;

export const DRAW_EVENT = "draw";

export type Handoff = "invocation";

export interface RenderScheduler {
  schedule(params: Record<string, unknown>): Promise<Handoff>;
}

export type DrawEvent = {
  kind: typeof DRAW_EVENT;
  params: Record<string, unknown>;
};

export type LambdaInvokerOptions = {
  endpoint: string;
  region: string;
  functionName: string;
  credentials: () => Credentials;
};

export class LambdaInvoker implements RenderScheduler {
  private readonly logger = new Logger(LambdaInvoker.name);
  private readonly url: string;

  constructor(private readonly options: LambdaInvokerOptions) {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    const name = encodeURIComponent(options.functionName);

    this.url = `${endpoint}/${API_VERSION}/functions/${name}/invocations`;
  }

  async schedule(params: Record<string, unknown>): Promise<Handoff> {
    const event: DrawEvent = { kind: DRAW_EVENT, params };
    const body = JSON.stringify(event);

    const headers = signRequest(
      {
        method: "POST",
        url: this.url,
        region: this.options.region,
        service: SERVICE,
        headers: {
          "content-type": "application/json",
          "x-amz-invocation-type": "Event",
        },
        body,
      },
      this.options.credentials(),
    );

    let response: Response;

    try {
      response = await fetch(this.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`could not reach ${this.url}: ${describeError(error)}`);
    }

    if (response.status !== ACCEPTED) {
      const type = response.headers.get("x-amzn-errortype");

      throw new Error(`${this.url} answered ${response.status}${type ? ` ${type}` : ""}`);
    }

    this.logger.log(`Handed the render to an asynchronous invocation of ${this.options.functionName}.`);

    return "invocation";
  }
}
