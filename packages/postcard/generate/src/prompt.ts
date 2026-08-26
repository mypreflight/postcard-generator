const TEMPLATE = [
  "Full-bleed vertical 3:4 minimalist flat-vector travel art poster for TARGET_CITY. Design an authentic, bespoke" +
    " travel poster capturing the distinct visual identity of TARGET_CITY, avoiding generic postcard templates. The" +
    " illustration must extend edge-to-edge across the entire canvas with no outer white border, no frame, no margin," +
    " and no mockup presentation.",
  "SCENE & COMPOSITION: Analyze the authentic geography and urban fabric of TARGET_CITY to construct a natural," +
    " city-specific composition from a fitting viewpoint. Ground the scene with one defining local architectural" +
    " landmark or iconic skyline element as the primary focal point, supported by 2 to 4 subtle environmental" +
    " characteristics inherently typical of the location's native surroundings and infrastructure.",
  "FIGURES & ACTIVITY: Integrate 3 to 6 small-scale, understated human figures naturally blended into the background." +
    " Each person engages in an authentic, everyday local activity suited to the setting, without drawing focus as a" +
    " central hero character.",
  "TYPOGRAPHY: Set the exact city name TARGET_CITY in uppercase in the upper-left corner within generous clean" +
    " negative space, accompanied beneath by one short, elegant tagline written in Polish that captures the city's" +
    " unique mood and atmosphere. Keep typography restrained, clean, and editorial, ensuring it never overpowers the" +
    " artwork. All text and lettering must be in Polish. No other text.",
  "ART STYLE & COLOR PALETTE: Modern Japanese stationery aesthetic, luxury vinyl sticker art, clean uniform monoline" +
    " vector outlines, flat solid color fills, and geometric simplicity without gradients, paper textures, or heavy" +
    " drop shadows. Color system is dominated by pale powder blue, soft sky blue, and mist tones, balanced with warm" +
    " ivory, cream, muted sage, and neutral architectural tones. Use delicate blush or dusty rose exclusively for" +
    " tiny accents.",
  "MOOD & CONSTRAINTS: Serene, airy, balanced, and contemporary. Clean graphic layout with generous breathing room." +
    " Full-bleed flat illustration only—strictly no white borders, no photorealism, no 3D rendering, no painterly" +
    " textures, no watercolor bleed, and no cluttered collage layouts.",
].join(" ");

export function buildPrompt(city: string): string {
  return `TARGET_CITY = "${city}" ${TEMPLATE}`;
}
