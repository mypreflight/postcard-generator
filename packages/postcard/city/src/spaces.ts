import { createHash, createHmac } from "node:crypto";
import { SpacesUnavailableError } from "./errors";
import { describeError, Logger } from "./logger";
import type { StoredObject } from "./types";

const ALGORITHM = "AWS4-HMAC-SHA256";

const SERVICE = "s3";

const TERMINATOR = "aws4_request";

const TIMEOUT_MS = 60_000;

const RETRIES = 1;

const BACKOFF_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SpacesClientOptions = {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  prefix: string;
  acl: string;
};

export class SpacesClient {
  private readonly logger = new Logger(SpacesClient.name);
  private readonly endpoint: string;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly prefix: string;
  private readonly acl: string;

  constructor(options: SpacesClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.region = options.region;
    this.accessKey = options.accessKey;
    this.secretKey = options.secretKey;
    this.prefix = options.prefix;
    this.acl = options.acl;
  }

  async store(name: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const key = `${this.prefix}${name}`;
    const url = `${this.endpoint}/${encodeKey(key)}`;
    const startedAt = Date.now();

    const response = await this.putWithRetry(url, body, contentType);

    if (!response.ok) {
      this.logger.error(`Spaces answered ${response.status} for ${key}: ${await this.readBody(response)}`);

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
      try {
        return await fetch(url, {
          method: "PUT",
          headers: this.sign(url, body, contentType),
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

  /**
   * Signs the upload the way S3 expects, so Spaces accepts it without an SDK on board.
   * https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
   */
  private sign(url: string, body: Buffer, contentType: string): Record<string, string> {
    const { host, pathname } = new URL(url);
    const now = new Date();
    const stamp = `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
    const date = stamp.slice(0, 8);
    const payloadHash = sha256Hex(body);

    const headers: Record<string, string> = {
      "content-type": contentType,
      host,
      "x-amz-acl": this.acl,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": stamp,
    };

    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
    const signedHeaders = names.join(";");

    const canonicalRequest = ["PUT", pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

    const scope = `${date}/${this.region}/${SERVICE}/${TERMINATOR}`;
    const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join("\n");
    const signature = hmac(this.signingKey(date), stringToSign).toString("hex");

    return {
      ...headers,
      Authorization:
        `${ALGORITHM} Credential=${this.accessKey}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  private signingKey(date: string): Buffer {
    const kDate = hmac(`AWS4${this.secretKey}`, date);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, SERVICE);

    return hmac(kService, TERMINATOR);
  }
}

function sha256Hex(payload: Buffer | string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** Encodes each segment the way S3 canonicalises a path, leaving the separators alone. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`),
    )
    .join("/");
}
