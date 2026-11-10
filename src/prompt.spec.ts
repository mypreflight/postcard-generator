import { buildPrompt } from "./prompt";

const MUNICH = ["Munich", "Germany", "Europe"] as const;

describe("buildPrompt", () => {
  it("binds the city to the placeholder the rest of the prompt refers to", () => {
    expect(buildPrompt(...MUNICH)).toContain('TARGET_CITY = "Munich"');
  });

  it("binds the country and the continent to their own placeholders", () => {
    const prompt = buildPrompt(...MUNICH);

    expect(prompt).toContain('TARGET_COUNTRY = "Germany"');
    expect(prompt).toContain('TARGET_CONTINENT = "Europe"');
  });

  it("keeps the city name intact, diacritics and all", () => {
    expect(buildPrompt("Kraków", "Poland", "Europe")).toContain('TARGET_CITY = "Kraków"');
  });

  it("asks for a full-bleed 3:4 poster", () => {
    expect(buildPrompt(...MUNICH)).toContain("Full-bleed vertical 3:4 minimalist flat-vector travel art poster");
  });

  it("asks for every piece of lettering in English", () => {
    expect(buildPrompt(...MUNICH)).toContain("All text and lettering must be in English.");
  });

  it("asks for the city name as the only lettering", () => {
    const prompt = buildPrompt(...MUNICH);

    expect(prompt).toContain("Set the exact city name TARGET_CITY in uppercase");
    expect(prompt).toContain("The city name is the only text anywhere in the image");
    expect(prompt).not.toContain("tagline");
  });

  it("forbids drawing the country or the continent as text or as a symbol", () => {
    const prompt = buildPrompt(...MUNICH);

    expect(prompt).toContain(
      "never render TARGET_COUNTRY or TARGET_CONTINENT as text, as a flag, as an emblem or as a country code",
    );
    expect(prompt).toContain("no captions, subtitles or other lettering of any kind");
  });

  it("uses the country and the continent to place the city, not to decorate it", () => {
    const prompt = buildPrompt(...MUNICH);

    expect(prompt).toContain("settle which city is meant where the name is shared with cities elsewhere");
    expect(prompt).toContain("They are context for the illustration and never subject matter of their own.");
  });

  it("carries every section of the brief", () => {
    const prompt = buildPrompt(...MUNICH);

    for (const section of [
      "PLACE:",
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
    expect(buildPrompt(...MUNICH)).not.toContain("\n");
  });
});
