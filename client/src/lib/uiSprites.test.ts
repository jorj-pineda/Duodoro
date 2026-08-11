import { describe, it, expect } from "vitest";
import * as sprites from "./uiSprites";
import type { PixelMap } from "@/components/PixelSprite";

// PixelSprite derives its viewBox width from the *longest* row and pads the
// rest with transparency, so a map with one short row is not an error — it just
// silently shifts that row's art relative to the others. Same for a stray
// character with no palette entry: skipped, no warning. Both are the kind of
// thing you only notice by looking, which is exactly what this repo can't
// currently do in CI.

const isPixelMap = (v: unknown): v is PixelMap =>
  Array.isArray(v) && v.length > 0 && v.every((r) => typeof r === "string");

const maps = Object.entries(sprites).filter(([, v]) => isPixelMap(v)) as [
  string,
  PixelMap,
][];

const paletteFor = (name: string): Record<string, string> | null => {
  const direct = (sprites as Record<string, unknown>)[`${name}_PALETTE`];
  return direct && typeof direct === "object"
    ? (direct as Record<string, string>)
    : null;
};

describe("ui sprite maps", () => {
  it("finds the exported maps", () => {
    expect(maps.length).toBeGreaterThan(0);
  });

  for (const [name, map] of maps) {
    it(`${name} is rectangular`, () => {
      const widths = new Set(map.map((r) => r.length));
      expect([...widths]).toHaveLength(1);
    });

    it(`${name} has no row that is entirely padding`, () => {
      // A fully-blank leading or trailing row inflates the sprite's box, so
      // percentage positioning no longer means what it looks like.
      const blank = (r: string) => /^[.\s]*$/.test(r);
      expect(blank(map[0])).toBe(false);
      expect(blank(map[map.length - 1])).toBe(false);
    });

    const palette = paletteFor(name);
    if (palette) {
      it(`${name} uses only characters its palette defines`, () => {
        const unknown = new Set<string>();
        for (const row of map) {
          for (const ch of row) {
            if (ch !== "." && ch !== " " && !palette[ch]) unknown.add(ch);
          }
        }
        expect([...unknown]).toEqual([]);
      });

      it(`${name} defines no two palette keys with the same colour`, () => {
        // This is the coffee-cup bug: H and C were both #fdf6ec, so the handle
        // was indistinguishable from the cup wall.
        const byColour = new Map<string, string[]>();
        for (const [key, colour] of Object.entries(palette)) {
          byColour.set(colour, [...(byColour.get(colour) ?? []), key]);
        }
        const dupes = [...byColour.entries()].filter(([, k]) => k.length > 1);
        expect(dupes).toEqual([]);
      });
    }
  }
});
