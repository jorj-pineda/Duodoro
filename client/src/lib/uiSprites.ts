// ─────────────────────────────────────────────────────────────────────────────
// Shared UI pixel sprites — used by GameWorld overlays, the landing hero,
// and anywhere an emoji would break the pixel-art look.
// ─────────────────────────────────────────────────────────────────────────────

import type { PixelMap, PixelPalette } from "@/components/PixelSprite";

export const HEART: PixelMap = [
  ".HH..HH.",
  "HhhHHHHH",
  "HHHHHHHH",
  ".HHHHHH.",
  "..HHHH..",
  "...HH...",
];
export const HEART_PALETTE: PixelPalette = { H: "#e63946", h: "#ff8fa3" };

export const SPARKLE: PixelMap = [
  "..S..",
  ".SsS.",
  "SsssS",
  ".SsS.",
  "..S..",
];
export const SPARKLE_PALETTE: PixelPalette = { S: "#ffd166", s: "#fff8e1" };
export const SPARKLE_BLUE_PALETTE: PixelPalette = {
  S: "#7da7e8",
  s: "#eaf2ff",
};

export const CONTROLLER: PixelMap = [
  ".BBBBBBBBBB.",
  "BBBdBBBBbBBB",
  "BBdddBBaBbBB",
  "BBBdBBBBaBBB",
  "BBBBBBBBBBBB",
  ".BB......BB.",
];
export const CONTROLLER_PALETTE: PixelPalette = {
  B: "#4a5568",
  d: "#2d3748",
  a: "#e76f51",
  b: "#ffd166",
};
