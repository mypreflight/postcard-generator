import { createHash } from "node:crypto";
import { SpacesUnavailableError } from "./errors";
import { SpacesClient } from "./spaces";

const options = {
  endpoint: "https://mypreflight-postcards.fra1.digitaloceanspaces.com",
  publicBaseUrl: "https://mypreflight-postcards.fra1.digitaloceanspaces.com",
  region: "fra1",
  accessKey: "DO801RPFVQPH7EU4YZ4P",
  secretKey: "a-secret",
  prefix: "postcards/",
  acl: "public-read",
};

const uuid = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const image = Buffer.from("a tiny postcard");

function ok(): Response {
  return { ok: true, status: 200, text: async () => "" } as unknown as Response;
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = (global.fetch as jest.Mock).mock.calls.at(-1) as [string, RequestInit];

  return { url, init };
}

function headers(): Record<string, string> {
  return lastCall().init.headers as Record<string, string>;
}

describe("SpacesClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(ok());
    jest.useFakeTimers().setSystemTime(new Date("2026-08-26T19:53:13.123Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("puts the object under the prefix and answers with where it landed", async () => {
    const stored = await new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(stored).toEqual({
      key: `postcards/${uuid}.jpg`,
      url: `https://mypreflight-postcards.fra1.digitaloceanspaces.com/postcards/${uuid}.jpg`,
    });
    expect(lastCall().url).toBe(`https://mypreflight-postcards.fra1.digitaloceanspaces.com/postcards/${uuid}.jpg`);
    expect(lastCall().init.method).toBe("PUT");
  });

  it("answers with the public base url while the upload still goes to the bucket", async () => {
    const client = new SpacesClient({ ...options, publicBaseUrl: "https://postcards.mypreflight.io" });

    const stored = await client.store(`${uuid}.jpg`, image, "image/jpeg");

    expect(stored.url).toBe(`https://postcards.mypreflight.io/postcards/${uuid}.jpg`);
    expect(lastCall().url).toBe(`https://mypreflight-postcards.fra1.digitaloceanspaces.com/postcards/${uuid}.jpg`);
    expect(headers().host).toBe("mypreflight-postcards.fra1.digitaloceanspaces.com");
  });

  it("knows where an object will land before it is stored", () => {
    const client = new SpacesClient({ ...options, publicBaseUrl: "https://postcards.mypreflight.io" });

    expect(client.locate(`${uuid}.jpg`)).toEqual({
      key: `postcards/${uuid}.jpg`,
      url: `https://postcards.mypreflight.io/postcards/${uuid}.jpg`,
    });
  });

  it("puts the object at the root when no prefix is configured", async () => {
    const stored = await new SpacesClient({ ...options, prefix: "" }).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(stored.key).toBe(`${uuid}.jpg`);
  });

  it("signs the upload with the access key, the region and the s3 service", async () => {
    await new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers().Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=DO801RPFVQPH7EU4YZ4P\/20260826\/fra1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it("stamps the request with the moment it was signed", async () => {
    await new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers()["x-amz-date"]).toBe("20260826T195313Z");
  });

  it("declares the payload hash S3 verifies the body against", async () => {
    await new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers()["x-amz-content-sha256"]).toBe(createHash("sha256").update(image).digest("hex"));
  });

  it("asks for the configured acl and content type", async () => {
    await new SpacesClient(options).store(`${uuid}.png`, image, "image/png");

    expect(headers()["x-amz-acl"]).toBe("public-read");
    expect(headers()["content-type"]).toBe("image/png");
  });

  it("signs a private upload as private when that is what is configured", async () => {
    await new SpacesClient({ ...options, acl: "private" }).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers()["x-amz-acl"]).toBe("private");
  });

  it("signs the same upload the same way twice", async () => {
    await new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");
    const first = headers().Authorization;

    await new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");

    expect(headers().Authorization).toBe(first);
  });

  it("signs a different body differently", async () => {
    await new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");
    const first = headers().Authorization;

    await new SpacesClient(options).store(`${uuid}.jpg`, Buffer.from("another postcard"), "image/jpeg");

    expect(headers().Authorization).not.toBe(first);
  });

  it("keeps the bucket in the signed path when the endpoint carries one", async () => {
    await new SpacesClient({ ...options, endpoint: "http://openai-mock:1080/mypreflight-postcards" }).store(
      `${uuid}.jpg`,
      image,
      "image/jpeg",
    );

    expect(lastCall().url).toBe(`http://openai-mock:1080/mypreflight-postcards/postcards/${uuid}.jpg`);
    expect(headers().host).toBe("openai-mock:1080");
  });

  it("reports a refused upload rather than pretending it was stored", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "<Error><Code>AccessDenied</Code></Error>",
    } as unknown as Response);

    await expect(new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg")).rejects.toThrow(
      SpacesUnavailableError,
    );
  });

  it("retries once before giving up on an unreachable bucket", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const store = new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");
    const settled = expect(store).rejects.toThrow(SpacesUnavailableError);

    await jest.advanceTimersByTimeAsync(1_000);
    await settled;

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("recovers when a retry succeeds", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue(ok());

    const store = new SpacesClient(options).store(`${uuid}.jpg`, image, "image/jpeg");

    await jest.advanceTimersByTimeAsync(1_000);

    await expect(store).resolves.toMatchObject({ key: `postcards/${uuid}.jpg` });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
