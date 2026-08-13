// ─────────────────────────────────────────────────────────────────────────────
// Pet maps — the companions as string maps.
//
// ── Why they got smaller ────────────────────────────────────────────────────
// The pets were 10 x 11 cells. On ART_PX that is 30 x 33 px beside a 48 x 72
// person, i.e. a cat 0.46x a human's height — a cat is about 0.25x. They only
// ever looked right because they used to render at a *smaller pixel* than the
// character did, which is the density mismatch PR #36 removed: the fix put them
// on the same grid and the size problem became visible.
//
// So they are redrawn at 9 x 7, which is 27 x 21 px, or 0.29x a person. The
// wrong fix is putting `size` back to 2 — that reintroduces two pixel grids in
// one frame, and a scene with two pixel sizes reads as broken no matter how
// well-proportioned the things in it are.
//
// ── What seven rows costs you ───────────────────────────────────────────────
// Every pet is a head with a body under it, seen face-on. That is a choice, not
// a limitation to apologise for: at this size the head is the only part with
// room for anything readable, so it gets four of the seven rows and the body
// gets two. The first attempt drew face-on heads with side-on tails, and the
// tails read as detached sticks floating beside the animal — mixing two views
// in nine pixels does not survive.
//
// Everything distinguishing therefore happens in the silhouette: cat ear
// points, dog ears down the sides of the head, dragon horns and wings, rabbit
// ears above it. Interior detail is two eyes and a nose.
//
// ── The key alphabet ────────────────────────────────────────────────────────
//   C coat        c coat in shadow      M muzzle / marking
//   E eye         N nose                W tail fluff
// ─────────────────────────────────────────────────────────────────────────────

import type { PixelMap, PixelPalette } from "@/components/PixelSprite";
import { place } from "./pixelMap";
import { shade } from "./palette";
import type { PetType } from "./types";

export const PET_W = 9;
export const PET_H = 7;

/**
 * Both walk frames plant both feet on the bottom row.
 *
 * A pet that lifts a foot clean off the map is indistinguishable from one whose
 * foot is being silently clipped — which is exactly what the cat and the rabbit
 * shipped with, each walking on one leg. So the step is a change of *stance*,
 * feet together and feet apart, and the bottom row is never empty.
 */
const FEET_TOGETHER = "..cc.cc..";
const FEET_APART = ".cc...cc.";

interface PetArt {
  frames: [PixelMap, PixelMap];
  palette: PixelPalette;
}

/** Six rows of body plus the two foot stances. */
function pet(body: readonly string[], palette: PixelPalette): PetArt {
  const frame = (feet: string) =>
    place(0, [...body, feet], PET_H, PET_W);
  return { frames: [frame(FEET_TOGETHER), frame(FEET_APART)], palette };
}

const coat = (base: string, rest: PixelPalette): PixelPalette => ({
  C: base,
  c: shade(base, 0.12),
  ...rest,
});

export const PET_ART: Record<PetType, PetArt> = {
  // Pointed ears at the head's corners, tail curling out to one side.
  cat: pet(
    [
      ".C.....C.",
      ".CCCCCCC.",
      ".CECCCEC.",
      ".CCCNCCC.",
      "..CCCCCcc",
      "..CCCCC.c",
    ],
    coat("#E2A65C", { E: "#2C3A4A", N: "#C4604A" }),
  ),

  // Ears down the sides rather than above — that plus the muzzle is the whole
  // difference between this and the cat at nine pixels wide.
  dog: pet(
    [
      "CC.....CC",
      "cCCCCCCCc",
      "cCECCCECc",
      ".CCMMMCC.",
      "..CCCCCc.",
      "..CCCCC..",
    ],
    coat("#C99A63", { E: "#3B2411", M: "#EFD9B4", N: "#2A1808" }),
  ),

  // Horns up, wings out at the shoulders, gold eyes.
  dragon: pet(
    [
      "..c...c..",
      ".CCCCCCC.",
      ".CECCCEC.",
      ".CCCNCCC.",
      "cCCCCCCCc",
      "..CCCCC.c",
    ],
    coat("#A78BFA", { E: "#FFC93C", N: "#7C3AED" }),
  ),

  // Two rows of ear, which is most of what a rabbit is from the front, so it
  // sits up and gets only one row of body.
  rabbit: pet(
    [
      "...C.C...",
      "...C.C...",
      ".CCCCCCC.",
      ".CECCCEC.",
      ".CCCNCCC.",
      "..CCCCCWW",
    ],
    coat("#EFE6D6", { E: "#8A5A6B", N: "#E39AA0", W: "#FFFFFF" }),
  ),
};
