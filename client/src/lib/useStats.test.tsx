import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// One rpc mock for all four calls useStats fires in parallel.
let rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ rpc: (fn: string) => rpc(fn) }),
}));

import { useStats } from "./useStats";

const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const okRow = {
  total_focus_time: "9000",
  weekly_focus_time: "3600",
  sessions_completed: "12",
  current_streak: "40",
  longest_streak: "40",
  avg_session_length: "750",
};

const succeed = () => {
  rpc = async (fn) => ({
    data: fn === "get_focus_stats" ? [okRow] : [],
    error: null,
  });
};

const fail = (message = "network is down") => {
  rpc = async () => ({ data: null, error: Object.assign(new Error(message)) });
};

// The module keeps a 30s cache and an in-flight map keyed by userId, shared
// across every mount. Each test needs its own key or it inherits the last
// test's result.
let seq = 0;
const freshUser = () => `${USER}-${seq++}`;

describe("useStats failure reporting", () => {
  beforeEach(() => {
    succeed();
  });

  it("reports real numbers on success", async () => {
    const { result } = renderHook(() => useStats(freshUser()));
    await act(async () => {
      await result.current.fetchStats();
    });
    expect(result.current.personalStats?.currentStreak).toBe(40);
    expect(result.current.error).toBeNull();
    expect(result.current.loaded).toBe(true);
  });

  // The bug: a failed load left the snapshot EMPTY and said nothing, so callers
  // rendered "Streak 0d" — identical to a brand-new account.
  it("surfaces an error rather than silently reporting nothing", async () => {
    fail("infinite recursion detected in policy");
    const { result } = renderHook(() => useStats(freshUser()));
    await act(async () => {
      await result.current.fetchStats();
    });
    expect(result.current.error).toBe("infinite recursion detected in policy");
  });

  // This is the flag that lets the UI refuse to draw zeros. Without it there is
  // no way to tell "fetched, genuinely empty" from "never loaded".
  it("does not mark itself loaded when the fetch failed", async () => {
    fail();
    const { result } = renderHook(() => useStats(freshUser()));
    await act(async () => {
      await result.current.fetchStats();
    });
    expect(result.current.loaded).toBe(false);
    expect(result.current.personalStats).toBeNull();
  });

  it("is loaded with null stats for a genuinely empty account", async () => {
    rpc = async () => ({ data: [], error: null });
    const { result } = renderHook(() => useStats(freshUser()));
    await act(async () => {
      await result.current.fetchStats();
    });
    // Same personalStats as the failure case — hence the need for `loaded`.
    expect(result.current.personalStats).toBeNull();
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("recovers on retry and clears the error", async () => {
    const id = freshUser();
    fail();
    const { result } = renderHook(() => useStats(id));
    await act(async () => {
      await result.current.fetchStats();
    });
    expect(result.current.error).toBeTruthy();

    succeed();
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.personalStats?.currentStreak).toBe(40);
    expect(result.current.loaded).toBe(true);
  });

  it("stops loading after a failure so the UI isn't stuck on a spinner", async () => {
    fail();
    const { result } = renderHook(() => useStats(freshUser()));
    await act(async () => {
      await result.current.fetchStats();
    });
    expect(result.current.loading).toBe(false);
  });
});
