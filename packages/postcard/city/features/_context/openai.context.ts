import { AfterAll, Before, Given, Then } from "@cucumber/cucumber";
import expect from "expect";
import { resetClient } from "../../src/function";
import { callsTo, lastPayload, reset, restoreFixtures, expect as stub } from "../_helper/mockserver";
import { errorResponse, imageResponse } from "../_helper/openai.fixture";

Before(async () => {
  await reset();
  resetClient();
});

Given("OpenAI draws the postcard", async () => {
  await stub({ status: 200, body: imageResponse() });
});

Given("OpenAI answers without image data", async () => {
  await stub({ status: 200, body: JSON.stringify({ created: 1, data: [] }) });
});

Given("OpenAI rejects the prompt", async () => {
  await stub({
    status: 400,
    body: errorResponse("moderation_blocked", "Your request was rejected by the safety system."),
  });
});

Given("OpenAI is rate limiting", async () => {
  await stub({ status: 429, body: errorResponse("rate_limit_exceeded", "Rate limit reached for images.") });
});

Given("OpenAI is unavailable", async () => {
  await stub({ status: 500, body: errorResponse("server_error", "The server had an error.", "server_error") });
});

Then("OpenAI should have been asked to draw {int} time(s)", async (count: number) => {
  expect(await callsTo()).toBe(count);
});

Then("the prompt sent to OpenAI should contain {string}", async (needle: string) => {
  const payload = await lastPayload();

  expect(typeof payload.prompt).toBe("string");
  expect(payload.prompt as string).toContain(needle);
});

Then("OpenAI should have been asked for {string} {string}", async (field: string, value: string) => {
  const payload = await lastPayload();

  expect(String(payload[field])).toBe(value);
});

Then("OpenAI should not have been asked for {string}", async (field: string) => {
  const payload = await lastPayload();

  expect(payload).not.toHaveProperty(field);
});

AfterAll(async () => {
  await restoreFixtures();
});
