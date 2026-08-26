// ─────────────────────────────────────────────────────────────────────────────
// Scene constants — the two numbers every piece of world art has to agree on.
//
// Both used to be duplicated literals. GROUND was written out three times
// (WorldDecorations, GameWorld, LandingPage) and kept in step by hand, and the
// art pixel was whatever number each call site passed to `scale`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Height of the ground plane, as a fraction of the scene box. Anything
 * standing in the world is anchored to it: the plane itself is this tall, and
 * a sprite's feet sit exactly on top of it.
 */
export const GROUND = "19%";

/**
 * One art pixel, in CSS px. A pixel-art scene has exactly one of these — a
 * sprite rendering its pixels bigger than its neighbour's is the single
 * clearest tell of amateur pixel art, and it is not fixable by rescaling
 * later, because a sprite's apparent pixel size *is* its scale.
 *
 * Everything in the scene is on it — characters, pets and, since the
 * backgrounds redraw (PR #37), all of the scenery. `WorldDecorations.test.tsx`
 * asserts one density per world with no exemptions, so a new sprite that picks
 * its own scale fails the suite rather than quietly reintroducing two pixel
 * grids in one frame.
 *
 * This is the *desktop* size and the default everywhere. A small screen uses
 * `ART_PX_COMPACT` instead — see `artPxFor` below.
 */
export const ART_PX = 3;

/**
 * One art pixel on a small screen, in CSS px.
 *
 * The scene is a full-bleed background (`GameWorld` is `absolute inset-0`
 * inside an `h-dvh` shell), so on a 360px phone a 16x24 character at ART_PX is
 * 48x72 — the same CSS px it occupies on a 27" monitor, against a third of the
 * width to stand in.
 *
 * **2, not `ART_PX * 0.75`.** A non-integer scale resamples every hard edge
 * into grey fringe, which is the one thing this art cannot survive; that is
 * the same rule that keeps sprite transforms on whole pixels. So the knob has
 * exactly one stop below 3, and dropping to it takes the character to 32x48.
 */
export const ART_PX_COMPACT = 2;

/**
 * The art pixel for a scene box of `width` x `height` CSS px.
 *
 * **The thresholds are the two lines this codebase already draws for mobile**,
 * not new ones: 640 is Tailwind's `sm`, which every responsive class in the app
 * keys off, and 520 is the `max-height` query in `globals.css` that gives the
 * HUD its compact form. Reusing them means the scene shrinks on exactly the
 * screens the chrome around it already treats as small. It also gets landscape
 * right, which a width query alone cannot: a landscape phone is *wide*, so
 * width would say "desktop" precisely when the vertical room has run out.
 *
 * **An unmeasured box is not a small box.** A box of 0 is what both the first
 * frame and jsdom report, and shrinking every sprite on a measurement that has
 * not happened yet is worse than being briefly too big — so 0 answers with the
 * desktop size, which is also what a server render has to assume.
 */
export function artPxFor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return ART_PX;
  return width < 640 || height < 520 ? ART_PX_COMPACT : ART_PX;
}
