import { buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  it("binds the city to the placeholder the rest of the prompt refers to", () => {
    expect(buildPrompt("Munich")).toContain('TARGET_CITY = "Munich"');
  });

  it("keeps the city name intact, diacritics and all", () => {
    expect(buildPrompt("Kraków")).toContain('TARGET_CITY = "Kraków"');
  });

  it("asks for a full-bleed 3:4 poster", () => {
    expect(buildPrompt("Munich")).toContain("Full-bleed vertical 3:4 minimalist flat-vector travel art poster");
  });

  it("asks for every piece of lettering in English", () => {
    const prompt = buildPrompt("Munich");

    expect(prompt).toContain("All text and lettering must be in English.");
    expect(prompt).toContain("No other text.");
  });

  it("asks for the city name as the only lettering", () => {
    const prompt = buildPrompt("Munich");

    expect(prompt).toContain("Set the exact city name TARGET_CITY in uppercase");
    expect(prompt).not.toContain("tagline");
  });

  it("carries every section of the brief", () => {
    const prompt = buildPrompt("Munich");

    for (const section of [
      "SCENE & COMPOSITION:",
      "FIGURES & ACTIVITY:",
      "TYPOGRAPHY:",
      "ART STYLE & COLOR PALETTE:",
      "MOOD & CONSTRAINTS:",
    ]) {
      expect(prompt).toContain(section);
    }
  });

  it("reads as one paragraph, never as broken lines", () => {
    expect(buildPrompt("Munich")).not.toContain("\n");
  });
});
