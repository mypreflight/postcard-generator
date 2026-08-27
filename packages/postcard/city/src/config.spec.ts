import { readDefaults, readSchedulerOptions, readSpacesOptions } from "./config";

const KEYS = [
  "POSTCARD_SIZE",
  "POSTCARD_QUALITY",
  "POSTCARD_FORMAT",
  "POSTCARD_COMPRESSION",
  "SPACES_BUCKET",
  "SPACES_REGION",
  "SPACES_ENDPOINT",
  "SPACES_PUBLIC_BASE_URL",
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
      publicBaseUrl: "https://mypreflight-postcards.fra1.digitaloceanspaces.com",
      region: "fra1",
      accessKey: "key",
      secretKey: "secret",
      prefix: "postcards/",
      acl: "public-read",
    });
  });

  it("points readers at the public base url while still signing against the bucket", () => {
    process.env.SPACES_PUBLIC_BASE_URL = "https://postcards.mypreflight.io";

    expect(readSpacesOptions()).toMatchObject({
      endpoint: "https://mypreflight-postcards.fra1.digitaloceanspaces.com",
      publicBaseUrl: "https://postcards.mypreflight.io",
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

describe("readSchedulerOptions", () => {
  const original = { ...process.env };

  const platform = ["__OW_API_HOST", "__OW_API_KEY", "__OW_NAMESPACE", "__OW_ACTION_NAME"];

  beforeEach(() => {
    for (const key of platform) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = original;
  });

  function onPlatform(): void {
    process.env.__OW_API_HOST = "https://faas-fra1-a1b2c3d4.doserverless.co/";
    process.env.__OW_API_KEY = "id:secret";
    process.env.__OW_NAMESPACE = "fn-0123";
    process.env.__OW_ACTION_NAME = "/fn-0123/postcard/city";
  }

  it("answers nothing off the platform, so a render is not handed to an activation that cannot exist", () => {
    expect(readSchedulerOptions()).toBeNull();
  });

  it("reads the credentials the platform injects", () => {
    onPlatform();

    expect(readSchedulerOptions()).toEqual({
      apiHost: "https://faas-fra1-a1b2c3d4.doserverless.co",
      apiKey: "id:secret",
      namespace: "fn-0123",
      actionName: "postcard/city",
    });
  });

  it("leaves an action name that carries no namespace alone", () => {
    onPlatform();
    process.env.__OW_ACTION_NAME = "postcard/city";

    expect(readSchedulerOptions()).toMatchObject({ actionName: "postcard/city" });
  });

  it.each(platform)("answers nothing when %s is missing", (missing) => {
    onPlatform();
    delete process.env[missing];

    expect(readSchedulerOptions()).toBeNull();
  });
});
