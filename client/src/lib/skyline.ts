// ─────────────────────────────────────────────────────────────────────────────
// Skyline — generated towers.
//
// The city was two hand-drawn buildings, 27x48 and 21x30 CSS px, standing
// beside a 48x72 person: a skyscraper two thirds the height of the human
// looking at it. Hand-drawing enough towers at a believable height to fill a
// viewport is not a sensible use of literal string maps, so they are generated:
// a width, a height, a window grid and a roof, all deterministic.
//
// Reference scale: the character is 24 art pixels tall. A near tower here is
// 90–130, so four to five times human height, and still modest for Manhattan.
// ─────────────────────────────────────────────────────────────────────────────

export type Roof = "flat" | "antenna" | "tank" | "setback" | "spire";

export interface Building {
  /** Left edge in art pixels. */
  x: number;
  /** Width in art pixels. */
  w: number;
  /** Height in art pixels. */
  h: number;
  roof: Roof;
  /** Per-building seed, so its windows don't repeat the neighbour's. */
  seed: number;
}

export interface SkylineSpec {
  columns: number;
  seed: number;
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
  /** Art pixels between towers. 0 packs them shoulder to shoulder. */
  gap?: number;
  /** Roofs to choose from — far towers are mostly flat, near ones aren't. */
  roofs?: Roof[];
}

function rand(n: number, seed: number): number {
  const v = Math.sin(n * 91.7 + seed * 47.13) * 24634.6345;
  return v - Math.floor(v);
}

/** Towers left to right, filling `columns`. */
export function skyline(spec: SkylineSpec): Building[] {
  const {
    columns,
    seed,
    minHeight,
    maxHeight,
    minWidth,
    maxWidth,
    gap = 1,
    roofs = ["flat"],
  } = spec;
  const out: Building[] = [];
  let x = -Math.floor(rand(0, seed) * maxWidth);
  let i = 0;
  while (x < columns) {
    const w = minWidth + Math.floor(rand(i * 3 + 1, seed) * (maxWidth - minWidth + 1));
    // Two neighbouring towers of the same height read as one wide box, so the
    // height is pushed away from its predecessor rather than drawn freely.
    const raw = rand(i * 3 + 2, seed);
    const prev = out[out.length - 1];
    const shaped =
      prev === undefined
        ? raw
        : Math.abs(raw - (prev.h - minHeight) / (maxHeight - minHeight)) < 0.18
          ? (raw + 0.45) % 1
          : raw;
    const h = Math.round(minHeight + shaped * (maxHeight - minHeight));
    out.push({
      x,
      w,
      h,
      roof: roofs[Math.floor(rand(i * 3 + 3, seed) * roofs.length)],
      seed: seed + i * 7,
    });
    x += w + gap;
    i++;
  }
  return out;
}

export interface Window {
  x: number;
  y: number;
  lit: boolean;
}

/**
 * Window cells for a tower, in coordinates relative to its own top-left.
 *
 * Two art pixels wide with two between, which at ART_PX is a 6px window — the
 * smallest that still reads as a window rather than noise. Lit ones are
 * clustered by floor: a building where every window is independently random
 * looks like static, because real ones are lit by whole occupied floors.
 */
export function windows(b: Building): Window[] {
  const out: Window[] = [];
  const stepX = 4;
  const stepY = 5;
  const inset = 2;
  for (let row = 0, y = 3; y < b.h - stepY; row++, y += stepY) {
    const floorLit = rand(row * 13 + 5, b.seed) > 0.42;
    for (let x = inset; x + 2 <= b.w - inset; x += stepX) {
      const jitter = rand(row * 31 + x, b.seed);
      out.push({
        x,
        y,
        lit: floorLit ? jitter > 0.25 : jitter > 0.88,
      });
    }
  }
  return out;
}

/** Extra geometry above the parapet, in coordinates relative to the tower. */
export function roofParts(b: Building): { x: number; y: number; w: number; h: number }[] {
  const mid = Math.floor(b.w / 2);
  switch (b.roof) {
    case "antenna":
      return [{ x: mid, y: -9, w: 1, h: 9 }];
    case "spire":
      return [
        { x: mid - 1, y: -5, w: 3, h: 5 },
        { x: mid, y: -12, w: 1, h: 7 },
      ];
    case "tank":
      return [
        { x: mid - 2, y: -4, w: 5, h: 4 },
        { x: mid - 1, y: -6, w: 3, h: 2 },
      ];
    case "setback":
      return [{ x: 2, y: -6, w: Math.max(3, b.w - 4), h: 6 }];
    default:
      return [];
  }
}
