import { MisconfiguredError } from "./errors";
import type { LambdaInvokerOptions } from "./invoker";
import type { Defaults } from "./request";
import { parseFormat, parseQuality, parseSize } from "./request";
import type { S3ClientOptions } from "./s3";
import type { PlatformCredentials, SchedulerOptions, WebEndpoint } from "./scheduler";
import type { Credentials } from "./sigv4";
import type { SpacesClientOptions } from "./spaces";

const FALLBACK_SIZE = "1152x1536";

const FALLBACK_QUALITY = "high";

const FALLBACK_FORMAT = "jpeg";

const FALLBACK_COMPRESSION = 80;

const FALLBACK_REGION = "fra1";

const FALLBACK_PREFIX = "postcards/";

const FALLBACK_ACL = "public-read";

function readCompression(): number {
  const raw = (process.env.POSTCARD_COMPRESSION ?? "").trim();

  if (!raw) {
    return FALLBACK_COMPRESSION;
  }

  const compression = Number(raw);

  if (!Number.isInteger(compression) || compression < 1 || compression > 100) {
    throw new Error(`POSTCARD_COMPRESSION must be an integer between 1 and 100, got "${raw}".`);
  }

  return compression;
}

export function readDefaults(): Defaults {
  return {
    size: parseSize(process.env.POSTCARD_SIZE, FALLBACK_SIZE),
    quality: parseQuality(process.env.POSTCARD_QUALITY, FALLBACK_QUALITY),
    format: parseFormat(process.env.POSTCARD_FORMAT, FALLBACK_FORMAT),
    compression: readCompression(),
  };
}

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();

  if (!value) {
    throw new MisconfiguredError(`${name} must be set for the postcard to be stored.`);
  }

  return value;
}

/** Leaves the prefix either empty or ending in a single slash, so keys never gain a stray one. */
function readPrefix(name: string): string {
  const raw = (process.env[name] ?? FALLBACK_PREFIX).trim().replace(/^\/+/, "");

  if (!raw) {
    return "";
  }

  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function readSpacesOptions(): SpacesClientOptions {
  const bucket = required("SPACES_BUCKET");
  const region = (process.env.SPACES_REGION ?? "").trim() || FALLBACK_REGION;
  const endpoint = (process.env.SPACES_ENDPOINT ?? "").trim() || `https://${bucket}.${region}.digitaloceanspaces.com`;

  return {
    endpoint,
    publicBaseUrl: (process.env.SPACES_PUBLIC_BASE_URL ?? "").trim() || endpoint,
    region,
    accessKey: required("SPACES_KEY"),
    secretKey: required("SPACES_SECRET"),
    prefix: readPrefix("SPACES_PREFIX"),
    acl: (process.env.SPACES_ACL ?? "").trim() || FALLBACK_ACL,
  };
}

export function readAwsCredentials(): Credentials {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY ?? "").trim();
  const sessionToken = (process.env.AWS_SESSION_TOKEN ?? "").trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new MisconfiguredError(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set for the function to reach AWS.",
    );
  }

  return sessionToken ? { accessKeyId, secretAccessKey, sessionToken } : { accessKeyId, secretAccessKey };
}

function readAwsRegion(): string {
  return (process.env.AWS_REGION ?? "").trim();
}

export function readS3Options(): S3ClientOptions {
  const bucket = required("S3_BUCKET");
  const region = (process.env.S3_REGION ?? "").trim() || readAwsRegion();

  if (!region) {
    throw new MisconfiguredError("S3_REGION or AWS_REGION must be set for the postcard to be stored.");
  }

  const endpoint = (process.env.S3_ENDPOINT ?? "").trim() || `https://${bucket}.s3.${region}.amazonaws.com`;

  return {
    endpoint,
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL ?? "").trim() || endpoint,
    region,
    prefix: readPrefix("S3_PREFIX"),
    credentials: readAwsCredentials,
  };
}

export function readLambdaInvokerOptions(): LambdaInvokerOptions | null {
  const functionName = (process.env.AWS_LAMBDA_FUNCTION_NAME ?? "").trim();
  const region = readAwsRegion();

  if (!functionName || !region) {
    return null;
  }

  return {
    endpoint: (process.env.LAMBDA_ENDPOINT ?? "").trim() || `https://lambda.${region}.amazonaws.com`,
    region,
    functionName,
    credentials: readAwsCredentials,
  };
}

/** Strips the namespace the platform prefixes the action name with, leaving `package/action`. */
function readActionName(namespace: string): string {
  const actionName = (process.env.__OW_ACTION_NAME ?? "").trim();
  const prefix = `/${namespace}/`;

  if (actionName.startsWith(prefix)) {
    return actionName.slice(prefix.length);
  }

  return actionName.replace(/^\/+/, "");
}

function readPlatformCredentials(): PlatformCredentials | null {
  const apiHost = (process.env.__OW_API_HOST ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.__OW_API_KEY ?? "").trim();
  const namespace = (process.env.__OW_NAMESPACE ?? "").trim();
  const actionName = readActionName(namespace);

  if (!apiHost || !apiKey || !namespace || !actionName) {
    return null;
  }

  return { apiHost, apiKey, namespace, actionName };
}

function readWebEndpoint(): WebEndpoint | null {
  const url = (process.env.POSTCARD_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (process.env.POSTCARD_FUNCTION_SECRET ?? "").trim();

  if (!url || !secret) {
    return null;
  }

  return { url, secret };
}

export function readSchedulerOptions(): SchedulerOptions | null {
  const platform = readPlatformCredentials();
  const web = readWebEndpoint();

  if (!platform && !web) {
    return null;
  }

  return { platform, web };
}
