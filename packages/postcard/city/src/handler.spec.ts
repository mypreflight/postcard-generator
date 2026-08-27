import type { OpenAiClient } from "./client";
import { OpenAiUnavailableError, PostcardRejectedError, SpacesUnavailableError } from "./errors";
import { handleRequest } from "./handler";
import type { Defaults } from "./request";
import type { Scheduler } from "./scheduler";
import type { SpacesClient } from "./spaces";

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

function fakeSpaces(overrides: Partial<SpacesClient> = {}): SpacesClient {
  const locate = (name: string) => ({
    key: `postcards/${name}`,
    url: `https://postcards.mypreflight.io/postcards/${name}`,
  });

  return {
    locate: jest.fn().mockImplementation(locate),
    store: jest.fn().mockImplementation(locate),
    ...overrides,
  } as unknown as SpacesClient;
}

function fakeScheduler(overrides: Partial<Scheduler> = {}): Scheduler {
  return { schedule: jest.fn().mockResolvedValue(undefined), ...overrides } as unknown as Scheduler;
}

describe("handleRequest", () => {
  it("answers with where the postcard was stored and how it was drawn", async () => {
    const response = await handleRequest(
      fakeClient(),
      fakeSpaces(),
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
      fakeSpaces(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.body).not.toHaveProperty("image");
  });

  it("names the object after the uuid, with the extension of the format", async () => {
    const spaces = fakeSpaces();

    await handleRequest(
      fakeClient(),
      spaces,
      { city: "Munich", country: "Germany", continent: "Europe", uuid, format: "png" },
      defaults,
    );

    expect(spaces.store).toHaveBeenCalledWith(`${uuid}.png`, expect.any(Buffer), "image/png");
  });

  it("stores the decoded image rather than its base64", async () => {
    const spaces = fakeSpaces();

    await handleRequest(
      fakeClient(),
      spaces,
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    const [, body] = (spaces.store as jest.Mock).mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body).toEqual(Buffer.from("AAAA", "base64"));
  });

  it("returns the prompt it sent, so a caller can tell what was asked for", async () => {
    const response = await handleRequest(
      fakeClient(),
      fakeSpaces(),
      { city: "Kraków", country: "Poland", continent: "Europe", uuid },
      defaults,
    );

    expect(response.body).toHaveProperty("prompt", expect.stringContaining('TARGET_CITY = "Kraków"'));
  });

  it("passes the request through to the client untouched", async () => {
    const client = fakeClient();

    await handleRequest(
      client,
      fakeSpaces(),
      {
        city: "Gdańsk",
        country: "Poland",
        continent: "Europe",
        uuid,
        size: "1024x1024",
        quality: "low",
        format: "png",
      },
      defaults,
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

  it("falls back to the configured defaults when nothing is asked for", async () => {
    const client = fakeClient();

    await handleRequest(
      client,
      fakeSpaces(),
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
    const spaces = fakeSpaces();

    const response = await handleRequest(client, spaces, { uuid }, defaults);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: { code: "BAD_REQUEST", message: "Parameter city is required.", status: 400 },
    });
    expect(client.draw).not.toHaveBeenCalled();
    expect(spaces.store).not.toHaveBeenCalled();
  });

  it("rejects a missing uuid without calling the client", async () => {
    const client = fakeClient();
    const spaces = fakeSpaces();

    const response = await handleRequest(
      client,
      spaces,
      { city: "Munich", country: "Germany", continent: "Europe" },
      defaults,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: { code: "BAD_REQUEST", message: "Parameter uuid is required.", status: 400 },
    });
    expect(client.draw).not.toHaveBeenCalled();
    expect(spaces.store).not.toHaveBeenCalled();
  });

  it("keeps the status and code of a provider error", async () => {
    const client = fakeClient({
      draw: jest.fn().mockRejectedValue(new PostcardRejectedError("blocked")),
    } as Partial<OpenAiClient>);

    const response = await handleRequest(
      client,
      fakeSpaces(),
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
      fakeSpaces(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.statusCode).toBe(502);
    expect(response.body).toHaveProperty("error.code", "OPENAI_UNAVAILABLE");
  });

  it("reports a bucket that would not take the postcard", async () => {
    const spaces = fakeSpaces({
      store: jest.fn().mockRejectedValue(new SpacesUnavailableError()),
    } as Partial<SpacesClient>);

    const response = await handleRequest(
      fakeClient(),
      spaces,
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "SPACES_UNAVAILABLE",
        message: "The postcard was drawn but could not be stored.",
        status: 502,
      },
    });
  });

  it("hides an unexpected crash behind an internal error", async () => {
    const client = fakeClient({ draw: jest.fn().mockRejectedValue(new Error("boom")) } as Partial<OpenAiClient>);

    const response = await handleRequest(
      client,
      fakeSpaces(),
      { city: "Munich", country: "Germany", continent: "Europe", uuid },
      defaults,
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Postcard generation failed.", status: 500 },
    });
  });
});

describe("handleRequest, handing the render to a background activation", () => {
  const munich = { city: "Munich", country: "Germany", continent: "Europe", uuid };

  it("answers at once with where the art will land, without drawing it", async () => {
    const client = fakeClient();
    const scheduler = fakeScheduler();

    const response = await handleRequest(client, fakeSpaces(), munich, defaults, scheduler);

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
    });
    expect(client.draw).not.toHaveBeenCalled();
  });

  it("hands the activation the request as it was parsed, not as it arrived", async () => {
    const scheduler = fakeScheduler();

    await handleRequest(fakeClient(), fakeSpaces(), { ...munich, uuid: uuid.toUpperCase() }, defaults, scheduler);

    expect(scheduler.schedule).toHaveBeenCalledWith({
      city: "Munich",
      country: "Germany",
      continent: "Europe",
      uuid,
      size: "1152x1536",
      quality: "high",
      format: "jpeg",
      background: true,
    });
  });

  it("draws rather than scheduling again once it is the background activation", async () => {
    const client = fakeClient();
    const scheduler = fakeScheduler();

    const response = await handleRequest(client, fakeSpaces(), { ...munich, background: true }, defaults, scheduler);

    expect(response.statusCode).toBe(200);
    expect(client.draw).toHaveBeenCalledTimes(1);
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it("refuses a request the caller got wrong without scheduling anything", async () => {
    const scheduler = fakeScheduler();

    const response = await handleRequest(fakeClient(), fakeSpaces(), { ...munich, city: "" }, defaults, scheduler);

    expect(response.statusCode).toBe(400);
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it("draws while the caller waits rather than losing a render the platform would not take", async () => {
    const client = fakeClient();
    const scheduler = fakeScheduler({
      schedule: jest.fn().mockRejectedValue(new Error("no activation for you")),
    } as unknown as Partial<Scheduler>);

    const response = await handleRequest(client, fakeSpaces(), munich, defaults, scheduler);

    expect(response.statusCode).toBe(200);
    expect(client.draw).toHaveBeenCalledTimes(1);
  });
});
