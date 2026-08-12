import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import GameWorld, { type GamePhase } from "./GameWorld";
import { DEFAULT_AVATAR } from "@/lib/avatarData";
import { ART_PX, GROUND } from "@/lib/scene";

// The scene used to place characters with `calc(41.7% + 8px)` on `left` and
// spin the break-phase controller ±10°. Both put sprite edges between device
// pixels, which is what made the art look soft no matter what
// `shapeRendering: crispEdges` claimed. Neither shows up in a rect count, so
// this asserts on what the scene actually puts in the DOM.

const me = { id: "me", avatar: DEFAULT_AVATAR };
const partner = { id: "them", avatar: DEFAULT_AVATAR };

function renderScene(
  phase: GamePhase,
  focusProgress = 0,
  returning = 0,
  pets = false,
) {
  return render(
    <GameWorld
      worldId="forest"
      phase={phase}
      focusProgress={focusProgress}
      returningProgress={returning}
      me={me}
      partner={partner}
      myPet={pets ? "cat" : null}
      partnerPet={pets ? "dog" : null}
      myName="ME"
      partnerName="THEM"
    />,
  );
}

/** The two absolutely-positioned character wrappers. */
function characterWrappers(container: HTMLElement) {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("div.absolute.z-20"),
  );
  expect(nodes.length).toBe(2);
  return nodes;
}

describe("character placement", () => {
  const cases: [GamePhase, number, number][] = [
    ["waiting", 0, 0],
    ["focus", 0.37, 0],
    ["celebration", 0, 0],
    ["break", 0, 0],
    ["returning", 0, 0.63],
  ];

  for (const [phase, focus, returning] of cases) {
    it(`places both characters on whole pixels during ${phase}`, () => {
      const { container } = renderScene(phase, focus, returning);
      for (const node of characterWrappers(container)) {
        // A percentage of an arbitrary container width is a fractional pixel
        // in every case that matters.
        expect(node.style.left).not.toMatch(/%/);
        expect(node.style.right).not.toMatch(/%/);
        const offsets = [
          node.style.left,
          node.style.right,
          ...Array.from(node.style.transform.matchAll(/\(([^)]*)\)/g)).map(
            (m) => m[1],
          ),
        ].filter(Boolean);
        for (const value of offsets) {
          expect(value, `${phase}: "${value}" is not a whole pixel`).toMatch(
            /^(0|-?\d+px)$/,
          );
        }
      }
    });
  }
});

describe("break overlay", () => {
  it("wiggles the controller without rotating it", () => {
    const { container } = renderScene("break");
    const shuffled = container.querySelector(".pixel-shuffle");
    expect(shuffled, "controller is not using the stepped shuffle").toBeTruthy();
    for (const el of container.querySelectorAll<HTMLElement>("*")) {
      expect(el.style.transform ?? "").not.toMatch(/rotate/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// One ground line, one art pixel.
// ─────────────────────────────────────────────────────────────────────────────

describe("ground line", () => {
  it("stands everything in the scene on the same line", () => {
    const { container } = renderScene("waiting");
    // Trees, hills and both characters anchor to the scene with a percentage
    // `bottom`. Any percentage that isn't GROUND is something standing off the
    // horizon — which is exactly what `calc(19% - 4px)` was.
    //
    // Pixel offsets are excluded on purpose: those are local nudges inside a
    // sprite's own wrapper (a contact shadow sitting one art pixel below its
    // owner), not claims about where the ground is.
    const anchors = new Set(
      Array.from(container.querySelectorAll<HTMLElement>("[style*='bottom']"))
        .map((el) => el.style.bottom)
        .filter((v) => v.includes("%")),
    );
    expect(anchors).toEqual(new Set([GROUND]));
  });

  it("anchors the character by its feet, not by its name tag", () => {
    // The tag has to be out of flow. As an ordinary child it is the wrapper's
    // bottom edge, so anchoring the wrapper to the ground lands the label on
    // the ground and leaves the character a label's height in the air.
    const { container } = renderScene("waiting");
    for (const wrapper of characterWrappers(container)) {
      const tag = wrapper.querySelector<HTMLElement>(".text-\\[10px\\]");
      expect(tag, "no name tag rendered").toBeTruthy();
      expect(tag!.className).toContain("absolute");
    }
  });
});

describe("one art pixel", () => {
  /** CSS px per art pixel, read off a sprite's own SVG. */
  function density(container: HTMLElement, viewBox: string) {
    const svg = container.querySelector(`svg[viewBox="${viewBox}"]`);
    expect(svg, `no sprite with viewBox "${viewBox}"`).toBeTruthy();
    const cells = Number(viewBox.split(" ")[2]);
    return Number(svg!.getAttribute("width")) / cells;
  }

  it("draws characters and their pets on the same pixel grid", () => {
    const { container } = renderScene("waiting", 0, 0, true);
    // The scenery is deliberately not here yet — see the deviation table in
    // WorldDecorations. These two are what stand side by side in one frame.
    expect(density(container, "0 0 16 24")).toBe(ART_PX);
    expect(density(container, "0 0 10 11")).toBe(ART_PX);
  });
});
