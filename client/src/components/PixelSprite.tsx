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
  className?: string;
  style?: CSSProperties;
}

export default function PixelSprite({
  map,
  palette,
  scale = 2,
  className,
  style,
}: PixelSpriteProps) {
  const rows = map.length;
  const cols = map.reduce((m, r) => Math.max(m, r.length), 0);

  const rects: React.ReactNode[] = [];
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
      viewBox={`0 0 ${cols} ${rows}`}
      width={cols * scale}
      height={rows * scale}
      className={className}
      style={{ shapeRendering: "crispEdges", display: "block", ...style }}
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}
