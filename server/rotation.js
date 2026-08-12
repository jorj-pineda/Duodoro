// ─────────────────────────────────────────────────────────────────────────────
// Rotating world themes — derived from the wall clock, never stored.
//
// One world at a time, the same for everybody, changing on the :30 of every
// hour. Modelled on PEAK: you don't pick a mountain, you climb whichever one
// the game is on right now.
//
// **Derived, not stored**, deliberately. Session state already lives only in
// memory and dies with the process, so anything persisted about the rotation
// would be one more thing to resync after a restart — and one more thing that
// can disagree between two instances. A pure function of the clock needs no
// coordination at all: every server, every browser tab and every late joiner
// reach the same answer with no round trip and nothing to drift.
//
// **This file is duplicated at `client/src/lib/rotation.ts`.** `client/` and
// `server/` are independent npm packages with separate lockfiles and cannot
// import each other. Both copies are pinned to the same table of timestamps in
// their tests (`rotation.test.js` / `rotation.test.ts`), so editing one and not
// the other fails the other package's suite rather than silently showing two
// people two different worlds.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The rotation, and the only list of valid worlds left on the server.
 *
 * 'lofi' was retired in favour of 'grocery' and is absent here, so nothing new
 * can be created in it; migration 019 keeps it legal in the `sessions` CHECK so
 * existing history rows stay valid. Adding a world means this list, the client's
 * `WorldId`, and the SQL CHECK — see CLAUDE.md.
 */
const ROTATION_WORLDS = [
  'forest',
  'space',
  'beach',
  'city',
  'mountain',
  'library',
  'cafe',
  'grocery',
];

/** How long one world is up. */
const ROTATION_MS = 60 * 60 * 1000;

/**
 * How far the boundary sits from the top of the hour.
 *
 * The offset is the point: a theme change landing exactly on the hour would
 * land on the same tick as everybody's o'clock pomodoro boundary, so the two
 * events would compete. Anchored in UTC, because the whole product premise is
 * that two people in different timezones see the same world.
 */
const ROTATION_OFFSET_MS = 30 * 60 * 1000;

/** Slots per cycle — one cycle is every world, once. */
const CYCLE_LENGTH = ROTATION_WORLDS.length;

/**
 * Integer hash. No `Math.sin`, no floats.
 *
 * The scenery generators seed themselves with `Math.sin`, which is fine when a
 * one-ULP difference between engines moves a rock. Here the client and the
 * server have to reach *the same world*, and the client runs on engines this
 * code has never been tested against. ECMA-262 does not require transcendental
 * functions to be bit-identical between implementations; integer ops are.
 */
function hash32(n) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Which rotation slot a moment falls in. Slot 0 began at 00:30 on 1 Jan 1970. */
function slotAt(now) {
  return Math.floor((now - ROTATION_OFFSET_MS) / ROTATION_MS);
}

/**
 * The order the worlds come up in during one cycle of eight slots.
 *
 * Shuffled per cycle rather than fixed. Eight worlds at an hour each is an
 * eight-hour loop, and eight divides twenty-four — so with a fixed order,
 * somebody who always focuses at 9am would get the same world every single
 * day, forever. Re-shuffling each cycle keeps the guarantee that you see all
 * eight in eight hours while making the daily sequence different.
 */
function rawOrderForCycle(cycle) {
  const order = ROTATION_WORLDS.slice();
  // Fisher–Yates, drawing from the integer hash rather than a PRNG object so
  // the same cycle always produces the same order on any engine.
  for (let i = order.length - 1; i > 0; i--) {
    const j = hash32(Math.imul(cycle, 0x9e3779b1) + i) % (i + 1);
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
}

/**
 * As above, but never opening on the world the previous cycle closed with —
 * that would show the same scene for two hours running and read as a bug.
 *
 * Comparing against the *raw* previous order is safe and keeps this
 * non-recursive: the fix only ever touches positions 0 and 1, and the position
 * being compared is the last one.
 */
function orderForCycle(cycle) {
  const order = rawOrderForCycle(cycle);
  const previous = rawOrderForCycle(cycle - 1);
  if (order.length > 1 && order[0] === previous[previous.length - 1]) {
    const swap = order[0];
    order[0] = order[1];
    order[1] = swap;
  }
  return order;
}

/** The world in play at `now` (defaults to this instant). */
function worldAt(now = Date.now()) {
  const slot = slotAt(now);
  // `%` keeps the sign of the dividend in JS, and slots before 1970 are
  // negative. Nothing sane hits this, but a negative index returns undefined
  // and would put the server in no world at all.
  const cycle = Math.floor(slot / CYCLE_LENGTH);
  const position = ((slot % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
  return orderForCycle(cycle)[position];
}

/** Epoch ms of the next changeover. */
function nextRotationAt(now = Date.now()) {
  return (slotAt(now) + 1) * ROTATION_MS + ROTATION_OFFSET_MS;
}

/** How long the current world has left, in ms. */
function msUntilRotation(now = Date.now()) {
  return nextRotationAt(now) - now;
}

module.exports = {
  ROTATION_WORLDS,
  ROTATION_MS,
  ROTATION_OFFSET_MS,
  CYCLE_LENGTH,
  slotAt,
  orderForCycle,
  worldAt,
  nextRotationAt,
  msUntilRotation,
};
