import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WorldDecor } from "./WorldDecorations";
import { WORLDS } from "@/lib/avatarData";
import { ART_PX } from "@/lib/scene";

// Two defects that were invisible to every existing test, because both live in
// the relationship between an SVG's viewBox and its rendered box rather than in
// any rect coordinate:
//
//   1. `preserveAspectRatio="none"` on a full-width band — the hills were not
//      scaled, they were stretched to about 45x10 per "pixel".
//   2. Sprites drawn at 2, 3, 5, 6, 7 and 8 CSS px per art pixel in one frame.

const SCENE_WIDTH = 640;
const worldIds = WORLDS.map((w) => w.id);

/** CSS px per art pixel for every sprite in a rendered scene. */
function densities(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll("svg"))
    .map((svg) => {
      const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
      const width = Number(svg.getAttribute("width"));
      if (!vb || vb.length < 3 || !vb[2] || !width) return null;
      return width / vb[2];
    })
    .filter((d): d is number => d !== null);
}

function scene(worldId: (typeof worldIds)[number]) {
  return render(<WorldDecor worldId={worldId} sceneWidth={SCENE_WIDTH} />)
    .container;
}

describe("scenery geometry", () => {
  for (const worldId of worldIds) {
    it(`${worldId} never stretches a sprite`, () => {
      const container = scene(worldId);
      for (const svg of Array.from(container.querySelectorAll("svg"))) {
        expect(
          svg.getAttribute("preserveAspectRatio"),
          `${worldId} has a stretched band — its pixels are not square`,
        ).not.toBe("none");
      }
    });

    it(`${worldId} draws every sprite on a whole number of pixels`, () => {
      for (const d of densities(scene(worldId))) {
        expect(Number.isInteger(d), `${worldId} renders at ${d} px per art pixel`).toBe(
          true,
        );
      }
    });
  }
});

describe("one art pixel per scene", () => {
  // Only the worlds whose sprites have actually been redrawn. The rest still
  // mix densities and are listed as outstanding in WorldDecorations' own
  // deviation table — asserting on them now would just encode the bug.
  for (const worldId of ["forest", "mountain"] as const) {
    it(`${worldId} renders everything at ART_PX`, () => {
      const found = new Set(densities(scene(worldId)));
      expect(found).toEqual(new Set([ART_PX]));
    });
  }

  it("the remaining worlds are the known backlog, not a surprise", () => {
    // A guard on the size of the debt: if a redraw lands, this list shrinks and
    // the test says so rather than silently passing.
    const mixed = worldIds.filter(
      (id) => new Set(densities(scene(id))).size > 1,
    );
    expect(mixed.sort()).toEqual([
      "beach",
      "cafe",
      "city",
      "library",
      "lofi",
      "space",
    ]);
  });
});

describe("terrain covers the scene", () => {
  it("draws ridges at least as wide as the scene", () => {
    const container = scene("forest");
    const ridges = Array.from(container.querySelectorAll("svg")).filter((s) =>
      s.querySelector("path"),
    );
    expect(ridges.length).toBeGreaterThan(0);
    for (const r of ridges) {
      expect(Number(r.getAttribute("width"))).toBeGreaterThanOrEqual(
        SCENE_WIDTH,
      );
    }
  });
});
