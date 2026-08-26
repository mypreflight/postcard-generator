import { readDefaults } from "./config";

const KEYS = ["POSTCARD_SIZE", "POSTCARD_QUALITY", "POSTCARD_FORMAT", "POSTCARD_COMPRESSION"];

describe("readDefaults", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const key of KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = original;
  });

  it("falls back to a 3:4 jpeg poster when nothing is configured", () => {
    expect(readDefaults()).toEqual({ size: "1152x1536", quality: "high", format: "jpeg", compression: 80 });
  });

  it("reads every default from the environment", () => {
    process.env.POSTCARD_SIZE = "1024x1024";
    process.env.POSTCARD_QUALITY = "low";
    process.env.POSTCARD_FORMAT = "png";
    process.env.POSTCARD_COMPRESSION = "50";

    expect(readDefaults()).toEqual({ size: "1024x1024", quality: "low", format: "png", compression: 50 });
  });

  it("fails loudly on a misconfigured size rather than drawing the wrong thing", () => {
    process.env.POSTCARD_SIZE = "1000x1500";

    expect(() => readDefaults()).toThrow();
  });

  it.each(["0", "101", "eighty", "80.5"])("fails loudly on a compression of %p", (compression) => {
    process.env.POSTCARD_COMPRESSION = compression;

    expect(() => readDefaults()).toThrow(/POSTCARD_COMPRESSION/);
  });
});
