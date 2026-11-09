import { MisconfiguredError } from "./errors";
import { LambdaInvoker } from "./invoker";

const credentials = {
  accessKeyId: "ASIAEXAMPLEKEY000001",
  secretAccessKey: "a-secret",
  sessionToken: "a-session-token",
};

const options = {
  endpoint: "https://lambda.eu-central-1.amazonaws.com",
  region: "eu-central-1",
  functionName: "postcard-city",
  credentials: () => credentials,
};

const params = {
  city: "Munich",
  country: "Germany",
  continent: "Europe",
  uuid: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  background: true,
};

function accepted(): Response {
  return new Response(null, { status: 202 });
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = (global.fetch as jest.Mock).mock.calls.at(-1) as [string, RequestInit];

  return { url, init };
}

function headers(): Record<string, string> {
  return lastCall().init.headers as Record<string, string>;
}

describe("LambdaInvoker", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(accepted());
    jest.useFakeTimers().setSystemTime(new Date("2026-11-07T10:15:30.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("invokes this same function through the Lambda Invoke API", async () => {
    await new LambdaInvoker(options).schedule(params);

    expect(lastCall().url).toBe(
      "https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/postcard-city/invocations",
    );
    expect(lastCall().init.method).toBe("POST");
    expect(headers().host).toBe("lambda.eu-central-1.amazonaws.com");
  });

  it("asks for an asynchronous invocation, so the caller is answered before the render runs", async () => {
    await new LambdaInvoker(options).schedule(params);

    expect(headers()["x-amz-invocation-type"]).toBe("Event");
  });

  it("names the hand-off an activation, the way the contract already knows it", async () => {
    expect(await new LambdaInvoker(options).schedule(params)).toBe("activation");
  });

  it("sends the session token of the role's temporary credentials", async () => {
    await new LambdaInvoker(options).schedule(params);

    expect(headers()["x-amz-security-token"]).toBe("a-session-token");
  });

  it("signs the invocation for the lambda service, covering the invocation type and the token", async () => {
    await new LambdaInvoker(options).schedule(params);

    expect(headers().Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=ASIAEXAMPLEKEY000001\/20261107\/eu-central-1\/lambda\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-invocation-type;x-amz-security-token, Signature=[0-9a-f]{64}$/,
    );
    expect(headers()["x-amz-date"]).toBe("20261107T101530Z");
  });

  it("does not send the S3 payload hash header to Lambda", async () => {
    await new LambdaInvoker(options).schedule(params);

    expect(headers()).not.toHaveProperty("x-amz-content-sha256");
  });

  it("passes the already validated request on as a draw event", async () => {
    await new LambdaInvoker(options).schedule(params);

    const body = lastCall().init.body as string;

    expect(JSON.parse(body)).toEqual({ kind: "draw", params });
    expect(headers()["content-type"]).toBe("application/json");
  });

  it("signs the body it sends, so a changed body changes the signature", async () => {
    await new LambdaInvoker(options).schedule(params);
    const first = headers().Authorization;

    await new LambdaInvoker(options).schedule({ ...params, city: "Kraków" });

    expect(headers().Authorization).not.toBe(first);
  });

  it("keeps the function name escaped in the path", async () => {
    await new LambdaInvoker({ ...options, functionName: "postcard:live" }).schedule(params);

    expect(lastCall().url).toBe(
      "https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/postcard%3Alive/invocations",
    );
  });

  it("can be pointed at another endpoint, so a mock can stand in for Lambda", async () => {
    await new LambdaInvoker({ ...options, endpoint: "http://openai-mock:1080/" }).schedule(params);

    expect(lastCall().url).toBe("http://openai-mock:1080/2015-03-31/functions/postcard-city/invocations");
  });

  it("reports a refused invocation with its status and error type", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('{"Message":"denied"}', {
        status: 403,
        headers: { "x-amzn-ErrorType": "AccessDeniedException" },
      }),
    );

    await expect(new LambdaInvoker(options).schedule(params)).rejects.toThrow(/403 AccessDeniedException$/);
  });

  it("treats a synchronous answer as a failed hand-off, because the render would have run while waiting", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(new LambdaInvoker(options).schedule(params)).rejects.toThrow(/answered 200/);
  });

  it("reports an endpoint it could not reach", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(new LambdaInvoker(options).schedule(params)).rejects.toThrow(/could not reach .*ECONNREFUSED/);
  });

  it("reports missing credentials without calling Lambda", async () => {
    const invoker = new LambdaInvoker({
      ...options,
      credentials: () => {
        throw new MisconfiguredError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set.");
      },
    });

    await expect(invoker.schedule(params)).rejects.toThrow(MisconfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
