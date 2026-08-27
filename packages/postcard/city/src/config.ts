import { MisconfiguredError } from "./errors";
import type { Defaults } from "./request";
import { parseFormat, parseQuality, parseSize } from "./request";
import type { SchedulerOptions } from "./scheduler";
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
function readPrefix(): string {
  const raw = (process.env.SPACES_PREFIX ?? FALLBACK_PREFIX).trim().replace(/^\/+/, "");

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
    prefix: readPrefix(),
    acl: (process.env.SPACES_ACL ?? "").trim() || FALLBACK_ACL,
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

/**
 * The credentials the platform injects for an action to invoke another. Absent off-platform — the dev
 * server has no activations to schedule — which is why this answers null rather than throwing.
 */
export function readSchedulerOptions(): SchedulerOptions | null {
  const apiHost = (process.env.__OW_API_HOST ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.__OW_API_KEY ?? "").trim();
  const namespace = (process.env.__OW_NAMESPACE ?? "").trim();
  const actionName = readActionName(namespace);

  if (!apiHost || !apiKey || !namespace || !actionName) {
    return null;
  }

  return { apiHost, apiKey, namespace, actionName };
}
