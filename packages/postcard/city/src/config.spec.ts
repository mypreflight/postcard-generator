import {
  readAwsCredentials,
  readDefaults,
  readLambdaInvokerOptions,
  readS3Options,
  readSchedulerOptions,
  readSpacesOptions,
} from "./config";

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

  const web = ["POSTCARD_PUBLIC_URL", "POSTCARD_FUNCTION_SECRET"];

  beforeEach(() => {
    for (const key of [...platform, ...web]) {
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

  function reachablePublicly(): void {
    process.env.POSTCARD_PUBLIC_URL = "https://mypreflight.ondigitalocean.app/postcard-generator/postcard/city/";
    process.env.POSTCARD_FUNCTION_SECRET = "shared-secret";
  }

  it("answers nothing when a render can be handed neither to an activation nor to itself", () => {
    expect(readSchedulerOptions()).toBeNull();
  });

  it("reads the credentials the platform injects", () => {
    onPlatform();

    expect(readSchedulerOptions()).toEqual({
      platform: {
        apiHost: "https://faas-fra1-a1b2c3d4.doserverless.co",
        apiKey: "id:secret",
        namespace: "fn-0123",
        actionName: "postcard/city",
      },
      web: null,
    });
  });

  it("reads the endpoint this action can call itself on, without the trailing slash", () => {
    reachablePublicly();

    expect(readSchedulerOptions()).toEqual({
      platform: null,
      web: {
        url: "https://mypreflight.ondigitalocean.app/postcard-generator/postcard/city",
        secret: "shared-secret",
      },
    });
  });

  it("leaves an action name that carries no namespace alone", () => {
    onPlatform();
    process.env.__OW_ACTION_NAME = "postcard/city";

    expect(readSchedulerOptions()).toMatchObject({ platform: { actionName: "postcard/city" } });
  });

  it.each(platform)("keeps no platform credentials when %s is missing", (missing) => {
    onPlatform();
    delete process.env[missing];

    expect(readSchedulerOptions()).toBeNull();
  });

  it.each(web)("keeps no public endpoint when %s is missing", (missing) => {
    reachablePublicly();
    delete process.env[missing];

    expect(readSchedulerOptions()).toBeNull();
  });

  it("keeps both ways when the platform injected credentials and the endpoint is configured", () => {
    onPlatform();
    reachablePublicly();

    const options = readSchedulerOptions();

    expect(options?.platform).not.toBeNull();
    expect(options?.web).not.toBeNull();
  });
});

const AWS_KEYS = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_PUBLIC_BASE_URL",
  "S3_PREFIX",
  "LAMBDA_ENDPOINT",
  "AWS_REGION",
  "AWS_LAMBDA_FUNCTION_NAME",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
];

describe("readS3Options", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const key of AWS_KEYS) {
      delete process.env[key];
    }

    process.env.S3_BUCKET = "mypreflight-postcards";
    process.env.AWS_REGION = "eu-central-1";
  });

  afterAll(() => {
    process.env = original;
  });

  it("derives the regional bucket endpoint from the bucket and the region the function runs in", () => {
    expect(readS3Options()).toEqual({
      endpoint: "https://mypreflight-postcards.s3.eu-central-1.amazonaws.com",
      publicBaseUrl: "https://mypreflight-postcards.s3.eu-central-1.amazonaws.com",
      region: "eu-central-1",
      prefix: "postcards/",
      credentials: readAwsCredentials,
    });
  });

  it("follows a configured bucket region over the region the function runs in", () => {
    process.env.S3_REGION = "eu-west-1";

    expect(readS3Options()).toMatchObject({
      endpoint: "https://mypreflight-postcards.s3.eu-west-1.amazonaws.com",
      region: "eu-west-1",
    });
  });

  it("points readers at the public base url while still signing against the bucket", () => {
    process.env.S3_PUBLIC_BASE_URL = "https://postcards.mypreflight.io";

    expect(readS3Options()).toMatchObject({
      endpoint: "https://mypreflight-postcards.s3.eu-central-1.amazonaws.com",
      publicBaseUrl: "https://postcards.mypreflight.io",
    });
  });

  it("lets an endpoint be pointed elsewhere, so a mock can stand a bucket in", () => {
    process.env.S3_ENDPOINT = "http://openai-mock:1080/mypreflight-postcards";

    expect(readS3Options()).toMatchObject({ endpoint: "http://openai-mock:1080/mypreflight-postcards" });
  });

  it.each([
    ["postcards", "postcards/"],
    ["/postcards", "postcards/"],
    ["", ""],
  ])("normalises a prefix of %p to %p", (configured, expected) => {
    process.env.S3_PREFIX = configured;

    expect(readS3Options()).toMatchObject({ prefix: expected });
  });

  it("fails loudly without S3_BUCKET", () => {
    delete process.env.S3_BUCKET;

    expect(() => readS3Options()).toThrow(/S3_BUCKET/);
  });

  it("fails loudly without any region", () => {
    delete process.env.AWS_REGION;

    expect(() => readS3Options()).toThrow(/S3_REGION or AWS_REGION/);
  });

  it("reads no Spaces configuration", () => {
    process.env.SPACES_ENDPOINT = "http://openai-mock:1080/mypreflight-postcards";
    process.env.SPACES_PREFIX = "spaces/";

    expect(readS3Options()).toMatchObject({
      endpoint: "https://mypreflight-postcards.s3.eu-central-1.amazonaws.com",
      prefix: "postcards/",
    });
  });
});

describe("readAwsCredentials", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const key of AWS_KEYS) {
      delete process.env[key];
    }

    process.env.AWS_ACCESS_KEY_ID = "ASIAEXAMPLEKEY000001";
    process.env.AWS_SECRET_ACCESS_KEY = "a-secret";
  });

  afterAll(() => {
    process.env = original;
  });

  it("reads the temporary credentials the runtime injects, session token included", () => {
    process.env.AWS_SESSION_TOKEN = "a-session-token";

    expect(readAwsCredentials()).toEqual({
      accessKeyId: "ASIAEXAMPLEKEY000001",
      secretAccessKey: "a-secret",
      sessionToken: "a-session-token",
    });
  });

  it("carries no session token when none is set", () => {
    expect(readAwsCredentials()).toEqual({ accessKeyId: "ASIAEXAMPLEKEY000001", secretAccessKey: "a-secret" });
  });

  it.each(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"])("fails loudly without %s", (key) => {
    delete process.env[key];

    expect(() => readAwsCredentials()).toThrow(/AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY/);
  });
});

describe("readLambdaInvokerOptions", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const key of AWS_KEYS) {
      delete process.env[key];
    }

    process.env.AWS_REGION = "eu-central-1";
    process.env.AWS_LAMBDA_FUNCTION_NAME = "postcard-city";
  });

  afterAll(() => {
    process.env = original;
  });

  it("invokes the function it runs as, in the region it runs in", () => {
    expect(readLambdaInvokerOptions()).toEqual({
      endpoint: "https://lambda.eu-central-1.amazonaws.com",
      region: "eu-central-1",
      functionName: "postcard-city",
      credentials: readAwsCredentials,
    });
  });

  it("lets the endpoint be pointed elsewhere, so a mock can stand Lambda in", () => {
    process.env.LAMBDA_ENDPOINT = "http://openai-mock:1080";

    expect(readLambdaInvokerOptions()).toMatchObject({ endpoint: "http://openai-mock:1080" });
  });

  it.each(["AWS_LAMBDA_FUNCTION_NAME", "AWS_REGION"])(
    "answers nothing outside Lambda, where %s is missing, so renders happen while the caller waits",
    (key) => {
      delete process.env[key];

      expect(readLambdaInvokerOptions()).toBeNull();
    },
  );
});
