import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import GameWorld, { type GamePhase } from "./GameWorld";
import { DEFAULT_AVATAR, type WorldId } from "@/lib/avatarData";
import { ART_PX, GROUND } from "@/lib/scene";
import { CHAR_W, CHAR_H } from "@/lib/characterMaps";
import { PET_W, PET_H } from "@/lib/petMaps";

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
  worldId: WorldId = "forest",
) {
  return render(
    <GameWorld
      worldId={worldId}
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

/**
 * The sprite drawn on a `w`x`h` map.
 *
 * Matched on the map's shape rather than on an exact viewBox string, because
 * the outline pass draws one cell outside the map and grows the viewBox to
 * match — an outlined sprite is its own size plus a one-cell border.
 */
function findSprite(container: HTMLElement, w: number, h: number) {
  const svg = Array.from(container.querySelectorAll("svg")).find((el) => {
    const [, , vw, vh] = (el.getAttribute("viewBox") ?? "").split(" ").map(Number);
    return (vw === w || vw === w + 2) && (vh === h || vh === h + 2);
  });
  expect(svg, `no sprite on a ${w}x${h} grid`).toBeTruthy();
  return svg!;
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
  function density(container: HTMLElement, w: number, h: number) {
    const svg = findSprite(container, w, h);
    const cells = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    return Number(svg.getAttribute("width")) / cells;
  }

  it("draws characters and their pets on the same pixel grid", () => {
    const { container } = renderScene("waiting", 0, 0, true);
    // Read the grids from the art rather than writing them out here — this
    // test hardcoded "0 0 10 11" and had to be edited when the pets were
    // redrawn, which is the kind of edit that quietly turns a check into a
    // restatement of whatever the code now does.
    expect(density(container, CHAR_W, CHAR_H)).toBe(ART_PX);
    expect(density(container, PET_W, PET_H)).toBe(ART_PX);
  });

  it("keeps pets to something like an animal's share of a person's height", () => {
    // Pets were 10x11 against a 16x24 person: 0.46x a human, where a cat is
    // about 0.25x. They only looked right while they were rendering at a
    // smaller pixel than the character, which is the mismatch ART_PX removed.
    //
    // Measured off the rendered SVGs, not off PET_H / CHAR_H. Those constants
    // describe the *maps*, and the outline pass adds a cell all round — which
    // is +8% on a 24-row person and +29% on a 7-row pet. Asserting on the maps
    // said 0.29 while the screen showed 0.35, i.e. the test was passing on a
    // number nobody could see.
    //
    // A guard, not an A/B.
    const { container } = renderScene("waiting", 0, 0, true);
    const height = (w: number, h: number) =>
      Number(findSprite(container, w, h).getAttribute("height"));
    const ratio = height(PET_W, PET_H) / height(CHAR_W, CHAR_H);
    expect(ratio).toBeLessThan(0.38);
    expect(ratio).toBeGreaterThan(0.2);
  });

  it("pins the ratio so a bounding-box change has to notice", () => {
    // A one-cell border costs a 7-row pet proportionally far more than a
    // 24-row person: turning outlines on moved this from 0.292 to 0.346, about
    // a third of the shrink #39 gave the pets, as a side effect of a change
    // about keylines. The outlines came back off, so it is 0.292 again — and
    // pinned, because the next thing to touch either box will move it too.
    expect((PET_H / CHAR_H).toFixed(3)).toBe("0.292");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contact shadows — what stops a sprite reading as hovering.
// ─────────────────────────────────────────────────────────────────────────────

describe("contact shadows", () => {
  /** Only the ones inside the character wrappers; the scenery's are elsewhere. */
  function characterShadows(container: HTMLElement) {
    return characterWrappers(container).flatMap((wrapper) =>
      Array.from(wrapper.querySelectorAll<HTMLElement>("div")).filter(
        (el) => el.style.opacity === "0.26" && el.style.height === `${ART_PX}px`,
      ),
    );
  }

  it("grounds both people and both pets", () => {
    // A/B — fails against the previous commit. `Grounded` has given every tree
    // a shadow since the backgrounds landed, but the characters are drawn from
    // GameWorld rather than WorldDecorations and so got none: two people
    // hovering in a scene where the scenery stands on the floor.
    const { container } = renderScene("waiting", 0, 0, true);
    expect(characterShadows(container).length).toBe(4);
  });

  it("still grounds a lone player with no pet", () => {
    const { container } = renderScene("waiting");
    expect(characterShadows(container).length).toBe(2);
  });

  it("keeps a shadow narrower than the sprite casting it", () => {
    // A guard, not an A/B. A shadow the full width of the sprite's bounding box
    // reads as a plinth rather than as contact — the avatar's box includes its
    // shoulders, and shoulders do not touch the ground.
    const { container } = renderScene("waiting", 0, 0, true);
    const widths = characterShadows(container).map((el) =>
      Number.parseInt(el.style.width, 10),
    );
    expect(widths.length).toBe(4);
    for (const w of widths) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(CHAR_W * ART_PX);
    }
  });
});
