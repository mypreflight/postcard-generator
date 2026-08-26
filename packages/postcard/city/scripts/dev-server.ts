import { createServer } from "node:http";
import { main } from "../src/function";
import { Logger } from "../src/logger";

const logger = new Logger("PostcardDevServer");

const PORT = Number(process.env.PORT ?? 3000);

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }

  main({
    city: url.searchParams.get("city") ?? undefined,
    uuid: url.searchParams.get("uuid") ?? undefined,
    size: url.searchParams.get("size") ?? undefined,
    quality: url.searchParams.get("quality") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  })
    .then((result) => {
      const payload = JSON.stringify(result.body);
      response.writeHead(result.statusCode, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      });
      response.end(payload);
    })
    .catch(() => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end('{"error":{"code":"INTERNAL_ERROR","status":500}}');
    });
}).listen(PORT, () => {
  logger.log(`Dev server listening on :${PORT}.`);
});
