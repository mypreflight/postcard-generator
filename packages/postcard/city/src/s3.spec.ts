import { createHash } from "node:crypto";
import { MisconfiguredError, SpacesUnavailableError } from "./errors";
import { S3Client } from "./s3";

const credentials = {
  accessKeyId: "ASIAEXAMPLEKEY000001",
  secretAccessKey: "a-secret",
  sessionToken: "a-session-token",
};

const options = {
  endpoint: "https://mypreflight-postcards.s3.eu-central-1.amazonaws.com",
  publicBaseUrl: "https://postcards.mypreflight.io",
  region: "eu-central-1",
  prefix: "postcards/",
  credentials: () => credentials,
};

const uuid = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const image = Buffer.from("a tiny postcard");

function ok(): Response {
  return new Response(null, { status: 200 });
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = (global.fetch as jest.Mock).mock.calls.at(-1) as [string, RequestInit];

  return { url, init };
}

function headers(): Record<string, string> {
  return lastCall().init.headers as Record<string, string>;
}

describe("S3Client", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(ok());
    jest.useFakeTimers().setSystemTime(new Date("2026-11-07T10:15:30.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("puts the object in the bucket's regional endpoint, under the prefix", async () => {
    await new S3Client(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(lastCall().url).toBe(`https://mypreflight-postcards.s3.eu-central-1.amazonaws.com/postcards/${uuid}.jpg`);
    expect(lastCall().init.method).toBe("PUT");
    expect(headers().host).toBe("mypreflight-postcards.s3.eu-central-1.amazonaws.com");
  });

  it("answers with where readers find the object, behind the public base url", async () => {
    const stored = await new S3Client(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(stored).toEqual({
      key: `postcards/${uuid}.jpg`,
      url: `https://postcards.mypreflight.io/postcards/${uuid}.jpg`,
    });
  });

  it("sends the session token of the role's temporary credentials", async () => {
    await new S3Client(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers()["x-amz-security-token"]).toBe("a-session-token");
  });

  it("asks for no acl, because the bucket owner enforces ownership and refuses one", async () => {
    await new S3Client(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers()).not.toHaveProperty("x-amz-acl");
    expect(headers().Authorization).not.toContain("x-amz-acl");
  });

  it("signs the upload with the role's key, the bucket's region and the s3 service", async () => {
    await new S3Client(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers().Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=ASIAEXAMPLEKEY000001\/20261107\/eu-central-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/,
    );
    expect(headers()["x-amz-date"]).toBe("20261107T101530Z");
  });

  it("declares the content type and the payload hash S3 verifies the body against", async () => {
    await new S3Client(options).store(`${uuid}.png`, image, "image/png");

    expect(headers()["content-type"]).toBe("image/png");
    expect(headers()["x-amz-content-sha256"]).toBe(createHash("sha256").update(image).digest("hex"));
  });

  it("reads the credentials again for every upload, so rotated ones are picked up", async () => {
    const rotating = jest
      .fn()
      .mockReturnValueOnce(credentials)
      .mockReturnValueOnce({ ...credentials, accessKeyId: "ASIAEXAMPLEKEY000002", sessionToken: "a-fresh-token" });
    const client = new S3Client({ ...options, credentials: rotating });

    await client.store(`${uuid}.jpg`, image, "image/jpeg");
    await client.store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers()["x-amz-security-token"]).toBe("a-fresh-token");
    expect(headers().Authorization).toContain("Credential=ASIAEXAMPLEKEY000002/");
  });

  it("signs without a session token when long-lived credentials are configured", async () => {
    const client = new S3Client({ ...options, credentials: () => ({ accessKeyId: "AKIA", secretAccessKey: "s" }) });

    await client.store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers()).not.toHaveProperty("x-amz-security-token");
  });

  it("reports missing credentials as misconfiguration rather than as an unreachable bucket", async () => {
    const client = new S3Client({
      ...options,
      credentials: () => {
        throw new MisconfiguredError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set.");
      },
    });

    await expect(client.store(`${uuid}.jpg`, image, "image/jpeg")).rejects.toThrow(MisconfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports a refused upload rather than pretending it was stored", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response("<Error><Code>AccessControlListNotSupported</Code></Error>", { status: 400 }));

    await expect(new S3Client(options).store(`${uuid}.jpg`, image, "image/jpeg")).rejects.toThrow(
      SpacesUnavailableError,
    );
  });

  it("retries once before giving up on an unreachable bucket", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const store = new S3Client(options).store(`${uuid}.jpg`, image, "image/jpeg");
    const settled = expect(store).rejects.toThrow(SpacesUnavailableError);

    await jest.advanceTimersByTimeAsync(1_000);
    await settled;

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
