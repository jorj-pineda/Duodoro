import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DARK_BG,
  LIGHT_BG,
  SITE_TAGLINE,
  SITE_URL,
} from "./site";
import { alt, size } from "../app/opengraph-image";
import manifest from "../app/manifest";

const LAYOUT = readFileSync(
  path.join(__dirname, "../app/layout.tsx"),
  "utf8",
);
const ICON = readFileSync(
  path.join(__dirname, "../../public/icon.svg"),
  "utf8",
);
const APPLE = readFileSync(
  path.join(__dirname, "../../public/apple-touch-icon.svg"),
  "utf8",
);

describe("launch surface copy", () => {
  it("has exactly one period on the tagline", () => {
    // A/B — fails against the previous commit: openGraph.description was
    // "Focus together, anywhere.."
    expect(SITE_TAGLINE.endsWith(".")).toBe(true);
    expect(SITE_TAGLINE.endsWith("..")).toBe(false);
    expect(LAYOUT).not.toMatch(/anywhere\.\./);
    expect(alt).not.toMatch(/anywhere\.\./);
  });
});

describe("shared-link card", () => {
  it("resolves OG paths against the live origin", () => {
    // Without metadataBase, openGraph.images is a relative URL and every
    // crawler renders a blank card. A/B — layout previously had no metadataBase.
    expect(SITE_URL).toBe("https://duodoro.live");
    expect(LAYOUT).toMatch(/metadataBase:\s*new URL\(SITE_URL\)/);
  });

  it("exports a 1200×630 image that uses the tagline", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(alt).toContain(SITE_TAGLINE);
  });
});

describe("icon and splash colours", () => {
  it("drops the Next.js emerald that appears nowhere in the app", () => {
    // A/B — both SVGs were fill="#10b981".
    expect(ICON).not.toMatch(/#10b981/i);
    expect(APPLE).not.toMatch(/#10b981/i);
  });

  it("paints the duo mark on charcoal, with paper for the two people", () => {
    expect(ICON).toContain(DARK_BG);
    expect(ICON).toContain(LIGHT_BG);
    expect(APPLE).toContain(DARK_BG);
    expect(APPLE).toContain(LIGHT_BG);
  });

  it("uses the dark theme for the install splash, not gray-900", () => {
    // A/B — public/manifest.webmanifest had theme_color "#111827".
    const webManifest = manifest();
    expect(webManifest.theme_color).toBe(DARK_BG);
    expect(webManifest.background_color).toBe(DARK_BG);
    expect(webManifest.theme_color).not.toBe("#111827");
  });
});
