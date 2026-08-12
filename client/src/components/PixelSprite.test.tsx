import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PixelSprite, { type PixelMap, type PixelPalette } from "./PixelSprite";

// The outline is made entirely of cells *outside* the map, which makes it the
// one feature of PixelSprite exposed to the failure that bit the pets: an SVG
// discards out-of-bounds geometry without a word. If the viewBox doesn't grow
// with the border, the border renders and is then thrown away, and nothing in
// the DOM says so.

const MAP: PixelMap = ["..X..", ".XXX.", "XXXXX"];
const PALETTE: PixelPalette = { X: "#3c7f56" };

function draw(outline?: string) {
  const { container } = render(
    <PixelSprite map={MAP} palette={PALETTE} scale={3} outline={outline} />,
  );
  const svg = container.querySelector("svg")!;
  const rects = Array.from(svg.querySelectorAll("rect")).map((r) => ({
    x: Number(r.getAttribute("x")),
    y: Number(r.getAttribute("y")),
    w: Number(r.getAttribute("width")),
    fill: r.getAttribute("fill"),
  }));
  return {
    viewBox: svg.getAttribute("viewBox"),
    width: Number(svg.getAttribute("width")),
    height: Number(svg.getAttribute("height")),
    rects,
  };
}

/** Every individual cell the outline covers, expanded from its merged runs. */
function outlineCells(outline: string): [number, number][] {
  const cells: [number, number][] = [];
  for (const r of draw(outline).rects) {
    if (r.fill !== outline) continue;
    for (let i = 0; i < r.w; i++) cells.push([r.x + i, r.y]);
  }
  return cells;
}

describe("PixelSprite outline", () => {
  it("grows the viewBox and the rendered box so the border survives", () => {
    const { viewBox, width, height } = draw("#1b1b1b");
    expect(viewBox).toBe("-1 -1 7 5");
    expect(width).toBe(7 * 3);
    expect(height).toBe(5 * 3);
  });

  it("leaves both alone when no outline is asked for", () => {
    const { viewBox, width, height } = draw();
    expect(viewBox).toBe("0 0 5 3");
    expect(width).toBe(5 * 3);
    expect(height).toBe(3 * 3);
  });

  it("keeps one art pixel per CSS pixel on both axes", () => {
    // A sprite whose box and viewBox disagree in ratio is being stretched —
    // the defect the terrain band shipped with for months.
    const { viewBox, width, height } = draw("#1b1b1b");
    const [, , vw, vh] = viewBox!.split(" ").map(Number);
    expect(width / vw).toBe(height / vh);
  });

  it("borders only the cells that touch the shape", () => {
    const cells = outlineCells("#1b1b1b");
    expect(cells).toContainEqual([2, -1]); // directly above the apex
    expect(cells).not.toContainEqual([-1, -1]); // far corner touches nothing
    expect(cells).not.toContainEqual([2, 0]); // never over a filled cell
  });

  it("draws every border cell inside the grown viewBox", () => {
    for (const [x, y] of outlineCells("#1b1b1b")) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThan(5 + 1);
      expect(y).toBeLessThan(3 + 1);
    }
  });

  it("wraps the shape completely — no gaps along the bottom edge", () => {
    const cells = outlineCells("#1b1b1b");
    for (let x = 0; x < 5; x++) {
      expect(cells, `no border under column ${x}`).toContainEqual([x, 3]);
    }
  });
});
