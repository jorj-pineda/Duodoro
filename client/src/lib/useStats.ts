"use client";
import { useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import type {
  SessionWithPartner,
  PersonalStats,
  DuoStats,
  DailyFocus,
} from "@/lib/types";

// Everything is aggregated in Postgres now (migration 015). This used to pull
// the user's entire session history — no LIMIT — aggregate it in JS, then send
// every session id back as an .in() list to find co-participants; a `sessions`
// row is written per focus phase, so that query outgrew PostgREST's URL limit
// with ordinary use.

type Snapshot = {
  personalStats: PersonalStats | null;
  duoStats: DuoStats[];
  recentSessions: SessionWithPartner[];
  dailyFocus: DailyFocus[];
};

const EMPTY: Snapshot = {
  personalStats: null,
  duoStats: [],
  recentSessions: [],
  dailyFocus: [],
};

// HomeDashboard, StatsPanel and StatsScreen each mount their own useStats, so
// opening the app fired the whole thing three times over. Share one in-flight
// request and a short-lived result between them.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: Snapshot }>();
const inFlight = new Map<string, Promise<Snapshot>>();

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// No userId parameter: every RPC derives the caller from auth.uid() server-side.
async function loadSnapshot(): Promise<Snapshot> {
  const sb = getSupabase();
  const tz = localTimeZone();

  const [stats, duos, recent, daily] = await Promise.all([
    sb.rpc("get_focus_stats", { tz }),
    sb.rpc("get_duo_stats"),
    sb.rpc("get_recent_sessions", { lim: 20 }),
    sb.rpc("get_daily_focus", { days: 7, tz }),
  ]);

  const firstError =
    stats.error ?? duos.error ?? recent.error ?? daily.error ?? null;
  if (firstError) throw firstError;

  // get_focus_stats returns a single row; bigints arrive as strings
  const row = (stats.data ?? [])[0];
  const num = (v: unknown) => Number(v ?? 0);

  return {
    personalStats: row
      ? {
          totalFocusTime: num(row.total_focus_time),
          weeklyFocusTime: num(row.weekly_focus_time),
          sessionsCompleted: num(row.sessions_completed),
          currentStreak: num(row.current_streak),
          longestStreak: num(row.longest_streak),
          avgSessionLength: num(row.avg_session_length),
        }
      : null,
    duoStats: (duos.data ?? []).map((d) => ({
      partnerId: d.partner_id,
      partnerName: d.partner_name,
      totalCoFocusTime: num(d.total_co_focus_time),
      sessionsTogether: num(d.sessions_together),
    })),
    recentSessions: recent.data ?? [],
    dailyFocus: (daily.data ?? []).map((d) => ({
      day: d.day,
      focusSeconds: num(d.focus_seconds),
      sessionCount: num(d.session_count),
    })),
  };
}

export function useStats(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(false);
  // A failed load used to be console.error only, leaving the snapshot at EMPTY.
  // Callers then rendered "Total 0m / Streak 0d" — indistinguishable from a
  // brand-new account, so one failed request looked like the user's entire
  // history had been erased. `loaded` exists to tell those two apart: zeros are
  // only the truth once a fetch has actually succeeded.
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchStats = useCallback(
    async (force = false) => {
      if (!userId) return;

      const fresh = cache.get(userId);
      if (!force && fresh && Date.now() - fresh.at < CACHE_TTL_MS) {
        setSnapshot(fresh.data);
        setError(null);
        setLoaded(true);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        let pending = inFlight.get(userId);
        if (!pending || force) {
          pending = loadSnapshot().finally(() => inFlight.delete(userId));
          inFlight.set(userId, pending);
        }
        const data = await pending;
        cache.set(userId, { at: Date.now(), data });
        setSnapshot(data);
        setLoaded(true);
      } catch (err) {
        // PostgrestError extends Error, so this keeps the real message.
        console.error("Failed to fetch stats:", err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Couldn't load your stats.",
        );
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  const retry = useCallback(() => fetchStats(true), [fetchStats]);

  return {
    personalStats: snapshot.personalStats,
    duoStats: snapshot.duoStats,
    recentSessions: snapshot.recentSessions,
    dailyFocus: snapshot.dailyFocus,
    loading,
    /** Non-null when the last attempt failed. Zeros are not trustworthy. */
    error,
    /** True once a fetch has succeeded — only then do zeros mean "no data". */
    loaded,
    retry,
    fetchStats,
  };
}
