import { describe, it, expect } from "vitest";
import { overlay, place, keysUsed, isClear } from "./pixelMap";

describe("overlay", () => {
  it("paints later layers over earlier ones", () => {
    expect(overlay(["AAA"], [".B."])).toEqual(["ABA"]);
  });

  it("lets transparent cells through", () => {
    // Both spellings of transparent, because the maps in this repo use each.
    expect(overlay(["AAA"], ["...."], ["   "])).toEqual(["AAA."]);
  });

  it("sizes to the largest layer and pads the rest", () => {
    expect(overlay(["AA"], ["...", "BBB"])).toEqual(["AA.", "BBB"]);
  });

  it("ignores absent layers", () => {
    // Hair-back is null for four of the five styles; the call site shouldn't
    // have to filter.
    expect(overlay(null, ["AB"], undefined)).toEqual(["AB"]);
    expect(overlay(null, undefined)).toEqual([]);
  });

  it("is not confused by a short row in the middle of a layer", () => {
    expect(overlay(["AAAA", "AAAA"], ["BB", "..BB"])).toEqual([
      "BBAA",
      "AABB",
    ]);
  });
});

describe("place", () => {
  it("puts a block at the requested row", () => {
    expect(place(1, ["XX"], 3, 2)).toEqual(["..", "XX", ".."]);
  });

  it("refuses a block that runs off the bottom", () => {
    // SVG clips out-of-bounds geometry without a word — that silence is how
    // two pets shipped walking on one leg. A throw is the whole point.
    expect(() => place(2, ["XX", "XX"], 3, 2)).toThrow(/does not fit/);
  });

  it("refuses a negative offset", () => {
    expect(() => place(-1, ["XX"], 3, 2)).toThrow(/does not fit/);
  });

  it("refuses a row of the wrong width", () => {
    // A short row is padded silently by PixelSprite, which is forgiving for a
    // standalone sprite and wrong for a layer: the padding lands on top of
    // whatever it was supposed to let through.
    expect(() => place(0, ["XXX"], 2, 2)).toThrow(/expected 2/);
    expect(() => place(0, ["X"], 2, 2)).toThrow(/expected 2/);
  });
});

describe("keysUsed", () => {
  it("lists the non-transparent keys", () => {
    expect(keysUsed(["AB.", " CA"])).toEqual(new Set(["A", "B", "C"]));
  });
});

describe("isClear", () => {
  it("treats dot, space and absent as transparent", () => {
    expect(isClear(".")).toBe(true);
    expect(isClear(" ")).toBe(true);
    expect(isClear(undefined)).toBe(true);
    expect(isClear("A")).toBe(false);
  });
});
