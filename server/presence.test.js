import { describe, it, expect, beforeEach } from "vitest";
import { createPresenceRegistry } from "./presence.js";

describe("presence registry", () => {
  let p;
  beforeEach(() => {
    p = createPresenceRegistry();
  });

  it("reports the first socket as an offline->online transition", () => {
    expect(p.isOnline("u1")).toBe(false);
    expect(p.add("u1", "a")).toBe(true);
    expect(p.isOnline("u1")).toBe(true);
  });

  it("does not re-announce a user who is already online", () => {
    p.add("u1", "a");
    expect(p.add("u1", "b")).toBe(false);
  });

  it("keeps a user online while any socket remains", () => {
    p.add("u1", "a");
    p.add("u1", "b");
    expect(p.remove("b")).toEqual({ userId: "u1", wentOffline: false });
    expect(p.isOnline("u1")).toBe(true);
  });

  // The bug this module exists for: a second tab used to evict the first, so
  // closing the *newer* tab marked the user offline everywhere while the
  // original tab was still connected.
  it("closing a second tab leaves the first one online", () => {
    p.add("u1", "tab-a");
    p.add("u1", "tab-b");
    p.remove("tab-b");
    expect(p.isOnline("u1")).toBe(true);
    expect(p.socketsFor("u1")).toEqual(["tab-a"]);
  });

  it("goes offline only on the last socket", () => {
    p.add("u1", "a");
    p.add("u1", "b");
    p.remove("a");
    expect(p.remove("b")).toEqual({ userId: "u1", wentOffline: true });
    expect(p.isOnline("u1")).toBe(false);
    expect(p.socketsFor("u1")).toEqual([]);
  });

  it("lists every socket so invites reach all tabs", () => {
    p.add("u1", "a");
    p.add("u1", "b");
    expect(p.socketsFor("u1").sort()).toEqual(["a", "b"]);
  });

  it("keeps users independent", () => {
    p.add("u1", "a");
    p.add("u2", "b");
    p.remove("a");
    expect(p.isOnline("u1")).toBe(false);
    expect(p.isOnline("u2")).toBe(true);
  });

  it("maps a socket back to its user", () => {
    p.add("u1", "a");
    expect(p.userFor("a")).toBe("u1");
    expect(p.userFor("nope")).toBe(null);
  });

  it("removing an unknown socket is a no-op", () => {
    expect(p.remove("ghost")).toEqual({ userId: null, wentOffline: false });
  });

  it("adding the same socket twice does not double-count", () => {
    expect(p.add("u1", "a")).toBe(true);
    expect(p.add("u1", "a")).toBe(false);
    expect(p.remove("a").wentOffline).toBe(true);
  });

  it("ignores falsy ids rather than tracking them", () => {
    expect(p.add(null, "a")).toBe(false);
    expect(p.add("u1", null)).toBe(false);
    expect(p.isOnline(null)).toBe(false);
  });

  it("a re-registered socket does not resurrect a stale user mapping", () => {
    p.add("u1", "a");
    p.remove("a");
    p.add("u2", "a");
    expect(p.userFor("a")).toBe("u2");
    expect(p.isOnline("u1")).toBe(false);
    expect(p.isOnline("u2")).toBe(true);
  });
});
