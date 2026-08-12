// ─────────────────────────────────────────────────────────────────────────────
// Interior — generated shelving.
//
// The library was two 14x17 maps at scale 4: bookcases 56x68 CSS px standing
// beside a 48x72 person, so the shelves were shorter than the reader. And the
// "books" were a repeating 6-colour band, the same four rows copied down.
//
// Shelves are generated instead: each item gets its own width, height and
// colour, so no two shelves repeat. The same generator does grocery shelving —
// a row of boxes on a plank is a row of boxes on a plank.
// ─────────────────────────────────────────────────────────────────────────────

export interface ShelfItem {
  /** Left edge, in art pixels from the start of the shelf. */
  x: number;
  w: number;
  /** Height in art pixels, measured up from the shelf board. */
  h: number;
  /** Index into whatever palette the caller is using. */
  tone: number;
  /** True for the odd item leaning into the gap beside it. */
  leaning: boolean;
}

function rand(n: number, seed: number): number {
  const v = Math.sin(n * 73.31 + seed * 19.77) * 31597.4123;
  return v - Math.floor(v);
}

export interface ShelfSpec {
  /** Usable width of the shelf in art pixels. */
  width: number;
  seed: number;
  /** Clear height between this board and the one above. */
  height: number;
  tones: number;
  minWidth?: number;
  maxWidth?: number;
  /** 0–1: how often a gap appears instead of an item. */
  gapChance?: number;
}

/**
 * One shelf's worth of items, left to right.
 *
 * Heights vary within the shelf's clearance and widths within a range, because
 * the thing that made the old bookshelf read as wallpaper was that every book
 * was identical and the pattern repeated every four rows.
 */
export function shelfItems(spec: ShelfSpec): ShelfItem[] {
  const {
    width,
    seed,
    height,
    tones,
    minWidth = 1,
    maxWidth = 3,
    gapChance = 0.08,
  } = spec;
  const out: ShelfItem[] = [];
  let x = 0;
  let i = 0;
  while (x < width) {
    if (rand(i * 5 + 1, seed) < gapChance && x > 0) {
      x += 1 + Math.floor(rand(i * 5 + 2, seed) * 2);
      i++;
      continue;
    }
    const w = Math.min(
      width - x,
      minWidth + Math.floor(rand(i * 5 + 3, seed) * (maxWidth - minWidth + 1)),
    );
    if (w <= 0) break;
    // Nothing shorter than 60% of the clearance, or the shelf looks empty.
    const h = Math.max(
      2,
      Math.round(height * (0.6 + rand(i * 5 + 4, seed) * 0.4)),
    );
    out.push({
      x,
      w,
      h,
      tone: Math.floor(rand(i * 5 + 5, seed) * tones),
      leaning: rand(i * 5 + 6, seed) > 0.94,
    });
    x += w;
    i++;
  }
  return out;
}

/** Y of each shelf board, top-down, for a unit `rows` tall. */
export function shelfBoards(rows: number, spacing: number): number[] {
  const out: number[] = [];
  for (let y = spacing; y < rows; y += spacing) out.push(y);
  return out;
}
