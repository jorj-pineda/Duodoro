import { describe, it, expect } from "vitest";
import { shade, flush, hexToHsl, hslToHex } from "./palette";
import { SKIN_COLORS, HAIR_COLORS, OUTFIT_COLORS } from "./avatarData";

const lightness = (hex: string) => hexToHsl(hex)[2];
const saturation = (hex: string) => hexToHsl(hex)[1];

const SKINS = SKIN_COLORS.map((c) => c.hex);
const ALL = [...SKINS, ...HAIR_COLORS, ...OUTFIT_COLORS].map((c) =>
  typeof c === "string" ? c : c.hex,
);

describe("hexToHsl", () => {
  it("round-trips through hslToHex", () => {
    for (const hex of ALL) {
      const [h, s, l] = hexToHsl(hex);
      expect(hslToHex(h, s, l).toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  it("reports greys as unsaturated", () => {
    expect(hexToHsl("#808080")[1]).toBe(0);
    expect(hexToHsl("#000000")[2]).toBe(0);
    expect(hexToHsl("#ffffff")[2]).toBe(1);
  });
});

describe("shade", () => {
  // The bug: `darken` was a per-channel RGB multiply, so the amount a colour
  // moved depended on how bright it already was. On the two deepest skins the
  // chin shadow shifted value by ~6/255 — drawn, paid for, invisible.
  const previousDarken = (hex: string, ratio: number) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) * (1 - ratio)) | 0;
    const g = Math.max(0, ((n >> 8) & 0xff) * (1 - ratio)) | 0;
    const b = Math.max(0, (n & 0xff) * (1 - ratio)) | 0;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };

  it("darkens every skin tone by a visible and near-equal amount", () => {
    const drops = SKINS.map((hex) => lightness(hex) - lightness(shade(hex)));
    for (const drop of drops) expect(drop).toBeGreaterThan(0.08);
    // Palest and deepest must move by comparable amounts. The old multiply
    // spread these from 0.071 down to 0.016 — a 4.4x range.
    expect(Math.max(...drops) / Math.min(...drops)).toBeLessThan(1.15);
  });

  it("moves the deepest skin far more than the multiply it replaced", () => {
    const deepest = SKINS[SKINS.length - 1];
    const now = lightness(deepest) - lightness(shade(deepest));
    const before = lightness(deepest) - lightness(previousDarken(deepest, 0.08));
    expect(before).toBeLessThan(0.02); // invisible, which was the bug
    expect(now).toBeGreaterThan(before * 4);
  });

  it("never returns a colour lighter than its source", () => {
    for (const hex of ALL) {
      expect(lightness(shade(hex))).toBeLessThanOrEqual(lightness(hex));
    }
  });

  it("does not turn pale colours vivid", () => {
    // Holding HSL saturation while dropping lightness sent the palest skin to
    // a pink; capping the chroma rise is what stops it.
    for (const hex of ALL) {
      expect(saturation(shade(hex))).toBeLessThan(saturation(hex) + 0.12);
    }
  });

  it("still separates a near-black from its own shadow", () => {
    // Blending toward a fixed dark tone failed here — black hair came back
    // fractionally *lighter* than the colour it was shading.
    const black = "#1A1A1A";
    expect(lightness(black) - lightness(shade(black))).toBeGreaterThan(0.03);
  });
});

describe("flush", () => {
  it("warms every skin tone without bleaching it", () => {
    for (const hex of SKINS) {
      const [, s, l] = hexToHsl(hex);
      const [, fs, fl] = hexToHsl(flush(hex));
      expect(fs).toBeGreaterThan(s); // warmer
      expect(Math.abs(fl - l)).toBeLessThan(0.08); // still that person's face
    }
  });

  it("is not the same pink on every skin", () => {
    // It used to be: a fixed #F4A0A0 at 0.6 opacity, which on the deepest skin
    // read as two bright stripes rather than as a cheek.
    expect(new Set(SKINS.map(flush)).size).toBe(SKINS.length);
    for (const hex of SKINS) {
      expect(flush(hex).toLowerCase()).not.toBe("#f4a0a0");
    }
  });
});

