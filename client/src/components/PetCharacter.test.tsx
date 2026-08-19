import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import PetCharacter from "./PetCharacter";
import { PET_OPTIONS } from "@/lib/types";
import { PET_STAGES } from "@/lib/petLevel";

// A rect drawn outside the viewBox is silently clipped — it costs nothing at
// runtime and produces no warning, so the cat and rabbit shipped with their
// planted foot at y=10 inside a `0 0 10 10` viewBox and simply never drew it.
// Reading the source can't catch that; comparing geometry to the viewBox can.

type Box = { x: number; y: number; w: number; h: number };

function spriteGeometry(el: HTMLElement) {
  const svg = el.querySelector("svg");
  if (!svg) throw new Error("no svg rendered");
  const vb = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const rects: Box[] = Array.from(svg.querySelectorAll("rect")).map((r) => ({
    x: Number(r.getAttribute("x") ?? 0),
    y: Number(r.getAttribute("y") ?? 0),
    w: Number(r.getAttribute("width") ?? 0),
    h: Number(r.getAttribute("height") ?? 0),
  }));
  return { minX: vb[0], minY: vb[1], width: vb[2], height: vb[3], rects };
}

const PETS = PET_OPTIONS.map((p) => p.type);

describe("pet sprite geometry", () => {
  afterEach(() => vi.useRealTimers());

  // legUp flips on a 250ms interval while walking, and each frame draws a
  // different pair of leg rows — so both frames have to be checked. frame 0 is
  // legUp, frame 1 is its opposite.
  for (const frame of [0, 1]) {
    for (const stage of PET_STAGES) {
      for (const type of PETS) {
        it(`${type} ${stage} draws entirely inside its viewBox (walk frame ${frame})`, () => {
          vi.useFakeTimers();
          const { container } = render(
            <PetCharacter type={type} stage={stage} size={2} anim="walk" />,
          );
          if (frame === 1) {
            act(() => void vi.advanceTimersByTime(250));
          }
          const { minX, minY, width, height, rects } = spriteGeometry(container);
          expect(rects.length).toBeGreaterThan(0);
          for (const r of rects) {
            expect(r.x).toBeGreaterThanOrEqual(minX);
            expect(r.y).toBeGreaterThanOrEqual(minY);
            expect(r.x + r.w).toBeLessThanOrEqual(minX + width);
            expect(r.y + r.h).toBeLessThanOrEqual(minY + height);
          }
        });
      }
    }
  }

  // The specific regression: two legs drawn, two legs visible.
  for (const stage of PET_STAGES) {
    for (const type of PETS) {
      it(`${type} ${stage} has a foot on its bottom row so it stands on the ground`, () => {
        const { container } = render(
          <PetCharacter type={type} stage={stage} size={2} />,
        );
        const { minY, height, rects } = spriteGeometry(container);
        const bottom = minY + height;
        expect(rects.some((r) => r.y + r.h === bottom)).toBe(true);
      });
    }
  }

  it("renders every pet of a given stage on the same grid", () => {
    for (const stage of PET_STAGES) {
      const boxes = PETS.map((type) => {
        const { container } = render(
          <PetCharacter type={type} stage={stage} size={2} />,
        );
        const { width, height } = spriteGeometry(container);
        return `${width}x${height}`;
      });
      expect(new Set(boxes).size, stage).toBe(1);
    }
  });

  it("defaults a missing stage to grown, so an older server does not shrink pets", () => {
    const grown = spriteGeometry(
      render(<PetCharacter type="cat" stage="grown" size={2} />).container,
    );
    const missing = spriteGeometry(
      render(<PetCharacter type="cat" size={2} />).container,
    );
    expect(`${missing.width}x${missing.height}`).toBe(
      `${grown.width}x${grown.height}`,
    );
  });
});
