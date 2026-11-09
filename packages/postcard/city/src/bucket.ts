import { SpacesUnavailableError } from "./errors";
import { describeError, Logger } from "./logger";
import { encodeRfc3986 } from "./sigv4";
import type { PostcardStore, StoredObject } from "./types";

const TIMEOUT_MS = 60_000;

const RETRIES = 1;

const BACKOFF_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type BucketLocation = {
  endpoint: string;
  publicBaseUrl: string;
  prefix: string;
};

export abstract class BucketClient implements PostcardStore {
  protected readonly logger = new Logger(this.constructor.name);
  private readonly endpoint: string;
  private readonly publicBaseUrl: string;
  private readonly prefix: string;

  protected constructor(
    location: BucketLocation,
    private readonly provider: string,
  ) {
    this.endpoint = location.endpoint.replace(/\/+$/, "");
    this.publicBaseUrl = location.publicBaseUrl.replace(/\/+$/, "");
    this.prefix = location.prefix;
  }

  protected abstract sign(url: string, body: Buffer, contentType: string): Record<string, string>;

  /**
   * Where an object will land, known before it is drawn because the caller names it. The upload is signed
   * against the bucket endpoint, while readers are pointed at the public base url, which may be a CNAME.
   */
  locate(name: string): StoredObject {
    const key = `${this.prefix}${name}`;

    return { key, url: `${this.publicBaseUrl}/${encodeKey(key)}` };
  }

  async store(name: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const { key, url } = this.locate(name);
    const uploadUrl = `${this.endpoint}/${encodeKey(key)}`;
    const startedAt = Date.now();

    const response = await this.putWithRetry(uploadUrl, body, contentType);

    if (!response.ok) {
      this.logger.error(`${this.provider} answered ${response.status} for ${key}: ${await this.readBody(response)}`);

      throw new SpacesUnavailableError();
    }

    this.logger.log(`Stored ${key} as ${body.byteLength} bytes in ${Date.now() - startedAt}ms.`);

    return { key, url };
  }

  private async readBody(response: Response): Promise<string> {
    try {
      return (await response.text()).slice(0, 500);
    } catch {
      return "no body";
    }
  }

  private async putWithRetry(url: string, body: Buffer, contentType: string): Promise<Response> {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const headers = this.sign(url, body, contentType);

      try {
        return await fetch(url, {
          method: "PUT",
          headers,
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt === RETRIES) {
          this.logger.error(`Could not reach ${url} in ${RETRIES + 1} attempts: ${describeError(error)}`);

          throw new SpacesUnavailableError();
        }

        const backoff = BACKOFF_MS * 2 ** attempt;
        this.logger.warn(
          `Attempt ${attempt + 1} to reach ${url} failed: ${describeError(error)}. Retrying in ${backoff}ms.`,
        );

        await delay(backoff);
      }
    }

    throw new SpacesUnavailableError();
  }
}

/** Encodes each segment the way S3 canonicalises a path, leaving the separators alone. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}
