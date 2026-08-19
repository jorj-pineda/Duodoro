import { describe, it, expect } from "vitest";
import { PET_STAGES, petStageAt, isPetStage } from "./petLevel";

/**
 * The cross-package pin.
 *
 * Byte-identical to the table in `server/petLevel.test.js`. These are
 * recorded outputs, not independently-derived expectations — the properties
 * below are what check the design. What this table is for is *agreement*:
 * edit one implementation's thresholds and the other package's suite fails.
 * Two people looking at two different animals is invisible from inside
 * either half alone.
 */
const PINNED: [number, string][] = [
  [0, "young"],
  [1, "young"],
  [10799, "young"],
  [10800, "grown"],
  [53999, "grown"],
  [54000, "full"],
  [360000, "full"],
];

describe("petStageAt", () => {
  it("matches the pinned schedule shared with the server", () => {
    for (const [seconds, stage] of PINNED) {
      expect(`${seconds} -> ${petStageAt(seconds)}`).toBe(
        `${seconds} -> ${stage}`,
      );
    }
  });

  it("treats missing and junk totals as young, not full", () => {
    for (const junk of [undefined, null, NaN, -1, "-5", "", "full"]) {
      expect(petStageAt(junk), String(junk)).toBe("young");
    }
  });

  it("only ever returns a real stage", () => {
    for (const s of [-1, 0, 10799, 10800, 53999, 54000, 1e12]) {
      expect(PET_STAGES).toContain(petStageAt(s));
    }
  });

  it("is monotonic: more focus never shrinks the pet", () => {
    let prev = 0;
    const rank = { young: 0, grown: 1, full: 2 };
    for (let s = 0; s <= 20 * 3600; s += 600) {
      const next = rank[petStageAt(s)];
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });
});

describe("isPetStage", () => {
  it("accepts the three stages and nothing else", () => {
    for (const stage of PET_STAGES) expect(isPetStage(stage)).toBe(true);
    expect(isPetStage("baby")).toBe(false);
    expect(isPetStage("grown ")).toBe(false);
    expect(isPetStage(null)).toBe(false);
    expect(isPetStage(2)).toBe(false);
  });
});
