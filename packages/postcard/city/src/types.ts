export const QUALITIES = ["auto", "low", "medium", "high"] as const;

export const FORMATS = ["jpeg", "png"] as const;

export type Quality = (typeof QUALITIES)[number];

export type Format = (typeof FORMATS)[number];

export const CONTINENTS = [
  "Africa",
  "Antarctica",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
] as const;

export type Continent = (typeof CONTINENTS)[number];

export type PostcardRequest = {
  city: string;
  country: string;
  continent: Continent;
  uuid: string;
  size: string;
  quality: Quality;
  format: Format;
  compression: number;
};

export type RenderedImage = {
  base64: string;
  bytes: number;
};

export type StoredObject = {
  key: string;
  url: string;
};

export type Postcard = {
  city: string;
  country: string;
  continent: Continent;
  uuid: string;
  model: string;
  size: string;
  quality: Quality;
  format: Format;
  contentType: string;
  bytes: number;
  prompt: string;
  key: string;
  url: string;
};

export const CONTENT_TYPES: Record<Format, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
};

export const EXTENSIONS: Record<Format, string> = {
  jpeg: "jpg",
  png: "png",
};
