import { describeError, Logger } from "./logger";

export type SchedulerOptions = {
  apiHost: string;
  apiKey: string;
  namespace: string;
  actionName: string;
};

const TIMEOUT_MS = 10_000;

/**
 * Hands the render to a second activation of this very action, so the caller is answered at once.
 * A resolved handler ends the activation on this platform, so work cannot outlive a response
 * that has already been sent — it has to happen somewhere else.
 * https://docs.digitalocean.com/products/functions/reference/runtimes/node-js/
 */
export class Scheduler {
  private readonly logger = new Logger(Scheduler.name);

  constructor(private readonly options: SchedulerOptions) {}

  async schedule(params: Record<string, unknown>): Promise<void> {
    const namespace = encodeURIComponent(this.options.namespace);
    const action = this.options.actionName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const url = `${this.options.apiHost}/api/v1/namespaces/${namespace}/actions/${action}?blocking=false&result=false`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(this.options.apiKey).toString("base64")}`,
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

    this.logger.log(`Handed the render to a background activation of ${this.options.actionName}.`);
  }
}
