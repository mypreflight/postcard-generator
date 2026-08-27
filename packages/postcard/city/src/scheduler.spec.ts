import { Scheduler } from "./scheduler";

const platform = {
  apiHost: "https://faas-fra1-a1b2c3d4.doserverless.co",
  apiKey: "id:secret",
  namespace: "fn-0123",
  actionName: "postcard/city",
};

const web = {
  url: "https://mypreflight.ondigitalocean.app/postcard-generator/postcard/city",
  secret: "shared-secret",
};

const params = { city: "Munich", uuid: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", background: true };

function ok(): Response {
  return { ok: true, status: 202 } as Response;
}

function refused(status: number): Response {
  return { ok: false, status } as Response;
}

function abandoned(): Error {
  return Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
}

function callTo(host: string): { url: string; init: RequestInit } | null {
  const call = (global.fetch as jest.Mock).mock.calls.find(([url]) => (url as string).startsWith(host));

  return call ? { url: call[0] as string, init: call[1] as RequestInit } : null;
}

describe("Scheduler, over the platform", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(ok());
  });

  it("asks the platform for another activation of this action without waiting for it", async () => {
    expect(await new Scheduler({ platform, web }).schedule(params)).toBe("activation");

    const call = callTo(platform.apiHost);

    expect(call?.url).toBe(
      "https://faas-fra1-a1b2c3d4.doserverless.co/api/v1/namespaces/fn-0123/actions/postcard/city" +
        "?blocking=false&result=false",
    );
    expect(call?.init.method).toBe("POST");
  });

  it("authenticates with the key the platform injected", async () => {
    await new Scheduler({ platform, web: null }).schedule(params);

    const headers = callTo(platform.apiHost)?.init.headers as Record<string, string>;

    expect(headers.Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("passes the already validated request on to the activation", async () => {
    await new Scheduler({ platform, web: null }).schedule(params);

    expect(JSON.parse(callTo(platform.apiHost)?.init.body as string)).toEqual(params);
  });

  it("keeps the package separator out of the escaping", async () => {
    await new Scheduler({ platform: { ...platform, namespace: "fn/0123" }, web: null }).schedule(params);

    expect(callTo(platform.apiHost)?.url).toContain("/namespaces/fn%2F0123/actions/postcard/city");
  });

  it("leaves the public endpoint alone once an activation has the render", async () => {
    await new Scheduler({ platform, web }).schedule(params);

    expect(callTo(web.url)).toBeNull();
  });
});

describe("Scheduler, over the public endpoint", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(ok());
  });

  it("calls this same action through the endpoint anything can reach", async () => {
    expect(await new Scheduler({ platform: null, web }).schedule(params)).toBe("web");

    const call = callTo(web.url);
    const headers = call?.init.headers as Record<string, string>;

    expect(call?.url).toBe(`${web.url}?city=Munich&uuid=${params.uuid}&background=true`);
    expect(headers["X-Require-Whisk-Auth"]).toBe("shared-secret");
  });

  it("counts a render it stopped waiting for as handed off, because the activation runs on", async () => {
    global.fetch = jest.fn().mockRejectedValue(abandoned());

    expect(await new Scheduler({ platform: null, web }).schedule(params)).toBe("web");
  });

  it("takes over when the platform will not create the activation", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => Promise.resolve(refused(403)))
      .mockImplementationOnce(() => Promise.resolve(ok()));

    expect(await new Scheduler({ platform, web }).schedule(params)).toBe("web");
    expect(callTo(web.url)).not.toBeNull();
  });

  it("reports an endpoint that rejected the secret", async () => {
    global.fetch = jest.fn().mockResolvedValue(refused(401));

    await expect(new Scheduler({ platform: null, web }).schedule(params)).rejects.toThrow(/401/);
  });

  it("reports an endpoint it could not reach", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(new Scheduler({ platform: null, web }).schedule(params)).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe("Scheduler, with nowhere to hand a render", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(ok());
  });

  it("says both ways were unavailable rather than pretending the render was taken", async () => {
    await expect(new Scheduler({ platform: null, web: null }).schedule(params)).rejects.toThrow(
      "no platform credentials on board; no public endpoint configured",
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("says why each way refused", async () => {
    global.fetch = jest.fn().mockResolvedValue(refused(403));

    await expect(new Scheduler({ platform, web }).schedule(params)).rejects.toThrow(/403.*403/s);
  });
});
