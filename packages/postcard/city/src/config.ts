import type { Defaults } from "./request";
import { parseFormat, parseQuality, parseSize } from "./request";

const FALLBACK_SIZE = "1152x1536";

const FALLBACK_QUALITY = "high";

const FALLBACK_FORMAT = "jpeg";

const FALLBACK_COMPRESSION = 80;

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
