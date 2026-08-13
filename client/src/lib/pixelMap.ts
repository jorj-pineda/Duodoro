// ─────────────────────────────────────────────────────────────────────────────
// Pixel maps — composition helpers.
//
// `PixelSprite` renders one map. A character is several: hair behind the body,
// arms, torso, legs, head, eyes, hair in front. They have to composite in
// z-order into a single map before rendering, because a character is one SVG —
// stacking separate <svg> elements would put each layer's edges on its own
// rounding, which is how pixel art picks up seams.
//
// Layers share one key alphabet (see characterMaps.ts), so compositing is just
// "last non-transparent cell wins" and no palette merging is needed.
// ─────────────────────────────────────────────────────────────────────────────

import type { PixelMap } from "@/components/PixelSprite";

const TRANSPARENT = new Set([".", " "]);

/** True when a cell should let whatever is behind it through. */
export function isClear(cell: string | undefined): boolean {
  return cell === undefined || TRANSPARENT.has(cell);
}

/**
 * Composite layers back-to-front. Later layers paint over earlier ones.
 *
 * Ragged and short rows are tolerated the way `PixelSprite` tolerates them —
 * a missing cell is transparent, not an error — and the result is sized to the
 * largest layer.
 */
export function overlay(
  ...layers: (PixelMap | null | undefined)[]
): PixelMap {
  const present = layers.filter((l): l is PixelMap => !!l && l.length > 0);
  if (present.length === 0) return [];
  const rows = present.reduce((m, l) => Math.max(m, l.length), 0);
  const cols = present.reduce(
    (m, l) => Math.max(m, l.reduce((n, r) => Math.max(n, r.length), 0)),
    0,
  );

  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = "";
    for (let x = 0; x < cols; x++) {
      let cell = ".";
      for (const layer of present) {
        const candidate = layer[y]?.[x];
        if (!isClear(candidate)) cell = candidate!;
      }
      row += cell;
    }
    out.push(row);
  }
  return out;
}

/**
 * Put a block of rows at row `top` of an otherwise empty canvas.
 *
 * Layers are written as just the rows they occupy — a legs layer is five rows,
 * not five rows and nineteen lines of dots. Anything past the bottom of the
 * canvas is a mistake worth hearing about rather than something SVG should
 * quietly clip: that silent clip is what had two pets walking on one leg.
 */
export function place(
  top: number,
  block: readonly string[],
  height: number,
  width: number,
): PixelMap {
  if (top < 0 || top + block.length > height) {
    throw new RangeError(
      `block of ${block.length} rows at y=${top} does not fit in ${height} rows`,
    );
  }
  const wrong = block.find((row) => row.length !== width);
  if (wrong !== undefined) {
    throw new RangeError(
      `row "${wrong}" is ${wrong.length} cells, expected ${width}`,
    );
  }
  const empty = ".".repeat(width);
  return Array.from({ length: height }, (_, y) =>
    y >= top && y < top + block.length ? block[y - top] : empty,
  );
}

/** Every distinct non-transparent key used by a map. */
export function keysUsed(map: PixelMap): Set<string> {
  const keys = new Set<string>();
  for (const row of map) {
    for (const cell of row) if (!isClear(cell)) keys.add(cell);
  }
  return keys;
}
