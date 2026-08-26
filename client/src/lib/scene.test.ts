import { describe, it, expect } from "vitest";
import { ART_PX, ART_PX_COMPACT, artPxFor } from "./scene";

/**
 * Real device boxes, since the scene box *is* the viewport — GameWorld is
 * `absolute inset-0` inside an `h-dvh` shell, so there is no container between
 * the two to change the answer.
 */
const BOXES: [string, number, number, number][] = [
  // [what, width, height, expected art pixel]
  ["iPhone SE portrait", 375, 667, ART_PX_COMPACT],
  ["iPhone 15 portrait", 393, 852, ART_PX_COMPACT],
  ["iPhone 15 landscape", 852, 393, ART_PX_COMPACT],
  ["Pixel 8 portrait", 412, 915, ART_PX_COMPACT],
  ["iPad mini portrait", 744, 1133, ART_PX],
  ["iPad landscape", 1133, 744, ART_PX],
  ["laptop", 1440, 900, ART_PX],
  ["big monitor", 2560, 1440, ART_PX],
];

describe("artPxFor", () => {
  for (const [what, w, h, expected] of BOXES) {
    it(`${what} (${w}x${h}) draws at ${expected}`, () => {
      expect(artPxFor(w, h)).toBe(expected);
    });
  }

  /**
   * The landscape case is the reason this takes a height at all. A landscape
   * phone is *wider* than an iPad is tall, so a width-only rule would call it
   * a desktop exactly when the vertical room has run out.
   */
  it("calls a wide-but-short box small, which a width query could not", () => {
    expect(artPxFor(852, 393)).toBe(ART_PX_COMPACT);
    expect(artPxFor(852, 900)).toBe(ART_PX);
  });

  it("uses the codebase's own breakpoints, to the pixel", () => {
    // 640 = Tailwind `sm`; 520 = the max-height query in globals.css.
    expect(artPxFor(639, 900)).toBe(ART_PX_COMPACT);
    expect(artPxFor(640, 900)).toBe(ART_PX);
    expect(artPxFor(900, 519)).toBe(ART_PX_COMPACT);
    expect(artPxFor(900, 520)).toBe(ART_PX);
  });

  /**
   * An unmeasured box is not a small box. Both the first frame and jsdom
   * report 0, and a server render has no box at all.
   */
  it("answers desktop for an unmeasured box rather than shrinking everything", () => {
    for (const [w, h] of [[0, 0], [0, 800], [400, 0], [NaN, NaN], [-1, -1]]) {
      expect(artPxFor(w, h), `${w}x${h}`).toBe(ART_PX);
    }
  });

  it("only ever answers with one of the two stops", () => {
    for (let w = 100; w <= 2000; w += 37) {
      for (let h = 100; h <= 1400; h += 41) {
        expect([ART_PX, ART_PX_COMPACT]).toContain(artPxFor(w, h));
      }
    }
  });

  /**
   * Non-integer scaling is what turns hard edges into grey fringe, so both
   * stops have to be whole numbers — the same rule `pixelMotion.test.ts`
   * enforces for transforms.
   */
  it("has whole-number stops, because a fractional art pixel blurs", () => {
    expect(Number.isInteger(ART_PX)).toBe(true);
    expect(Number.isInteger(ART_PX_COMPACT)).toBe(true);
    expect(ART_PX_COMPACT).toBeLessThan(ART_PX);
  });
});
