const MOCKSERVER_URL = process.env.OPENAI_API_HOST ?? "http://openai-mock:1080";

export const GENERATIONS_PATH = "/v1/images/generations";

/** Every upload the suite records, whatever uuid and prefix it landed under. */
export const BUCKET_PATH = "/mypreflight-postcards/.*";

type Expectation = {
  method?: string;
  path?: string;
  status: number;
  body?: string;
  contentType?: string;
};

type RecordedRequest = {
  path?: string;
  headers?: Record<string, string[]>;
  body?: unknown;
};

async function control(action: string, body: unknown, query = ""): Promise<Response> {
  return fetch(`${MOCKSERVER_URL}/mockserver/${action}${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function reset(): Promise<void> {
  await fetch(`${MOCKSERVER_URL}/mockserver/reset`, { method: "PUT" });
}

export async function expect(expectation: Expectation): Promise<void> {
  await control("expectation", {
    httpRequest: { method: expectation.method ?? "POST", path: expectation.path ?? GENERATIONS_PATH },
    httpResponse: {
      statusCode: expectation.status,
      headers: { "Content-Type": [expectation.contentType ?? "application/json"] },
      body: expectation.body ?? "",
    },
  });
}

async function recorded(path = GENERATIONS_PATH, method = "POST"): Promise<RecordedRequest[]> {
  const response = await control("retrieve", { method, path }, "?type=REQUESTS&format=JSON");

  return (await response.json()) as RecordedRequest[];
}

export async function callsTo(path = GENERATIONS_PATH, method = "POST"): Promise<number> {
  return (await recorded(path, method)).length;
}

export async function lastRequest(path = GENERATIONS_PATH, method = "POST"): Promise<RecordedRequest> {
  const requests = await recorded(path, method);
  const last = requests[requests.length - 1];

  if (!last) {
    throw new Error(`No ${method} request was recorded for ${path}.`);
  }

  return last;
}

export async function lastPayload(path = GENERATIONS_PATH): Promise<Record<string, unknown>> {
  return readJsonBody((await lastRequest(path)).body);
}

export async function lastHeader(name: string, path = BUCKET_PATH, method = "PUT"): Promise<string | undefined> {
  const headers = (await lastRequest(path, method)).headers ?? {};
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());

  return match ? headers[match][0] : undefined;
}

function readJsonBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    return JSON.parse(body) as Record<string, unknown>;
  }

  if (body && typeof body === "object") {
    const envelope = body as { json?: unknown; string?: string };

    if (envelope.json && typeof envelope.json === "object") {
      return envelope.json as Record<string, unknown>;
    }

    if (typeof envelope.string === "string") {
      return JSON.parse(envelope.string) as Record<string, unknown>;
    }

    return body as Record<string, unknown>;
  }

  throw new Error("The recorded request carried no readable JSON body.");
}

export async function restoreFixtures(): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const file = join(__dirname, "..", "..", "..", "..", "..", "docker", "mock", "openai.json");
  const expectations = JSON.parse(readFileSync(file, "utf-8")) as unknown[];

  await reset();
  for (const expectation of expectations) {
    await control("expectation", expectation);
  }
}

export const upstreamUrl = MOCKSERVER_URL;
