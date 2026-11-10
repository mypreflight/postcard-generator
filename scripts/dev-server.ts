import { createServer } from "node:http";
import { handler } from "../src/lambda";
import { Logger } from "../src/logger";

const logger = new Logger("PostcardDevServer");

const PORT = Number(process.env.PORT ?? 3000);

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(", ") : value;
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }

  const headers = Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), headerValue(value)]),
  );

  handler({
    rawPath: url.pathname,
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    requestContext: { http: { method: request.method ?? "GET" } },
  })
    .then((result) => {
      response.writeHead(result.statusCode, {
        ...result.headers,
        "Content-Length": Buffer.byteLength(result.body),
      });
      response.end(result.body);
    })
    .catch(() => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end('{"error":{"code":"INTERNAL_ERROR","status":500}}');
    });
}).listen(PORT, () => {
  logger.log(`Dev server listening on :${PORT}.`);
});
