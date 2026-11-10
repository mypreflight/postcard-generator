import type { HandlerResponse } from "./handler";
import { createHandler, type FunctionUrlEvent, handler, type Serving } from "./lambda";

const SECRET = "a-shared-secret";

const uuid = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const munich = { city: "Munich", country: "Germany", continent: "Europe", uuid };

function request(overrides: Partial<FunctionUrlEvent> = {}): FunctionUrlEvent {
  return {
    rawPath: "/city",
    headers: { authorization: `Bearer ${SECRET}` },
    queryStringParameters: { ...munich },
    requestContext: { http: { method: "GET" } },
    ...overrides,
  };
}

function fakeService(response: HandlerResponse = { statusCode: 202, body: { status: "accepted" } }): Serving {
  return { serve: jest.fn().mockResolvedValue(response) };
}

describe("handler, as a Function URL", () => {
  const original = process.env.POSTCARD_FUNCTION_SECRET;

  beforeEach(() => {
    process.env.POSTCARD_FUNCTION_SECRET = SECRET;
  });

  afterAll(() => {
    if (original === undefined) {
      delete process.env.POSTCARD_FUNCTION_SECRET;

      return;
    }

    process.env.POSTCARD_FUNCTION_SECRET = original;
  });

  it("refuses a request without the secret, with the function's own error body", async () => {
    const service = fakeService();

    const result = await createHandler(service)(request({ headers: {} }));

    expect(result).toEqual({
      statusCode: 401,
      headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" },
      body: JSON.stringify({
        error: { code: "UNAUTHORIZED", message: "The Authorization header is missing or wrong.", status: 401 },
      }),
    });
    expect(service.serve).not.toHaveBeenCalled();
  });

  it("refuses a request that carries no headers at all", async () => {
    const result = await createHandler(fakeService())(request({ headers: undefined }));

    expect(result.statusCode).toBe(401);
  });

  it.each([
    ["the wrong secret of the same length", "Bearer a-shared-secreT"],
    ["a shorter secret", "Bearer a-shared"],
    ["a longer secret", `Bearer ${SECRET}-and-more`],
    ["an empty token", "Bearer "],
    ["the secret without the scheme", SECRET],
    ["the secret under another scheme", `Basic ${SECRET}`],
    ["an empty header", ""],
  ])("refuses %s", async (_, given) => {
    const service = fakeService();

    const result = await createHandler(service)(request({ headers: { authorization: given } }));

    expect(result.statusCode).toBe(401);
    expect(service.serve).not.toHaveBeenCalled();
  });

  it("accepts the scheme in any case", async () => {
    const service = fakeService();

    const result = await createHandler(service)(request({ headers: { authorization: `bearer ${SECRET}` } }));

    expect(result.statusCode).toBe(202);
    expect(service.serve).toHaveBeenCalled();
  });

  it.each([
    ["is empty", ""],
    ["is only whitespace", "   "],
  ])("refuses every request when the configured secret %s, even one sending the same", async (_, configured) => {
    process.env.POSTCARD_FUNCTION_SECRET = configured;
    const service = fakeService();

    const result = await createHandler(service)(request({ headers: { authorization: `Bearer ${configured}` } }));

    expect(result.statusCode).toBe(401);
    expect(service.serve).not.toHaveBeenCalled();
  });

  it("refuses every request when no secret is configured", async () => {
    delete process.env.POSTCARD_FUNCTION_SECRET;
    const service = fakeService();

    const result = await createHandler(service)(request({ headers: {} }));

    expect(result.statusCode).toBe(401);
    expect(service.serve).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated request before telling it whether the path exists", async () => {
    const result = await createHandler(fakeService())(request({ rawPath: "/elsewhere", headers: {} }));

    expect(result.statusCode).toBe(401);
  });

  it.each(["/", "/elsewhere", "/city/", "/city/extra", "/CITY"])("answers 404 on %s", async (rawPath) => {
    const service = fakeService();

    const result = await createHandler(service)(request({ rawPath }));

    expect(result).toEqual({
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: { code: "NOT_FOUND", message: `Nothing is served at ${rawPath}.`, status: 404 } }),
    });
    expect(service.serve).not.toHaveBeenCalled();
  });

  it("forwards the query as a request the caller waits on", async () => {
    const service = fakeService();

    await createHandler(service)(request());

    expect(service.serve).toHaveBeenCalledWith({ ...munich }, false);
  });

  it("never lets the query ask for the background draw", async () => {
    const service = fakeService();

    await createHandler(service)(request({ queryStringParameters: { ...munich, background: "true" } }));

    expect(service.serve).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("forwards a request without a query, so the request logic can say what is missing", async () => {
    const service = fakeService();

    await createHandler(service)(request({ queryStringParameters: undefined }));

    expect(service.serve).toHaveBeenCalledWith({}, false);
  });

  it("answers with the status of the request logic and its body as JSON", async () => {
    const body = { status: "accepted", key: `postcards/${uuid}.jpg`, handoff: { mode: "invocation" } };

    const result = await createHandler(fakeService({ statusCode: 202, body }))(request());

    expect(result).toEqual({
      statusCode: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it("passes a body that is already a string through untouched", async () => {
    const result = await createHandler(fakeService({ statusCode: 200, body: '{"already":"json"}' }))(request());

    expect(result.body).toBe('{"already":"json"}');
  });

  it("passes an error answer of the request logic through as it is", async () => {
    const body = { error: { code: "BAD_REQUEST", message: "Parameter city is required.", status: 400 } };

    const result = await createHandler(fakeService({ statusCode: 400, body }))(request());

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual(body);
  });
});

describe("handler, as its own background invocation", () => {
  it("draws the request it handed itself as the background draw, so it never hands itself off again", async () => {
    const service = fakeService({ statusCode: 200, body: { key: `postcards/${uuid}.jpg` } });

    const result = await createHandler(service)({ kind: "draw", params: { ...munich } });

    expect(service.serve).toHaveBeenCalledWith({ ...munich }, true);
    expect(result.statusCode).toBe(200);
  });

  it("needs no secret, because only the function itself may invoke it", async () => {
    delete process.env.POSTCARD_FUNCTION_SECRET;
    const service = fakeService({ statusCode: 200, body: {} });

    await createHandler(service)({ kind: "draw", params: { ...munich } });

    expect(service.serve).toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined],
    ["an empty object", {}],
    ["a draw without params", { kind: "draw" }],
    ["another kind of event", { kind: "erase", params: munich }],
    ["a Function URL request without a method", { rawPath: "/city", requestContext: {} }],
  ])("refuses %s", async (_, event) => {
    const service = fakeService();

    const result = await createHandler(service)(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toHaveProperty("error.code", "BAD_REQUEST");
    expect(service.serve).not.toHaveBeenCalled();
  });
});

describe("handler, wired for Lambda", () => {
  const original = { ...process.env };

  const image = Buffer.from("a tiny postcard").toString("base64");

  function routed(url: string, init: RequestInit): Response {
    if (url.startsWith("https://lambda.")) {
      return new Response(null, { status: 202 });
    }

    if (url.startsWith("http://openai.test")) {
      return new Response(JSON.stringify({ data: [{ b64_json: image }] }), { status: 200 });
    }

    if (url.startsWith("https://mypreflight-postcards.s3.eu-central-1.amazonaws.com") && init.method === "PUT") {
      return new Response(null, { status: 200 });
    }

    return new Response(null, { status: 599 });
  }

  function callsTo(prefix: string): [string, RequestInit][] {
    return ((global.fetch as jest.Mock).mock.calls as [string, RequestInit][]).filter(([url]) =>
      url.startsWith(prefix),
    );
  }

  beforeAll(() => {
    process.env.POSTCARD_FUNCTION_SECRET = SECRET;
    process.env.OPENAI_API_HOST = "http://openai.test";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.S3_BUCKET = "mypreflight-postcards";
    process.env.S3_PREFIX = "postcards/";
    process.env.S3_PUBLIC_BASE_URL = "https://postcards.mypreflight.io";
    process.env.AWS_REGION = "eu-central-1";
    process.env.AWS_LAMBDA_FUNCTION_NAME = "postcard-city";
    process.env.AWS_ACCESS_KEY_ID = "ASIAEXAMPLEKEY000001";
    process.env.AWS_SECRET_ACCESS_KEY = "a-secret";
    process.env.AWS_SESSION_TOKEN = "a-session-token";

    for (const key of ["S3_REGION", "S3_ENDPOINT", "LAMBDA_ENDPOINT"]) {
      delete process.env[key];
    }
  });

  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(async (url: string, init: RequestInit) => routed(url, init));
  });

  afterAll(() => {
    process.env = original;
  });

  it("hands a request to an asynchronous invocation of itself and answers 202 at once", async () => {
    const result = await handler(request());

    expect(result.statusCode).toBe(202);
    expect(JSON.parse(result.body)).toMatchObject({
      status: "accepted",
      key: `postcards/${uuid}.jpg`,
      url: `https://postcards.mypreflight.io/postcards/${uuid}.jpg`,
      handoff: { mode: "invocation" },
    });
    expect(
      callsTo("https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/postcard-city/invocations"),
    ).toHaveLength(1);
    expect(callsTo("http://openai.test")).toHaveLength(0);
  });

  it("draws and stores in S3 when it is the background invocation", async () => {
    const result = await handler({ kind: "draw", params: { ...munich } });

    expect(result.statusCode).toBe(200);
    expect(callsTo("http://openai.test")).toHaveLength(1);

    const [[url, init]] = callsTo("https://mypreflight-postcards.s3.eu-central-1.amazonaws.com");
    const headers = init.headers as Record<string, string>;

    expect(url).toBe(`https://mypreflight-postcards.s3.eu-central-1.amazonaws.com/postcards/${uuid}.jpg`);
    expect(headers["x-amz-security-token"]).toBe("a-session-token");
    expect(headers).not.toHaveProperty("x-amz-acl");
    expect(callsTo("https://lambda.")).toHaveLength(0);
  });
});
