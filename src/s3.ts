import { StorageUnavailableError } from "./errors";
import { describeError, Logger } from "./logger";
import { type Credentials, encodeRfc3986, sha256Hex, signRequest } from "./sigv4";
import type { PostcardStore, StoredObject } from "./types";

const SERVICE = "s3";

const TIMEOUT_MS = 60_000;

const RETRIES = 1;

const BACKOFF_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type S3ClientOptions = {
  endpoint: string;
  publicBaseUrl: string;
  region: string;
  prefix: string;
  credentials: () => Credentials;
};

export class S3Client implements PostcardStore {
  private readonly logger = new Logger(S3Client.name);
  private readonly endpoint: string;
  private readonly publicBaseUrl: string;
  private readonly prefix: string;
  private readonly region: string;
  private readonly credentials: () => Credentials;

  constructor(options: S3ClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, "");
    this.prefix = options.prefix;
    this.region = options.region;
    this.credentials = options.credentials;
  }

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
      this.logger.error(`S3 answered ${response.status} for ${key}: ${await this.readBody(response)}`);

      throw new StorageUnavailableError();
    }

    this.logger.log(`Stored ${key} as ${body.byteLength} bytes in ${Date.now() - startedAt}ms.`);

    return { key, url };
  }

  private sign(url: string, body: Buffer, contentType: string): Record<string, string> {
    return signRequest(
      {
        method: "PUT",
        url,
        region: this.region,
        service: SERVICE,
        headers: {
          "content-type": contentType,
          "x-amz-content-sha256": sha256Hex(body),
        },
        body,
      },
      this.credentials(),
    );
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

          throw new StorageUnavailableError();
        }

        const backoff = BACKOFF_MS * 2 ** attempt;
        this.logger.warn(
          `Attempt ${attempt + 1} to reach ${url} failed: ${describeError(error)}. Retrying in ${backoff}ms.`,
        );

        await delay(backoff);
      }
    }

    throw new StorageUnavailableError();
  }
}

/** Encodes each segment the way S3 canonicalises a path, leaving the separators alone. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}
