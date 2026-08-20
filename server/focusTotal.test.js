import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchTotalFocusSeconds } from "./focusTotal.js";

/**
 * A Supabase double that records what it was asked for.
 *
 * It deliberately implements **only** `.rpc()`. A `.from()` on this throws,
 * which is what makes the round-trip test below an A/B rather than a
 * restatement: the previous implementation selected rows through the query
 * builder and cannot pass against this fake.
 */
function fakeSupabase(result) {
  const calls = [];
  return {
    calls,
    client: {
      rpc(fn, args) {
        calls.push([fn, args]);
        return Promise.resolve(result);
      },
    },
  };
}

const ok = (data) => ({ data, error: null });

describe("fetchTotalFocusSeconds", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("is 0 in dev mode, where there is no Supabase at all", async () => {
    expect(await fetchTotalFocusSeconds(null, "user-1")).toBe(0);
  });

  it("is 0 for an anonymous socket, which has no history to read", async () => {
    const { client } = fakeSupabase(ok(3600));
    expect(await fetchTotalFocusSeconds(client, null)).toBe(0);
  });

  /**
   * The A/B. Postgres does the sum and hands back one integer; the previous
   * implementation fetched one row per completed session and added them up
   * here. Against that code this fails — there is no `.from()` to call.
   */
  it("asks Postgres for one number instead of a row per session", async () => {
    const { client, calls } = fakeSupabase(ok(3600));
    const total = await fetchTotalFocusSeconds(client, "user-1");
    expect(calls).toEqual([["total_focus_seconds", { target: "user-1" }]]);
    expect(total).toBe(3600);
  });

  it("is 0 for a user with no completed sessions yet", async () => {
    // The function coalesces to 0, so this is a real answer, not a failure.
    const { client } = fakeSupabase(ok(0));
    expect(await fetchTotalFocusSeconds(client, "user-1")).toBe(0);
  });

  it("parses a scalar handed back as a string or a one-element array", async () => {
    for (const shape of ["3600", [3600]]) {
      const { client } = fakeSupabase(ok(shape));
      expect(await fetchTotalFocusSeconds(client, "user-1")).toBe(3600);
    }
  });

  /**
   * The guard that matters most here. A read that fails must not read as a
   * beginner: `null` is what the caller turns into `grown`, and returning 0
   * would shrink someone's pet every time the database hiccuped.
   */
  it("is null — not 0 — when the read fails", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await fetchTotalFocusSeconds(client, "user-1")).toBe(null);
  });

  it("is null — not 0 — when the answer is missing or unusable", async () => {
    for (const junk of [null, undefined, "", "abc", -1, {}]) {
      const { client } = fakeSupabase(ok(junk));
      expect(await fetchTotalFocusSeconds(client, "user-1"), String(junk)).toBe(
        null,
      );
    }
  });
});
