import { describeError, Logger } from "./logger";

export type PlatformCredentials = {
  apiHost: string;
  apiKey: string;
  namespace: string;
  actionName: string;
};

export type WebEndpoint = {
  url: string;
  secret: string;
};

export type SchedulerOptions = {
  platform: PlatformCredentials | null;
  web: WebEndpoint | null;
};

export type Handoff = "activation" | "web";

export class HandoffRefusedError extends Error {
  constructor(refusals: string[]) {
    super(refusals.join("; "));
    this.name = new.target.name;
  }
}

const TIMEOUT_MS = 10_000;

const WEB_GRACE_MS = 2_000;

function wasAbandoned(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;

  return name === "TimeoutError" || name === "AbortError";
}

export class Scheduler {
  private readonly logger = new Logger(Scheduler.name);

  constructor(private readonly options: SchedulerOptions) {}

  async schedule(params: Record<string, unknown>): Promise<Handoff> {
    const refusals: string[] = [];

    if (this.options.platform) {
      try {
        await this.overPlatform(this.options.platform, params);

        return "activation";
      } catch (error) {
        refusals.push(describeError(error));
      }
    } else {
      refusals.push("no platform credentials on board");
    }

    if (this.options.web) {
      try {
        await this.overWeb(this.options.web, params);

        return "web";
      } catch (error) {
        refusals.push(describeError(error));
      }
    } else {
      refusals.push("no public endpoint configured");
    }

    throw new HandoffRefusedError(refusals);
  }

  private async overPlatform(platform: PlatformCredentials, params: Record<string, unknown>): Promise<void> {
    const namespace = encodeURIComponent(platform.namespace);
    const action = platform.actionName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const url = `${platform.apiHost}/api/v1/namespaces/${namespace}/actions/${action}?blocking=false&result=false`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(platform.apiKey).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`could not reach ${url}: ${describeError(error)}`);
    }

    if (!response.ok) {
      throw new Error(`${url} answered ${response.status}`);
    }

    this.logger.log(`Handed the render to a background activation of ${platform.actionName}.`);
  }

  private async overWeb(web: WebEndpoint, params: Record<string, unknown>): Promise<void> {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }

    let response: Response | null = null;

    try {
      response = await fetch(`${web.url}?${query.toString()}`, {
        headers: { Accept: "application/json", "X-Require-Whisk-Auth": web.secret },
        signal: AbortSignal.timeout(WEB_GRACE_MS),
      });
    } catch (error) {
      if (!wasAbandoned(error)) {
        throw new Error(`could not reach ${web.url}: ${describeError(error)}`);
      }
    }

    if (response && !response.ok) {
      throw new Error(`${web.url} answered ${response.status}`);
    }

    this.logger.log(`Handed the render to a second web activation at ${web.url}.`);
  }
}
