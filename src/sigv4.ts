import { createHash, createHmac } from "node:crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";

const TERMINATOR = "aws4_request";

const SINGLE_ENCODED_SERVICE = "s3";

export type Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type SignableRequest = {
  method: string;
  url: string;
  region: string;
  service: string;
  headers: Record<string, string>;
  body: Buffer | string;
};

export function sha256Hex(payload: Buffer | string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(pathname: string, service: string): string {
  if (service === SINGLE_ENCODED_SERVICE) {
    return pathname;
  }

  return pathname
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

function canonicalQuery(search: URLSearchParams): string {
  return [...search.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort(([keyA, valueA], [keyB, valueB]) => compare(keyA, keyB) || compare(valueA, valueB))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function timestamp(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

function signingKey(secretAccessKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);

  return hmac(kService, TERMINATOR);
}

export function signRequest(
  request: SignableRequest,
  credentials: Credentials,
  now: Date = new Date(),
): Record<string, string> {
  const { host, pathname, searchParams } = new URL(request.url);
  const stamp = timestamp(now);
  const date = stamp.slice(0, 8);

  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(request.headers)) {
    headers[name.toLowerCase()] = value;
  }

  headers.host = host;
  headers["x-amz-date"] = stamp;

  if (credentials.sessionToken) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const payloadHash = headers["x-amz-content-sha256"] ?? sha256Hex(request.body);

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [
    request.method.toUpperCase(),
    canonicalPath(pathname, request.service),
    canonicalQuery(searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${request.region}/${request.service}/${TERMINATOR}`;
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const key = signingKey(credentials.secretAccessKey, date, request.region, request.service);
  const signature = hmac(key, stringToSign).toString("hex");

  const signed: Record<string, string> = {};

  for (const name of names) {
    signed[name] = headers[name];
  }

  return {
    ...signed,
    Authorization:
      `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
