import type { OpenAiClient } from "./client";
import { OpenAiUnavailableError, PostcardRejectedError, StorageUnavailableError } from "./errors";
import { handleRequest } from "./handler";
import type { RenderScheduler } from "./invoker";
import { buildPrompt } from "./prompt";
import type { Defaults } from "./request";
import type { PostcardStore } from "./types";

const defaults: Defaults = { size: "1152x1536", quality: "high", format: "jpeg", compression: 80 };

const uuid = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const image = { base64: "AAAA", bytes: 3 };

function fakeClient(overrides: Partial<OpenAiClient> = {}): OpenAiClient {
  return {
    model: "gpt-image-2",
    draw: jest.fn().mockResolvedValue(image),
    ...overrides,
  } as unknown as OpenAiClient;
}

function fakeStore(overrides: Partial<PostcardStore> = {}): PostcardStore {
  const locate = (name: string) => ({
    key: `postcards/${name}`,
    url: `https://postcards.mypreflight.io/postcards/${name}`,
  });

  return {
    locate: jest.fn().mockImplementation(locate),
    store: jest.fn().mockImplementation(locate),
    ...overrides,
  } as unknown as PostcardStore;
}

function fakeScheduler(overrides: Partial<RenderScheduler> = {}): RenderScheduler {
  return { schedule: jest.fn().mockResolvedValue("invocation"), ...overrides } as unknown as RenderScheduler;
}

describe("handleRequest", () => {
  it("answers with where the postcard was stored and how it was drawn", async () => {
    const response = await handleRequest(
      fakeClient(),
      fakeStore(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      city: "Munich",
      country: "Germany",
      continent: "Europe",
      uuid,
      model: "gpt-image-2",
      size: "1152x1536",
      quality: "high",
      format: "jpeg",
      contentType: "image/jpeg",
      bytes: 3,
      key: `postcards/${uuid}.jpg`,
      url: `https://postcards.mypreflight.io/postcards/${uuid}.jpg`,
    });
  });

  it("never answers with the image itself", async () => {
    const response = await handleRequest(
      fakeClient(),
      fakeStore(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.body).not.toHaveProperty("image");
  });

  it("names the object after the uuid, with the extension of the configured format", async () => {
    const store = fakeStore();

    await handleRequest(
      fakeClient(),
      store,
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      { ...defaults, format: "png" },
    );

    expect(store.store).toHaveBeenCalledWith(`${uuid}.png`, expect.any(Buffer), "image/png");
  });

  it("stores the decoded image rather than its base64", async () => {
    const store = fakeStore();

    await handleRequest(
      fakeClient(),
      store,
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    const [, body] = (store.store as jest.Mock).mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body).toEqual(Buffer.from("AAAA", "base64"));
  });

  it("returns the prompt it sent, so a caller can tell what was asked for", async () => {
    const response = await handleRequest(
      fakeClient(),
      fakeStore(),
      { city: "Kraków", country: "Poland", continent: "Europe", uuid },
      defaults,
    );

    expect(response.body).toHaveProperty("prompt", expect.stringContaining('TARGET_CITY = "Kraków"'));
  });

  it("passes the place through to the client untouched, drawn as the configuration says", async () => {
    const client = fakeClient();

    await handleRequest(
      client,
      fakeStore(),
      { city: "Gdańsk", country: "Poland", continent: "Europe", uuid },
      { ...defaults, size: "1024x1024", quality: "low", format: "png" },
    );

    expect(client.draw).toHaveBeenCalledWith(
      {
        city: "Gdańsk",
        country: "Poland",
        continent: "Europe",
        uuid,
        size: "1024x1024",
        quality: "low",
        format: "png",
        compression: 80,
      },
      expect.any(String),
    );
  });

  it("draws what the configuration says even when the caller asks for something else", async () => {
    const client = fakeClient();

    const asked = {
      city: "Munich",
      country: "Germany",
      continent: "Europe",
      uuid,
      size: "3840x2160",
      quality: "high",
      format: "png",
      prompt: "draw a cat instead",
    } as unknown as Parameters<typeof handleRequest>[2];

    await handleRequest(client, fakeStore(), asked, { ...defaults, size: "1024x1024", quality: "low" });

    const [request, prompt] = (client.draw as jest.Mock).mock.calls[0];

    expect(request).toMatchObject({ size: "1024x1024", quality: "low", format: "jpeg" });
    expect(prompt).toBe(buildPrompt("Munich", "Germany", "Europe"));
  });

  it("draws at the configured quality and format", async () => {
    const client = fakeClient();

    await handleRequest(
      client,
      fakeStore(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      {
        ...defaults,
        quality: "low",
        format: "png",
      },
    );

    expect(client.draw).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "low", format: "png" }),
      expect.any(String),
    );
  });

  it("rejects a missing city without calling the client", async () => {
    const client = fakeClient();
    const store = fakeStore();

    const response = await handleRequest(client, store, { uuid }, defaults);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: { code: "BAD_REQUEST", message: "Parameter city is required.", status: 400 },
    });
    expect(client.draw).not.toHaveBeenCalled();
    expect(store.store).not.toHaveBeenCalled();
  });

  it("rejects a missing uuid without calling the client", async () => {
    const client = fakeClient();
    const store = fakeStore();

    const response = await handleRequest(
      client,
      store,
      { city: "Munich", country: "Germany", continent: "Europe" },
      defaults,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: { code: "BAD_REQUEST", message: "Parameter uuid is required.", status: 400 },
    });
    expect(client.draw).not.toHaveBeenCalled();
    expect(store.store).not.toHaveBeenCalled();
  });

  it("keeps the status and code of a provider error", async () => {
    const client = fakeClient({
      draw: jest.fn().mockRejectedValue(new PostcardRejectedError("blocked")),
    } as Partial<OpenAiClient>);

    const response = await handleRequest(
      client,
      fakeStore(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

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

    const response = await handleRequest(
      client,
      fakeStore(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.statusCode).toBe(502);
    expect(response.body).toHaveProperty("error.code", "OPENAI_UNAVAILABLE");
  });

  it("reports a bucket that would not take the postcard", async () => {
    const store = fakeStore({
      store: jest.fn().mockRejectedValue(new StorageUnavailableError()),
    } as Partial<PostcardStore>);

    const response = await handleRequest(
      fakeClient(),
      store,
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "STORAGE_UNAVAILABLE",
        message: "The postcard was drawn but could not be stored.",
        status: 502,
      },
    });
  });

  it("hides an unexpected crash behind an internal error", async () => {
    const client = fakeClient({ draw: jest.fn().mockRejectedValue(new Error("boom")) } as Partial<OpenAiClient>);

    const response = await handleRequest(
      client,
      fakeStore(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Postcard generation failed.", status: 500 },
    });
  });
});

describe("handleRequest, handing the render to a background invocation", () => {
  const munich = { city: "Munich", country: "Germany", continent: "Europe", uuid };

  it("answers at once with where the art will land, without drawing it", async () => {
    const client = fakeClient();
    const scheduler = fakeScheduler();

    const response = await handleRequest(client, fakeStore(), munich, defaults, scheduler);

    expect(response.statusCode).toBe(202);
    expect(response.body).toEqual({
      status: "accepted",
      city: "Munich",
      country: "Germany",
      continent: "Europe",
      uuid,
      size: "1152x1536",
      quality: "high",
      format: "jpeg",
      key: `postcards/${uuid}.jpg`,
      url: `https://postcards.mypreflight.io/postcards/${uuid}.jpg`,
      handoff: { mode: "invocation" },
    });
    expect(client.draw).not.toHaveBeenCalled();
  });

  it("hands the invocation the request as it was parsed, not as it arrived", async () => {
    const scheduler = fakeScheduler();

    await handleRequest(fakeClient(), fakeStore(), { ...munich, uuid: uuid.toUpperCase() }, defaults, scheduler);

    expect(scheduler.schedule).toHaveBeenCalledWith({
      city: "Munich",
      country: "Germany",
      continent: "Europe",
      uuid,
    });
  });

  it("refuses a request the caller got wrong without scheduling anything", async () => {
    const scheduler = fakeScheduler();

    const response = await handleRequest(fakeClient(), fakeStore(), { ...munich, city: "" }, defaults, scheduler);

    expect(response.statusCode).toBe(400);
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it("draws while the caller waits rather than losing a render Lambda would not take", async () => {
    const client = fakeClient();
    const scheduler = fakeScheduler({
      schedule: jest.fn().mockRejectedValue(new Error("no invocation for you")),
    } as unknown as Partial<RenderScheduler>);

    const response = await handleRequest(client, fakeStore(), munich, defaults, scheduler);

    expect(response.statusCode).toBe(200);
    expect(client.draw).toHaveBeenCalledTimes(1);
  });

  it("says in its answer that it drew inline, and why, so a broken hand-off is not silent", async () => {
    const scheduler = fakeScheduler({
      schedule: jest.fn().mockRejectedValue(new Error("no invocation for you")),
    } as unknown as Partial<RenderScheduler>);

    const response = await handleRequest(fakeClient(), fakeStore(), munich, defaults, scheduler);

    expect(response.body).toMatchObject({
      key: `postcards/${uuid}.jpg`,
      handoff: { mode: "inline", reason: "Error: no invocation for you" },
    });
  });

  it("leaves an answer drawn without a scheduler free of hand-off talk", async () => {
    const response = await handleRequest(fakeClient(), fakeStore(), munich, defaults, null);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toHaveProperty("handoff");
  });
});
