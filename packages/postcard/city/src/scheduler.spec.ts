import { Scheduler } from "./scheduler";

const options = {
  apiHost: "https://faas-fra1-a1b2c3d4.doserverless.co",
  apiKey: "id:secret",
  namespace: "fn-0123",
  actionName: "postcard/city",
};

const params = { city: "Munich", uuid: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", background: true };

function ok(): Response {
  return { ok: true, status: 202 } as Response;
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = (global.fetch as jest.Mock).mock.calls.at(-1) as [string, RequestInit];

  return { url, init };
}

describe("Scheduler", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(ok());
  });

  it("asks the platform for another activation of this action without waiting for it", async () => {
    await new Scheduler(options).schedule(params);

    expect(lastCall().url).toBe(
      "https://faas-fra1-a1b2c3d4.doserverless.co/api/v1/namespaces/fn-0123/actions/postcard/city" +
        "?blocking=false&result=false",
    );
    expect(lastCall().init.method).toBe("POST");
  });

  it("authenticates with the key the platform injected", async () => {
    await new Scheduler(options).schedule(params);

    const headers = lastCall().init.headers as Record<string, string>;

    expect(headers.Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("passes the already validated request on to the activation", async () => {
    await new Scheduler(options).schedule(params);

    expect(JSON.parse(lastCall().init.body as string)).toEqual(params);
  });

  it("keeps the package separator out of the escaping", async () => {
    await new Scheduler({ ...options, namespace: "fn/0123" }).schedule(params);

    expect(lastCall().url).toContain("/namespaces/fn%2F0123/actions/postcard/city");
  });

  it("reports a platform that refused to take the work", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 } as Response);

    await expect(new Scheduler(options).schedule(params)).rejects.toThrow(/403/);
  });

  it("reports a platform it could not reach", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(new Scheduler(options).schedule(params)).rejects.toThrow(/ECONNREFUSED/);
  });
});
