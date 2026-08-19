import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Soft-SaaS chrome around a pixel-art game: Geist Mono on the timer, a
// frosted HUD card, Feather round-caps, pill buttons. These read the source
// because a render() of SessionHUD needs a socket session and still wouldn't
// tell you whether the class list was rounded-2xl.

const here = (...parts: string[]) =>
  readFileSync(path.join(__dirname, ...parts), "utf8");

const HUD = here("SessionHUD.tsx");
const ICONS = here("Icons.tsx");
const BUTTON = here("Button.tsx");
const WORLD = here("GameWorld.tsx");

describe("pixel chrome", () => {
  it("sets the timer in Pixelify, not Geist Mono", () => {
    // A/B — hud-timer used to be font-mono.
    const timer = HUD.match(/hud-timer[^\n]+/)?.[0] ?? "";
    expect(timer).toMatch(/font-display/);
    expect(timer).not.toMatch(/font-mono/);
  });

  it("does not glass the HUD card", () => {
    // A/B — hud-card used to be rounded-2xl backdrop-blur shadow-xl.
    const card = HUD.match(/className="hud-card[^"]+"/)?.[0] ?? "";
    expect(card).toContain("hud-card");
    expect(card).not.toMatch(/backdrop-blur/);
    expect(card).not.toMatch(/rounded-2xl/);
    expect(card).not.toMatch(/shadow-xl/);
  });

  it("draws square-cap icons, not Feather rounds", () => {
    // A/B — strokeLinecap/Linejoin were "round".
    expect(ICONS).toMatch(/strokeLinecap: "square"/);
    expect(ICONS).toMatch(/strokeLinejoin: "miter"/);
    expect(ICONS).not.toMatch(/strokeLinecap: "round"/);
  });

  it("keeps buttons square to match the border-b-4 press", () => {
    expect(BUTTON).not.toMatch(/rounded-xl/);
    expect(BUTTON).not.toMatch(/rounded-2xl/);
  });

  it("does not draw the waiting slot as a dashed circle", () => {
    expect(WORLD).not.toMatch(/rounded-full border-2 border-dashed/);
  });
});
