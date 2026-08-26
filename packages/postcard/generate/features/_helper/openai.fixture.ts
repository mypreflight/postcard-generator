export const tinyJpeg =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

export function imageResponse(base64: string = tinyJpeg): string {
  return JSON.stringify({ created: 1756224000, data: [{ b64_json: base64 }] });
}

export function errorResponse(code: string, message: string, type = "invalid_request_error"): string {
  return JSON.stringify({ error: { code, message, type } });
}

export function base64OfSize(bytes: number): string {
  return "A".repeat(Math.ceil(bytes / 3) * 4);
}
