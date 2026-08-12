"use client";
import type { CSSProperties } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PixelSprite — generic pixel-map → SVG renderer, matching the rect-grid
// idiom of PixelCharacter. A sprite is an array of equal-length strings;
// each character indexes into `palette`, '.' and ' ' are transparent.
// Horizontal runs of the same colour are merged into single <rect>s.
// ─────────────────────────────────────────────────────────────────────────────

export type PixelMap = readonly string[];
export type PixelPalette = Record<string, string>;

interface PixelSpriteProps {
  map: PixelMap;
  palette: PixelPalette;
  /** Pixel size in CSS px (default 2 → a 12-wide sprite renders 24px wide) */
  scale?: number;
  /**
   * Draw a one-pixel border around the sprite in this colour.
   *
   * Without it a dark sprite dissolves into a dark background — on the Space
   * world a dark-haired character genuinely disappears. It also does the job
   * a black keyline does in every commercial sprite: it separates the shape
   * from whatever is behind it, so silhouettes read at a glance.
   */
  outline?: string;
  className?: string;
  style?: CSSProperties;
}

export default function PixelSprite({
  map,
  palette,
  scale = 2,
  outline,
  className,
  style,
}: PixelSpriteProps) {
  const rows = map.length;
  const cols = map.reduce((m, r) => Math.max(m, r.length), 0);

  const filled = (x: number, y: number) => {
    if (y < 0 || y >= rows || x < 0) return false;
    const key = map[y][x];
    return key !== undefined && key !== "." && key !== " " && !!palette[key];
  };

  const rects: React.ReactNode[] = [];

  // The outline lives one cell outside the map, so the viewBox has to grow to
  // match. SVG clips out-of-bounds geometry without a word — that is how two
  // pets shipped walking on one leg — and an outline is *entirely* made of
  // out-of-bounds cells.
  const pad = outline ? 1 : 0;
  if (outline) {
    for (let y = -1; y <= rows; y++) {
      let x = -1;
      while (x <= cols) {
        const isEdge =
          !filled(x, y) &&
          (filled(x - 1, y) ||
            filled(x + 1, y) ||
            filled(x, y - 1) ||
            filled(x, y + 1));
        if (!isEdge) {
          x++;
          continue;
        }
        let end = x + 1;
        while (
          end <= cols &&
          !filled(end, y) &&
          (filled(end - 1, y) ||
            filled(end + 1, y) ||
            filled(end, y - 1) ||
            filled(end, y + 1))
        )
          end++;
        rects.push(
          <rect
            key={`o${x},${y}`}
            x={x}
            y={y}
            width={end - x}
            height={1}
            fill={outline}
          />,
        );
        x = end;
      }
    }
  }

  for (let y = 0; y < rows; y++) {
    const row = map[y];
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      if (key === "." || key === " " || !palette[key]) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      rects.push(
        <rect
          key={`${x},${y}`}
          x={x}
          y={y}
          width={end - x}
          height={1}
          fill={palette[key]}
        />,
      );
      x = end;
    }
  }

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${cols + pad * 2} ${rows + pad * 2}`}
      width={(cols + pad * 2) * scale}
      height={(rows + pad * 2) * scale}
      className={className}
      style={{ shapeRendering: "crispEdges", display: "block", ...style }}
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}
