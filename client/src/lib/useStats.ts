"use client";
import { useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import type { SessionWithPartner, PersonalStats, DuoStats } from "@/lib/types";

export function useStats(userId: string | undefined) {
  const [personalStats, setPersonalStats] = useState<PersonalStats | null>(null);
  const [duoStats, setDuoStats] = useState<DuoStats[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionWithPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const sb = getSupabase();

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Fetch all sessions this user participated in
      const { data: myParticipations } = await sb
        .from("session_participants")
        .select("session_id, sessions(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!myParticipations) {
        setLoading(false);
        return;
      }

      const sessions = myParticipations
        .map((p: any) => p.sessions)
        .filter(Boolean) as any[];

      // 2. Compute personal stats
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const completedSessions = sessions.filter((s: any) => s.completed);
      const totalFocusTime = completedSessions.reduce(
        (sum: number, s: any) => sum + s.actual_focus,
        0
      );
      const weeklyFocusTime = completedSessions
        .filter((s: any) => new Date(s.ended_at) >= weekStart)
        .reduce((sum: number, s: any) => sum + s.actual_focus, 0);

      // Streak: count consecutive days with at least 1 completed session
      const sessionDates = new Set(
        completedSessions.map((s: any) =>
          new Date(s.ended_at).toISOString().split("T")[0]
        )
      );

      let currentStreak = 0;
      let longestStreak = 0;
      let streak = 0;
      const checkDate = new Date();

      // Grace: if no session today, start checking from yesterday
      if (!sessionDates.has(checkDate.toISOString().split("T")[0])) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      for (let i = 0; i < 365; i++) {
        const dateStr = checkDate.toISOString().split("T")[0];
        if (sessionDates.has(dateStr)) {
          streak++;
          longestStreak = Math.max(longestStreak, streak);
        } else {
          if (i === 0) streak = 0;
          else break;
        }
        checkDate.setDate(checkDate.getDate() - 1);
      }
      currentStreak = streak;

      setPersonalStats({
        totalFocusTime,
        weeklyFocusTime,
        sessionsCompleted: completedSessions.length,
        currentStreak,
        longestStreak,
        avgSessionLength:
          completedSessions.length > 0
            ? Math.round(totalFocusTime / completedSessions.length)
            : 0,
      });

      // 3. Duo stats: find co-participants
      const sessionIds = sessions.map((s: any) => s.id);

      const { data: allParticipants } = sessionIds.length > 0
        ? await sb
            .from("session_participants")
            .select("session_id, user_id, profiles:user_id(display_name, username)")
            .in("session_id", sessionIds)
            .neq("user_id", userId)
        : { data: [] };

      const partnerMap = new Map<
        string,
        { name: string; time: number; count: number }
      >();

      if (allParticipants) {
        for (const p of allParticipants as any[]) {
          const session = sessions.find((s: any) => s.id === p.session_id);
          if (!session || !session.completed) continue;
          const partnerName =
            p.profiles?.display_name ?? p.profiles?.username ?? "Unknown";
          const existing = partnerMap.get(p.user_id);
          if (existing) {
            existing.time += session.actual_focus;
            existing.count++;
          } else {
            partnerMap.set(p.user_id, {
              name: partnerName,
              time: session.actual_focus,
              count: 1,
            });
          }
        }
      }

      setDuoStats(
        Array.from(partnerMap.entries())
          .map(([partnerId, data]) => ({
            partnerId,
            partnerName: data.name,
            totalCoFocusTime: data.time,
            sessionsTogether: data.count,
          }))
          .sort((a, b) => b.totalCoFocusTime - a.totalCoFocusTime)
      );

      // 4. Recent sessions (last 20) with partner names
      const recent = sessions.slice(0, 20).map((s: any) => {
        const partnerP = ((allParticipants as any[]) || []).find(
          (p: any) => p.session_id === s.id
        );
        return {
          ...s,
          partner_name:
            partnerP?.profiles?.display_name ??
            partnerP?.profiles?.username ??
            null,
          partner_id: partnerP?.user_id ?? null,
        } as SessionWithPartner;
      });
      setRecentSessions(recent);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
    setLoading(false);
  }, [sb, userId]);

  return { personalStats, duoStats, recentSessions, loading, fetchStats };
}
