import { readDefaults, readSpacesOptions } from "./config";

const KEYS = [
  "POSTCARD_SIZE",
  "POSTCARD_QUALITY",
  "POSTCARD_FORMAT",
  "POSTCARD_COMPRESSION",
  "SPACES_BUCKET",
  "SPACES_REGION",
  "SPACES_ENDPOINT",
  "SPACES_KEY",
  "SPACES_SECRET",
  "SPACES_PREFIX",
  "SPACES_ACL",
];

describe("readDefaults", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const key of KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = original;
  });

  it("falls back to a 3:4 jpeg poster when nothing is configured", () => {
    expect(readDefaults()).toEqual({ size: "1152x1536", quality: "high", format: "jpeg", compression: 80 });
  });

  it("reads every default from the environment", () => {
    process.env.POSTCARD_SIZE = "1024x1024";
    process.env.POSTCARD_QUALITY = "low";
    process.env.POSTCARD_FORMAT = "png";
    process.env.POSTCARD_COMPRESSION = "50";

    expect(readDefaults()).toEqual({ size: "1024x1024", quality: "low", format: "png", compression: 50 });
  });

  it("fails loudly on a misconfigured size rather than drawing the wrong thing", () => {
    process.env.POSTCARD_SIZE = "1000x1500";

    expect(() => readDefaults()).toThrow();
  });

  it.each(["0", "101", "eighty", "80.5"])("fails loudly on a compression of %p", (compression) => {
    process.env.POSTCARD_COMPRESSION = compression;

    expect(() => readDefaults()).toThrow(/POSTCARD_COMPRESSION/);
  });
});

describe("readSpacesOptions", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const key of KEYS) {
      delete process.env[key];
    }

    process.env.SPACES_BUCKET = "mypreflight-postcards";
    process.env.SPACES_KEY = "key";
    process.env.SPACES_SECRET = "secret";
  });

  afterAll(() => {
    process.env = original;
  });

  it("derives the bucket endpoint from the bucket and the region", () => {
    expect(readSpacesOptions()).toEqual({
      endpoint: "https://mypreflight-postcards.fra1.digitaloceanspaces.com",
      region: "fra1",
      accessKey: "key",
      secretKey: "secret",
      prefix: "postcards/",
      acl: "public-read",
    });
  });

  it("follows the configured region into the endpoint", () => {
    process.env.SPACES_REGION = "ams3";

    expect(readSpacesOptions()).toMatchObject({
      endpoint: "https://mypreflight-postcards.ams3.digitaloceanspaces.com",
      region: "ams3",
    });
  });

  it("lets an endpoint be pointed elsewhere, so the suite can stand a bucket in", () => {
    process.env.SPACES_ENDPOINT = "http://openai-mock:1080/mypreflight-postcards";

    expect(readSpacesOptions()).toMatchObject({ endpoint: "http://openai-mock:1080/mypreflight-postcards" });
  });

  it.each([
    ["postcards", "postcards/"],
    ["postcards/", "postcards/"],
    ["/postcards", "postcards/"],
    ["a/b", "a/b/"],
    ["", ""],
  ])("normalises a prefix of %p to %p", (configured, expected) => {
    process.env.SPACES_PREFIX = configured;

    expect(readSpacesOptions()).toMatchObject({ prefix: expected });
  });

  it.each(["SPACES_BUCKET", "SPACES_KEY", "SPACES_SECRET"])("fails loudly without %s", (key) => {
    delete process.env[key];

    expect(() => readSpacesOptions()).toThrow(new RegExp(key));
  });
});
