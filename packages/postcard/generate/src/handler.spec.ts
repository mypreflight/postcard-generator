import type { OpenAiClient } from "./client";
import { OpenAiUnavailableError, PostcardRejectedError } from "./errors";
import { handleRequest } from "./handler";
import type { Defaults } from "./request";

const defaults: Defaults = { size: "1152x1536", quality: "high", format: "jpeg", compression: 80 };

const image = { base64: "AAAA", bytes: 3 };

function fakeClient(overrides: Partial<OpenAiClient> = {}): OpenAiClient {
  return {
    model: "gpt-image-2",
    draw: jest.fn().mockResolvedValue(image),
    ...overrides,
  } as unknown as OpenAiClient;
}

describe("handleRequest", () => {
  it("answers with the postcard and how it was drawn", async () => {
    const response = await handleRequest(fakeClient(), { city: "Munich" }, defaults);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      city: "Munich",
      model: "gpt-image-2",
      size: "1152x1536",
      quality: "high",
      format: "jpeg",
      contentType: "image/jpeg",
      bytes: 3,
      image: "AAAA",
    });
  });

  it("returns the prompt it sent, so a caller can tell what was asked for", async () => {
    const response = await handleRequest(fakeClient(), { city: "Kraków" }, defaults);

    expect(response.body).toHaveProperty("prompt", expect.stringContaining('TARGET_CITY = "Kraków"'));
  });

  it("passes the request through to the client untouched", async () => {
    const client = fakeClient();

    await handleRequest(client, { city: "Gdańsk", size: "1024x1024", quality: "low", format: "png" }, defaults);

    expect(client.draw).toHaveBeenCalledWith(
      { city: "Gdańsk", size: "1024x1024", quality: "low", format: "png", compression: 80 },
      expect.any(String),
    );
  });

  it("falls back to the configured defaults when nothing is asked for", async () => {
    const client = fakeClient();

    await handleRequest(client, { city: "Munich" }, { ...defaults, quality: "low", format: "png" });

    expect(client.draw).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "low", format: "png" }),
      expect.any(String),
    );
  });

  it("rejects a missing city without calling the client", async () => {
    const client = fakeClient();

    const response = await handleRequest(client, {}, defaults);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: { code: "BAD_REQUEST", message: "Parameter city is required.", status: 400 },
    });
    expect(client.draw).not.toHaveBeenCalled();
  });

  it("keeps the status and code of a provider error", async () => {
    const client = fakeClient({
      draw: jest.fn().mockRejectedValue(new PostcardRejectedError("blocked")),
    } as Partial<OpenAiClient>);

    const response = await handleRequest(client, { city: "Munich" }, defaults);

    expect(response.statusCode).toBe(422);
    expect(response.body).toEqual({
      error: {
        code: "POSTCARD_REJECTED",
        message: "OpenAI refused to draw this postcard: blocked",
        status: 422,
      },
    });
  });

  it("reports an upstream outage as a bad gateway", async () => {
    const client = fakeClient({
      draw: jest.fn().mockRejectedValue(new OpenAiUnavailableError()),
    } as Partial<OpenAiClient>);

    const response = await handleRequest(client, { city: "Munich" }, defaults);

    expect(response.statusCode).toBe(502);
    expect(response.body).toHaveProperty("error.code", "OPENAI_UNAVAILABLE");
  });

  it("hides an unexpected crash behind an internal error", async () => {
    const client = fakeClient({ draw: jest.fn().mockRejectedValue(new Error("boom")) } as Partial<OpenAiClient>);

    const response = await handleRequest(client, { city: "Munich" }, defaults);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Postcard generation failed.", status: 500 },
    });
  });

  it("refuses a postcard that would not survive the function result limit", async () => {
    const oversized = { base64: "A".repeat(1_400_000), bytes: 1_050_000 };
    const client = fakeClient({ draw: jest.fn().mockResolvedValue(oversized) } as Partial<OpenAiClient>);

    const response = await handleRequest(client, { city: "Munich" }, defaults);

    expect(response.statusCode).toBe(502);
    expect(response.body).toHaveProperty("error.code", "POSTCARD_TOO_LARGE");
  });
});
