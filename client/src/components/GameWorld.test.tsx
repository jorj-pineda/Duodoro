import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import GameWorld, { type GamePhase } from "./GameWorld";
import { DEFAULT_AVATAR } from "@/lib/avatarData";

// The scene used to place characters with `calc(41.7% + 8px)` on `left` and
// spin the break-phase controller ±10°. Both put sprite edges between device
// pixels, which is what made the art look soft no matter what
// `shapeRendering: crispEdges` claimed. Neither shows up in a rect count, so
// this asserts on what the scene actually puts in the DOM.

const me = { id: "me", avatar: DEFAULT_AVATAR };
const partner = { id: "them", avatar: DEFAULT_AVATAR };

function renderScene(phase: GamePhase, focusProgress = 0, returning = 0) {
  return render(
    <GameWorld
      worldId="forest"
      phase={phase}
      focusProgress={focusProgress}
      returningProgress={returning}
      me={me}
      partner={partner}
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
