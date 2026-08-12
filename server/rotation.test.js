import { describe, it, expect } from "vitest";
import {
  ROTATION_WORLDS,
  ROTATION_MS,
  CYCLE_LENGTH,
  slotAt,
  orderForCycle,
  worldAt,
  nextRotationAt,
  msUntilRotation,
} from "./rotation.js";

const at = (iso) => Date.parse(iso);

/**
 * The cross-package pin.
 *
 * These are recorded outputs, not independently-derived expectations — the
 * properties below are what actually check the design. What this table is for
 * is agreement: `client/src/lib/rotation.ts` has a byte-identical copy, so any
 * edit to one implementation that changes the schedule fails the *other*
 * package's suite. Two people looking at two different worlds is the failure
 * this exists to catch, and it is invisible on either side alone.
 */
const PINNED = [
  ['2026-08-12T00:00:00Z', 'cafe'],
  ['2026-08-12T00:29:59Z', 'cafe'],
  ['2026-08-12T00:30:00Z', 'mountain'],
  ['2026-08-12T01:29:59Z', 'mountain'],
  ['2026-08-12T01:30:00Z', 'cafe'],
  ['2026-08-12T09:00:00Z', 'cafe'],
  ['2026-08-12T12:30:00Z', 'beach'],
  ['2026-08-12T23:45:00Z', 'mountain'],
  ['2026-08-13T09:00:00Z', 'space'],
  ['2026-08-14T09:00:00Z', 'beach'],
  ['2026-08-15T09:00:00Z', 'cafe'],
  ['2027-01-01T00:30:00Z', 'city'],
];

describe('rotation schedule', () => {
  it('changes on the :30, not the hour', () => {
    // The offset is the whole reason it isn't `% 3600000`.
    expect(worldAt(at('2026-08-12T00:29:59.999Z'))).toBe(
      worldAt(at('2026-08-12T00:00:00Z')),
    );
    expect(worldAt(at('2026-08-12T00:30:00Z'))).not.toBe(
      worldAt(at('2026-08-12T00:29:59.999Z')),
    );
  });

  it('holds one world for exactly an hour', () => {
    const start = at('2026-08-12T00:30:00Z');
    const world = worldAt(start);
    expect(worldAt(start + ROTATION_MS - 1)).toBe(world);
    expect(worldAt(start + ROTATION_MS)).not.toBe(world);
  });

  it('advances one slot per hour', () => {
    const t = at('2026-08-12T09:00:00Z');
    expect(slotAt(t + ROTATION_MS) - slotAt(t)).toBe(1);
  });

  it('reports when the next changeover lands', () => {
    const t = at('2026-08-12T09:07:30Z');
    expect(new Date(nextRotationAt(t)).toISOString()).toBe(
      '2026-08-12T09:30:00.000Z',
    );
    expect(msUntilRotation(t)).toBe(22 * 60 * 1000 + 30 * 1000);
    // The world at the boundary is the *next* one, never the current one.
    expect(worldAt(nextRotationAt(t))).not.toBe(worldAt(t));
  });
});

describe('rotation order', () => {
  it('shows every world once per cycle', () => {
    for (let cycle = 0; cycle < 2000; cycle++) {
      expect(new Set(orderForCycle(cycle)).size).toBe(CYCLE_LENGTH);
    }
  });

  it('never repeats a world across a cycle boundary', () => {
    // Without the fix-up in orderForCycle this happens about 1 cycle in 8, and
    // shows the same scene for two hours running.
    for (let cycle = 1; cycle < 2000; cycle++) {
      const previous = orderForCycle(cycle - 1);
      expect(orderForCycle(cycle)[0]).not.toBe(previous[CYCLE_LENGTH - 1]);
    }
  });

  it('gives someone who always focuses at 9am a different world each day', () => {
    // The reason the order is shuffled per cycle at all: eight worlds at an
    // hour each divides evenly into a day, so a fixed order pins every
    // wall-clock time to one world for good.
    const nine = (day) => worldAt(at(`2026-08-${day}T09:00:00Z`));
    const week = [12, 13, 14, 15, 16, 17, 18].map(nine);
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    const t = at('2026-08-12T09:00:00Z');
    expect(worldAt(t)).toBe(worldAt(t));
    expect(orderForCycle(1234)).toEqual(orderForCycle(1234));
  });

  it('is uniform across positions', () => {
    // A shuffle that favours a position would park one world at, say, every
    // 09:30 — the same defect the shuffle exists to prevent, just subtler.
    const counts = new Map(ROTATION_WORLDS.map((w) => [w, 0]));
    const cycles = 8000;
    for (let cycle = 0; cycle < cycles; cycle++) {
      const world = orderForCycle(cycle)[0];
      counts.set(world, counts.get(world) + 1);
    }
    const expected = cycles / CYCLE_LENGTH;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
  });
});

describe('rotation is a pure function of the clock', () => {
  it('matches the pinned schedule shared with the client', () => {
    for (const [iso, world] of PINNED) {
      expect(`${iso} -> ${worldAt(at(iso))}`).toBe(`${iso} -> ${world}`);
    }
  });

  it('only ever returns a valid world', () => {
    // Including before the epoch, where `%` on a negative slot would otherwise
    // index off the front of the array and put the server in no world at all.
    for (const t of [0, -1, at('1969-01-01T00:00:00Z'), at('2099-12-31T23:59:59Z')]) {
      expect(ROTATION_WORLDS).toContain(worldAt(t));
    }
    for (let i = 0; i < 500; i++) {
      expect(ROTATION_WORLDS).toContain(worldAt(at('2026-08-12T00:30:00Z') + i * ROTATION_MS));
    }
  });

  it('no longer offers the retired lofi world', () => {
    expect(ROTATION_WORLDS).not.toContain('lofi');
  });
});
