import { type DataTable, Then, When } from "@cucumber/cucumber";
import expect from "expect";
import { main } from "../../src/function";
import { deepCompare } from "../_helper/deep-compare";

let statusCode: number;
let body: unknown;

type Params = {
  city?: string;
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
  await invoke({ city });
});

When("I ask for a postcard with:", async (table: DataTable) => {
  await invoke(table.rowsHash() as Params);
});

When("I ask for a postcard without a city", async () => {
  await invoke({});
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
