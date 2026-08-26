export const QUALITIES = ["auto", "low", "medium", "high"] as const;

export const FORMATS = ["jpeg", "png"] as const;

export type Quality = (typeof QUALITIES)[number];

export type Format = (typeof FORMATS)[number];

export type PostcardRequest = {
  city: string;
  size: string;
  quality: Quality;
  format: Format;
  compression: number;
};

export type RenderedImage = {
  base64: string;
  bytes: number;
};

export type Postcard = {
  city: string;
  model: string;
  size: string;
  quality: Quality;
  format: Format;
  contentType: string;
  bytes: number;
  prompt: string;
  image: string;
};

export const CONTENT_TYPES: Record<Format, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
};
