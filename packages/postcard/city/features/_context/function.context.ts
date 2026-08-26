import { type DataTable, Then, When } from "@cucumber/cucumber";
import expect from "expect";
import { main } from "../../src/function";
import { deepCompare } from "../_helper/deep-compare";

let statusCode: number;
let body: unknown;

/** The uuid a scenario gets when it is not the uuid itself that is under test. */
export const SOME_UUID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

type Params = {
  city?: string;
  uuid?: string;
  size?: string;
  quality?: string;
  format?: string;
};

async function invoke(params: Params): Promise<void> {
  const result = await main(params);

  statusCode = result.statusCode;
  body = result.body;
}

When("I ask for a postcard of {string}", async (city: string) => {
  await invoke({ city, uuid: SOME_UUID });
});

When("I ask for a postcard of {string} as {string}", async (city: string, uuid: string) => {
  await invoke({ city, uuid });
});

When("I ask for a postcard with:", async (table: DataTable) => {
  await invoke({ uuid: SOME_UUID, ...(table.rowsHash() as Params) });
});

When("I ask for a postcard without a city", async () => {
  await invoke({ uuid: SOME_UUID });
});

When("I ask for a postcard without a uuid", async () => {
  await invoke({ city: "Munich" });
});

Then("the response status should be {int}", (expected: number) => {
  expect(statusCode).toBe(expected);
});

Then("the response body should contain:", (docString: string) => {
  deepCompare(body, JSON.parse(docString));
});

Then("the response body should have the property {string}", (property: string) => {
  expect(body).toHaveProperty(property);
});

Then("the response body should not have the property {string}", (property: string) => {
  expect(body).not.toHaveProperty(property);
});

Then("the response property {string} should be {string}", (property: string, value: string) => {
  expect(body).toHaveProperty(property, value);
});

Then("the response property {string} should contain {string}", (property: string, needle: string) => {
  const actual = (body as Record<string, unknown>)[property];

  expect(typeof actual).toBe("string");
  expect(actual as string).toContain(needle);
});

Then("the response error code should be {string}", (code: string) => {
  expect(body).toHaveProperty("error.code", code);
});

Then("I dump response", () => {
  console.log(JSON.stringify(body, null, 2));
});
