// ─────────────────────────────────────────────────────────────────────────────
// Terrain — ridges, hills and skylines, generated at one art pixel.
//
// The old SteppedSilhouette drew 32 columns into an SVG with
// `preserveAspectRatio="none"`, `w-full` and a percentage height. That does not
// scale pixel art, it *stretches* it: on a 1440x800 scene each "pixel" came out
// about 45 wide and 10.4 tall, a 4.3:1 rectangle on a fractional grid. It was
// the largest element in most scenes and it was not pixel art at all — and
// there was no scale prop to fix, because the geometry was stretch-to-fit by
// construction.
//
// So terrain is generated per column at ART_PX instead, wide enough to cover
// the viewport and clipped by the scene's own overflow. Everything here is
// pure and integer: the heights, and every coordinate in the emitted path.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic hash → 0..1. No Math.random: the server and the client have
 *  to draw the same hill or hydration tears. */
function hash(x: number, seed: number): number {
  const n = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Smooth interpolation between integer lattice points. */
function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - s) + hash(i + 1, seed) * s;
}

export interface RidgeSpec {
  /** How many art-pixel columns wide. */
  columns: number;
  /** Distinct ridges need distinct seeds, or every band is the same shape. */
  seed: number;
  /** Height in art pixels the ridge sits at on average. */
  base: number;
  /** Peak-to-trough variation in art pixels. */
  amplitude: number;
  /** Art pixels per noise lattice step — bigger is smoother, longer ridges. */
  wavelength?: number;
  /** How many octaves of detail. 1 is a smooth swell, 3 is a rocky skyline. */
  detail?: number;
}

/**
 * Height, in whole art pixels, for each column.
 *
 * Whole pixels because a ridge is drawn on the same grid as everything else in
 * the scene — a hill that is 12.4 pixels tall has a soft top edge, which is the
 * exact defect the whole-pixel rule exists to prevent.
 */
export function ridgeHeights(spec: RidgeSpec): number[] {
  const { columns, seed, base, amplitude, wavelength = 26, detail = 2 } = spec;
  return Array.from({ length: columns }, (_, x) => {
    let sum = 0;
    let weight = 0;
    for (let o = 0; o < detail; o++) {
      const freq = Math.pow(2, o);
      const amp = 1 / freq;
      sum += valueNoise((x / wavelength) * freq, seed + o * 17) * amp;
      weight += amp;
    }
    const n = sum / weight;
    return Math.max(1, Math.round(base + (n - 0.5) * amplitude));
  });
}

/**
 * Silhouette of a ridge as an SVG path, in art-pixel coordinates with the
 * origin at the top-left of a `columns x rows` box.
 *
 * A path rather than a rect per column purely for weight — at ART_PX a ridge
 * spanning a wide monitor is 600+ columns, and the geometry is identical
 * because every coordinate here is an integer on the art grid.
 */
export function ridgePath(heights: number[], rows: number): string {
  if (heights.length === 0) return "";
  const parts: string[] = [];
  parts.push(`M0 ${rows - heights[0]}`);
  for (let x = 0; x < heights.length; x++) {
    const y = rows - heights[x];
    if (x > 0) {
      const prev = rows - heights[x - 1];
      if (y !== prev) parts.push(`V${y}`);
    }
    parts.push(`H${x + 1}`);
  }
  parts.push(`V${rows}`, "H0", "Z");
  return parts.join(" ");
}

/**
 * The parts of a ridge standing above `capHeight`, as their own path — snow on
 * peaks, or lit rooftops. Returns "" when nothing clears the line.
 */
export function capPath(
  heights: number[],
  rows: number,
  capHeight: number,
): string {
  const parts: string[] = [];
  let x = 0;
  while (x < heights.length) {
    if (heights[x] <= capHeight) {
      x++;
      continue;
    }
    const start = x;
    while (x < heights.length && heights[x] > capHeight) x++;
    // One closed subpath per run of peaks above the line.
    parts.push(`M${start} ${rows - heights[start]}`);
    for (let i = start; i < x; i++) {
      const y = rows - heights[i];
      if (i > start) {
        const prev = rows - heights[i - 1];
        if (y !== prev) parts.push(`V${y}`);
      }
      parts.push(`H${i + 1}`);
    }
    parts.push(`V${rows - capHeight}`, `H${start}`, "Z");
  }
  return parts.join(" ");
}

/** Columns needed to cover `widthPx` at `artPx`, with a margin so a resize
 *  between measurements never exposes the end of the ridge. */
export function columnsFor(widthPx: number, artPx: number): number {
  return Math.ceil(Math.max(widthPx, 320) / artPx) + 24;
}
