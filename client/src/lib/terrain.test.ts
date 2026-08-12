import { describe, it, expect } from "vitest";
import { ridgeHeights, ridgePath, capPath, columnsFor } from "./terrain";

// The band this replaces was drawn with `preserveAspectRatio="none"` into a
// `w-full` SVG with a percentage height, so its "pixels" came out as ~45x10
// rectangles on a fractional grid. Nothing about that is checkable by reading
// a rect count — it only shows up in the relationship between the viewBox and
// the rendered box, and in whether the geometry lands on whole cells.

const SPEC = { seed: 3, base: 18, amplitude: 12, wavelength: 24, detail: 2 };

/** Every numeric literal in an SVG path, in order. */
function coords(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe("ridgeHeights", () => {
  it("returns whole art pixels at every column", () => {
    for (const columns of [40, 120, 640]) {
      for (const h of ridgeHeights({ ...SPEC, columns })) {
        expect(Number.isInteger(h), `${h} is not a whole art pixel`).toBe(true);
        expect(h).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("is deterministic, so the server and client draw the same hill", () => {
    // Not a style point: the scene is server-rendered and then hydrated. A
    // ridge built from Math.random tears on hydration.
    const a = ridgeHeights({ ...SPEC, columns: 200 });
    const b = ridgeHeights({ ...SPEC, columns: 200 });
    expect(a).toEqual(b);
  });

  it("gives different seeds different shapes", () => {
    const a = ridgeHeights({ ...SPEC, columns: 200, seed: 1 });
    const b = ridgeHeights({ ...SPEC, columns: 200, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("varies — a ridge that is one flat line is a bug, not a ridge", () => {
    const h = ridgeHeights({ ...SPEC, columns: 300 });
    expect(new Set(h).size).toBeGreaterThan(4);
  });

  it("stays inside its amplitude", () => {
    const h = ridgeHeights({ ...SPEC, columns: 400 });
    const slack = 1; // rounding
    expect(Math.max(...h)).toBeLessThanOrEqual(
      SPEC.base + SPEC.amplitude / 2 + slack,
    );
  });
});

describe("ridgePath", () => {
  const heights = ridgeHeights({ ...SPEC, columns: 120 });
  const rows = Math.max(...heights);
  const path = ridgePath(heights, rows);

  it("puts every coordinate on a whole cell", () => {
    for (const n of coords(path)) {
      expect(Number.isInteger(n), `${n} is a fractional coordinate`).toBe(true);
    }
  });

  it("draws entirely inside its own viewBox", () => {
    // SVG clips out-of-bounds geometry silently — that is how two pets shipped
    // walking on one leg. Same failure mode, much bigger shape.
    const nums = coords(path);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
    }
    expect(Math.max(...nums)).toBeLessThanOrEqual(Math.max(heights.length, rows));
  });

  it("spans the full width", () => {
    expect(path.startsWith("M0 ")).toBe(true);
    expect(path).toContain(`H${heights.length}`);
  });

  it("is empty for no columns rather than throwing", () => {
    expect(ridgePath([], 10)).toBe("");
  });
});

describe("capPath", () => {
  const heights = ridgeHeights({ ...SPEC, columns: 200 });
  const rows = Math.max(...heights);

  it("only covers the peaks that clear the line", () => {
    const line = rows - 3;
    const path = capPath(heights, rows, line);
    // Something clears it, but not everything.
    expect(path.length).toBeGreaterThan(0);
    expect(heights.some((h) => h <= line)).toBe(true);
    for (const n of coords(path)) expect(Number.isInteger(n)).toBe(true);
  });

  it("returns nothing when the line is above every peak", () => {
    expect(capPath(heights, rows, rows + 5)).toBe("");
  });
});

describe("columnsFor", () => {
  it("covers the viewport at the given art pixel", () => {
    for (const width of [320, 375, 768, 1440, 2560]) {
      expect(columnsFor(width, 3) * 3).toBeGreaterThanOrEqual(width);
    }
  });

  it("covers a zero width, for the frame before the scene is measured", () => {
    expect(columnsFor(0, 3)).toBeGreaterThan(0);
  });
});
