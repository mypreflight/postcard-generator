import { Given, Then } from "@cucumber/cucumber";
import expect from "expect";
import { BUCKET_PATH, callsTo, lastHeader, lastRequest, expect as stub } from "../_helper/mockserver";

Given("the bucket accepts the postcard", async () => {
  await stub({ method: "PUT", path: BUCKET_PATH, status: 200 });
});

Given("the bucket refuses the postcard", async () => {
  await stub({
    method: "PUT",
    path: BUCKET_PATH,
    status: 403,
    body: "<Error><Code>AccessDenied</Code></Error>",
    contentType: "application/xml",
  });
});

Then("the bucket should have been asked to store {int} time(s)", async (count: number) => {
  expect(await callsTo(BUCKET_PATH, "PUT")).toBe(count);
});

Then("the postcard should have been stored at {string}", async (path: string) => {
  expect((await lastRequest(BUCKET_PATH, "PUT")).path).toBe(path);
});

Then("the stored object should carry the header {string} {string}", async (name: string, value: string) => {
  expect(await lastHeader(name)).toBe(value);
});

Then("the stored object should be signed for Spaces", async () => {
  const authorization = await lastHeader("authorization");

  expect(authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=\S+\/\d{8}\/\w+\/s3\/aws4_request, /);
  expect(authorization).toMatch(/SignedHeaders=content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date, /);
  expect(authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  expect(await lastHeader("x-amz-content-sha256")).toMatch(/^[0-9a-f]{64}$/);
});
