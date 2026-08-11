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
 * The characters and pets are on it. The scenery is not yet: `MountainDecor`
 * alone renders at 5, 6, 7 and 8, and moving it to ART_PX today would shrink
 * the front range from 128px wide to 48px. Keeping its on-screen size means
 * redrawing the map at 43x27 cells instead of 16x10 — that is the redraw in
 * roadmap item 7b, not a constant swap. The deviations are catalogued in
 * WorldDecorations; do not "fix" them by scaling a small map up.
 */
export const ART_PX = 3;
