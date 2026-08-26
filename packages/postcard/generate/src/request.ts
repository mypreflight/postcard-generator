import { BadRequestError } from "./errors";
import { FORMATS, type Format, type PostcardRequest, QUALITIES, type Quality } from "./types";

export type RequestParams = {
  city?: string;
  size?: string;
  quality?: string;
  format?: string;
};

export type Defaults = {
  size: string;
  quality: Quality;
  format: Format;
  compression: number;
};

const MAX_CITY_LENGTH = 64;

const MAX_CITY_WORDS = 5;

const CITY_PATTERN = /^[\p{Script=Latin}\p{Mark}0-9 .'’-]+$/u;

const SIZE_PATTERN = /^(\d{3,4})x(\d{3,4})$/;

const SIZE_STEP = 16;

const MIN_SIDE = 256;

const MAX_SIDE = 3840;

const MAX_PIXELS = 3840 * 2160;

const MAX_ASPECT_RATIO = 3;

export function parseCity(value: string | undefined): string {
  const city = (value ?? "").trim();

  if (!city) {
    throw new BadRequestError("Parameter city is required.");
  }

  if (city.length > MAX_CITY_LENGTH) {
    throw new BadRequestError(`Parameter city may not exceed ${MAX_CITY_LENGTH} characters.`);
  }

  if (!CITY_PATTERN.test(city)) {
    throw new BadRequestError("Parameter city may only contain Latin letters, digits, spaces, apostrophes and dots.");
  }

  if (city.split(/\s+/).length > MAX_CITY_WORDS) {
    throw new BadRequestError(
      `Parameter city is a city name, not a sentence, so it may not exceed ${MAX_CITY_WORDS} words.`,
    );
  }

  return city;
}

export function parseSize(value: string | undefined, fallback: string): string {
  const size = (value ?? "").trim() || fallback;
  const match = SIZE_PATTERN.exec(size);

  if (!match) {
    throw new BadRequestError(`Parameter size must look like 1152x1536, got "${size}".`);
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (width % SIZE_STEP !== 0 || height % SIZE_STEP !== 0) {
    throw new BadRequestError(`Parameter size must have both sides divisible by ${SIZE_STEP}, got "${size}".`);
  }

  if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) {
    throw new BadRequestError(
      `Parameter size must keep both sides between ${MIN_SIDE} and ${MAX_SIDE}, got "${size}".`,
    );
  }

  if (width * height > MAX_PIXELS) {
    throw new BadRequestError(`Parameter size may not exceed ${MAX_PIXELS} pixels, got "${size}".`);
  }

  const ratio = Math.max(width / height, height / width);

  if (ratio > MAX_ASPECT_RATIO) {
    throw new BadRequestError(`Parameter size must stay within a 1:3 to 3:1 aspect ratio, got "${size}".`);
  }

  return size;
}

export function parseQuality(value: string | undefined, fallback: Quality): Quality {
  const quality = (value ?? "").trim().toLowerCase() || fallback;

  if (!QUALITIES.includes(quality as Quality)) {
    throw new BadRequestError(`Parameter quality must be one of ${QUALITIES.join(", ")}, got "${quality}".`);
  }

  return quality as Quality;
}

export function parseFormat(value: string | undefined, fallback: Format): Format {
  const format = (value ?? "").trim().toLowerCase() || fallback;

  if (!FORMATS.includes(format as Format)) {
    throw new BadRequestError(`Parameter format must be one of ${FORMATS.join(", ")}, got "${format}".`);
  }

  return format as Format;
}

export function parseRequest(params: RequestParams, defaults: Defaults): PostcardRequest {
  return {
    city: parseCity(params.city),
    size: parseSize(params.size, defaults.size),
    quality: parseQuality(params.quality, defaults.quality),
    format: parseFormat(params.format, defaults.format),
    compression: defaults.compression,
  };
}
