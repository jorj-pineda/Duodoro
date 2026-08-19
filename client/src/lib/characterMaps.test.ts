import { describe, it, expect } from "vitest";
import {
  characterMap,
  characterPalette,
  CHAR_W,
  CHAR_H,
  WALK_POSES,
  type CharacterPose,
} from "./characterMaps";
import { PET_ART, PET_STAGE_SIZE } from "./petMaps";
import { PET_STAGES } from "./petLevel";
import { keysUsed } from "./pixelMap";
import {
  DEFAULT_AVATAR,
  SKIN_COLORS,
  HAIR_COLORS,
  OUTFIT_COLORS,
} from "./avatarData";
import type { AvatarConfig, EyeStyle, HairStyle } from "./avatarData";
import { PET_OPTIONS } from "./types";

const HAIR: HairStyle[] = ["bob", "long", "mohawk", "spiky", "bald"];
const EYES: EyeStyle[] = ["normal", "anime", "sleepy"];
const POSES: CharacterPose[] = ["stand", ...WALK_POSES, "sit"];

const avatar = (over: Partial<AvatarConfig> = {}): AvatarConfig => ({
  ...DEFAULT_AVATAR,
  ...over,
});

/** Every combination the avatar creator can produce. */
function* everyLook() {
  for (const hairStyle of HAIR) {
    for (const eyeStyle of EYES) {
      for (const blinking of [false, true]) {
        for (const pose of POSES) {
          yield { hairStyle, eyeStyle, pose, blinking };
        }
      }
    }
  }
}

describe("character maps", () => {
  it("fills the canvas exactly, in every look", () => {
    for (const { hairStyle, eyeStyle, pose, blinking } of everyLook()) {
      const map = characterMap({ hairStyle, eyeStyle }, pose, blinking);
      const label = `${hairStyle}/${eyeStyle}/${pose}${blinking ? "/blink" : ""}`;
      expect(map.length, label).toBe(CHAR_H);
      for (const row of map) expect(row.length, label).toBe(CHAR_W);
    }
  });

  it("only ever uses keys the palette can colour", () => {
    // PixelSprite skips a character with no palette entry — silently, and it
    // looks exactly like a hole in the sprite.
    const palette = characterPalette(avatar());
    for (const { hairStyle, eyeStyle, pose, blinking } of everyLook()) {
      for (const key of keysUsed(characterMap({ hairStyle, eyeStyle }, pose, blinking))) {
        expect(palette[key], `no palette entry for "${key}"`).toBeTruthy();
      }
    }
  });

  it("stands on the bottom row in every standing pose", () => {
    // Not the sit pose: sitting feet are tucked, which is the point of it.
    for (const pose of ["stand", ...WALK_POSES] as CharacterPose[]) {
      const map = characterMap(DEFAULT_AVATAR, pose);
      expect(map[CHAR_H - 1].includes("F"), pose).toBe(true);
    }
  });

  it("draws a face symmetric about the head's centre line", () => {
    // Shape, not colour: the catchlight sits on the same side of *both* eyes,
    // because there is one light source. Folding W into E is what makes this a
    // test of where the features are rather than of how they're lit.
    for (const eyeStyle of EYES) {
      const map = characterMap({ hairStyle: "bald", eyeStyle }, "stand");
      for (let y = 3; y < 12; y++) {
        const row = map[y].replaceAll("W", "E");
        const mirrored = [...row].reverse().join("");
        expect(mirrored, `row ${y} of ${eyeStyle} is not symmetric`).toBe(row);
      }
    }
  });

  it("centres the eyes on the head's axis", () => {
    // Reported once as a defect — `anime` and `sleepy` supposedly centred on
    // 7.5. They didn't, and nothing had ever checked. The head spans columns
    // 3-12, so the axis is 8.
    for (const eyeStyle of EYES) {
      const map = characterMap({ hairStyle: "bald", eyeStyle }, "stand");
      const columns = map.flatMap((row) =>
        [...row].flatMap((cell, x) => (cell === "E" || cell === "W" ? [x] : [])),
      );
      expect(columns.length, eyeStyle).toBeGreaterThan(0);
      const midpoint =
        (Math.min(...columns) + Math.max(...columns) + 1) / 2;
      expect(midpoint, `${eyeStyle} eyes are off-axis`).toBe(8);
    }
  });

  it("closes the eyes on a blink, and changes nothing else", () => {
    // The whole reason for the string maps: before this the sprite's own
    // pixels never changed in any state, so a room of people reads as dolls.
    for (const eyeStyle of EYES) {
      const open = characterMap({ hairStyle: "bob", eyeStyle }, "stand", false);
      const shut = characterMap({ hairStyle: "bob", eyeStyle }, "stand", true);
      expect(open).not.toEqual(shut);
      const differing = open
        .map((row, y) => (row === shut[y] ? -1 : y))
        .filter((y) => y >= 0);
      // Eyes live in rows 5-7 depending on style; nothing outside may move.
      for (const y of differing) expect(y).toBeGreaterThanOrEqual(5);
      for (const y of differing) expect(y).toBeLessThanOrEqual(7);
    }
  });

  it("moves something between every pair of walk frames", () => {
    const frames = WALK_POSES.map((p) => characterMap(DEFAULT_AVATAR, p).join("\n"));
    // Contact / passing / contact / passing: frames 1 and 3 are the same pose
    // by design, but consecutive frames must differ or the walk is a still.
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i]).not.toBe(frames[(i + 1) % frames.length]);
    }
  });

  it("distinguishes long hair from bob by the drapes behind the head", () => {
    // Reported once as "long is identical to bob". The fringes *are*
    // identical; the side drapes are the difference.
    const bob = characterMap({ hairStyle: "bob", eyeStyle: "normal" }, "stand");
    const long = characterMap({ hairStyle: "long", eyeStyle: "normal" }, "stand");
    expect(bob).not.toEqual(long);
    expect(bob.slice(0, 4)).toEqual(long.slice(0, 4)); // same fringe
  });
});

describe("character palette", () => {
  it("gives every colour a distinct shadow", () => {
    for (const skin of SKIN_COLORS) {
      for (const hair of HAIR_COLORS) {
        for (const outfit of OUTFIT_COLORS) {
          const p = characterPalette(
            avatar({
              skinColor: skin.hex,
              hairColor: hair.hex,
              outfitColor: outfit.hex,
            }),
          );
          expect(p.s, `skin ${skin.label}`).not.toBe(p.S);
          expect(p.h, `hair ${hair.label}`).not.toBe(p.H);
          expect(p.o, `outfit ${outfit.label}`).not.toBe(p.O);
          expect(p.P, `trousers ${outfit.label}`).not.toBe(p.O);
        }
      }
    }
  });

  it("does not render two of a sprite's own colours identically", () => {
    // Two palette keys with the same value merge into one shape — that was a
    // real bug once, in the coffee cup's handle.
    const p = characterPalette(DEFAULT_AVATAR);
    const values = Object.values(p).map((v) => v.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("pet maps", () => {
  const PETS = PET_OPTIONS.map((o) => o.type);

  it("draws every pet on its stage's grid, fully inside it", () => {
    for (const type of PETS) {
      for (const stage of PET_STAGES) {
        const { w, h } = PET_STAGE_SIZE[stage];
        for (const frame of PET_ART[type][stage].frames) {
          expect(frame.length, `${type} ${stage}`).toBe(h);
          for (const row of frame) {
            expect(row.length, `${type} ${stage}`).toBe(w);
          }
        }
      }
    }
  });

  it("colours every key each pet uses", () => {
    for (const type of PETS) {
      for (const stage of PET_STAGES) {
        const { frames, palette } = PET_ART[type][stage];
        for (const frame of frames) {
          for (const key of keysUsed(frame)) {
            expect(
              palette[key],
              `${type} ${stage} has no colour for "${key}"`,
            ).toBeTruthy();
          }
        }
      }
    }
  });

  it("keeps both feet on the ground in both frames", () => {
    // The regression: the cat and the rabbit each drew a leg one row below
    // their viewBox, so each walked on one leg, alternating which.
    for (const type of PETS) {
      for (const stage of PET_STAGES) {
        const h = PET_STAGE_SIZE[stage].h;
        for (const [i, frame] of PET_ART[type][stage].frames.entries()) {
          const feet = [...frame[h - 1]].filter((c) => c !== ".").length;
          expect(feet, `${type} ${stage} frame ${i}`).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("actually steps between frames", () => {
    for (const type of PETS) {
      for (const stage of PET_STAGES) {
        const [a, b] = PET_ART[type][stage].frames;
        expect(a.join("\n"), `${type} ${stage}`).not.toBe(b.join("\n"));
      }
    }
  });

  it("gives each pet a different silhouette at every stage", () => {
    // At these sizes the outline is all there is to tell them apart.
    for (const stage of PET_STAGES) {
      const shapes = PETS.map((type) =>
        PET_ART[type][stage].frames[0]
          .map((row) => [...row].map((c) => (c === "." ? "." : "#")).join(""))
          .join("\n"),
      );
      expect(new Set(shapes).size, stage).toBe(PETS.length);
    }
  });
});
