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
} from "./rotation";
import { WORLDS } from "./avatarData";

const at = (iso: string) => Date.parse(iso);

/**
 * The cross-package pin.
 *
 * Byte-identical to the table in `server/rotation.test.js`. These are recorded
 * outputs, not independently-derived expectations — the properties below are
 * what check the design. What this table is for is *agreement*: edit one
 * implementation's schedule and the other package's suite fails. Two people
 * looking at two different worlds is invisible from inside either half alone.
 */
const PINNED = [
  ["2026-08-12T00:00:00Z", "cafe"],
  ["2026-08-12T00:29:59Z", "cafe"],
  ["2026-08-12T00:30:00Z", "mountain"],
  ["2026-08-12T01:29:59Z", "mountain"],
  ["2026-08-12T01:30:00Z", "cafe"],
  ["2026-08-12T09:00:00Z", "cafe"],
  ["2026-08-12T12:30:00Z", "beach"],
  ["2026-08-12T23:45:00Z", "mountain"],
  ["2026-08-13T09:00:00Z", "space"],
  ["2026-08-14T09:00:00Z", "beach"],
  ["2026-08-15T09:00:00Z", "cafe"],
  ["2027-01-01T00:30:00Z", "city"],
];

describe("rotation schedule", () => {
  it("changes on the :30, not the hour", () => {
    expect(worldAt(at("2026-08-12T00:29:59.999Z"))).toBe(
      worldAt(at("2026-08-12T00:00:00Z")),
    );
    expect(worldAt(at("2026-08-12T00:30:00Z"))).not.toBe(
      worldAt(at("2026-08-12T00:29:59.999Z")),
    );
  });

  it("holds one world for exactly an hour", () => {
    const start = at("2026-08-12T00:30:00Z");
    const world = worldAt(start);
    expect(worldAt(start + ROTATION_MS - 1)).toBe(world);
    expect(worldAt(start + ROTATION_MS)).not.toBe(world);
  });

  it("advances one slot per hour", () => {
    const t = at("2026-08-12T09:00:00Z");
    expect(slotAt(t + ROTATION_MS) - slotAt(t)).toBe(1);
  });

  it("reports when the next changeover lands", () => {
    const t = at("2026-08-12T09:07:30Z");
    expect(new Date(nextRotationAt(t)).toISOString()).toBe(
      "2026-08-12T09:30:00.000Z",
    );
    expect(msUntilRotation(t)).toBe(22 * 60 * 1000 + 30 * 1000);
    expect(worldAt(nextRotationAt(t))).not.toBe(worldAt(t));
  });
});

describe("rotation order", () => {
  it("shows every world once per cycle", () => {
    for (let cycle = 0; cycle < 2000; cycle++) {
      expect(new Set(orderForCycle(cycle)).size).toBe(CYCLE_LENGTH);
    }
  });

  it("never repeats a world across a cycle boundary", () => {
    for (let cycle = 1; cycle < 2000; cycle++) {
      const previous = orderForCycle(cycle - 1);
      expect(orderForCycle(cycle)[0]).not.toBe(previous[CYCLE_LENGTH - 1]);
    }
  });

  it("gives someone who always focuses at 9am a different world each day", () => {
    const nine = (day: number) => worldAt(at(`2026-08-${day}T09:00:00Z`));
    const week = [12, 13, 14, 15, 16, 17, 18].map(nine);
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it("is uniform across positions", () => {
    const counts = new Map(ROTATION_WORLDS.map((w) => [w, 0]));
    const cycles = 8000;
    for (let cycle = 0; cycle < cycles; cycle++) {
      const world = orderForCycle(cycle)[0];
      counts.set(world, (counts.get(world) ?? 0) + 1);
    }
    const expected = cycles / CYCLE_LENGTH;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
  });
});

describe("rotation is a pure function of the clock", () => {
  it("matches the pinned schedule shared with the server", () => {
    for (const [iso, world] of PINNED) {
      expect(`${iso} -> ${worldAt(at(iso))}`).toBe(`${iso} -> ${world}`);
    }
  });

  it("only ever returns a valid world", () => {
    for (const t of [0, -1, at("1969-01-01T00:00:00Z"), at("2099-12-31T23:59:59Z")]) {
      expect(ROTATION_WORLDS).toContain(worldAt(t));
    }
  });

  it("rotates through exactly the worlds the app can draw", () => {
    // Adding a world to avatarData without adding it here would make it
    // unreachable — there is no picker left to select it with.
    expect([...ROTATION_WORLDS].sort()).toEqual(WORLDS.map((w) => w.id).sort());
  });
});
