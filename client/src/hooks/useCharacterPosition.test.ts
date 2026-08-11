import { describe, it, expect } from "vitest";
import { characterOffset, getCharacterAnim } from "./useCharacterPosition";
import type { GamePhase } from "@/components/GameWorld";

// Guard, not a regression test: `characterOffset` is a new seam, so there is
// no previous commit for this file to fail against. GameWorld.test.tsx carries
// the A/B — it asserts on the DOM, which the percentage version also produced.
// What this adds is coverage at real scene widths. jsdom reports clientWidth 0,
// so the rendered test can only ever exercise the degenerate case, and rounding
// is exactly what a zero width hides.

const WIDTHS = [320, 360, 375, 414, 768, 977, 1024, 1439, 1920];
const PHASES: GamePhase[] = [
  "waiting",
  "focus",
  "celebration",
  "break",
  "returning",
];

describe("characterOffset", () => {
  it("is a whole number of pixels at every width, phase and progress", () => {
    for (const width of WIDTHS) {
      for (const phase of PHASES) {
        for (let step = 0; step <= 100; step++) {
          const p = step / 100;
          const offset = characterOffset(phase, p, p, width);
          expect(
            Number.isInteger(offset),
            `${phase} at ${width}px, progress ${p} → ${offset}`,
          ).toBe(true);
        }
      }
    }
  });

  it("walks forward over a focus phase and returns to the wall", () => {
    const start = characterOffset("focus", 0, 0, 1000);
    const middle = characterOffset("focus", 0.5, 0, 1000);
    const end = characterOffset("focus", 1, 0, 1000);
    expect(start).toBeLessThan(middle);
    expect(middle).toBeLessThan(end);
    // Both characters walk toward the middle, so neither passes it.
    expect(end).toBeLessThan(500);

    // returningProgress runs 0 → 1 as the character travels back.
    expect(characterOffset("returning", 0, 1, 1000)).toBe(0);
    expect(characterOffset("returning", 0, 0, 1000)).toBeGreaterThan(
      characterOffset("returning", 0, 0.5, 1000),
    );
  });

  it("puts the pair at the same place for celebration and break", () => {
    expect(characterOffset("celebration", 0, 0, 1000)).toBe(
      characterOffset("break", 0, 0, 1000),
    );
  });
});

describe("getCharacterAnim", () => {
  it("maps each phase to its pose", () => {
    expect(getCharacterAnim("waiting")).toBe("idle");
    expect(getCharacterAnim("focus")).toBe("walk");
    expect(getCharacterAnim("celebration")).toBe("jump");
    expect(getCharacterAnim("break")).toBe("sit");
    expect(getCharacterAnim("returning")).toBe("float");
  });
});
