"use client";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStats } from "@/lib/useStats";
import StatsErrorState from "./StatsErrorState";
import type { DuoStats, SessionWithPartner } from "@/lib/types";
import WorldThumb from "./WorldThumb";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  onViewFullStats: () => void;
}

type Tab = "personal" | "duo" | "history";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-raise rounded-xl px-3 py-2.5 text-center">
      <p className="text-faint text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      <p className="text-ink text-lg font-bold font-mono tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

// ── Partner Row ─────────────────────────────────────────────────────────────

function PartnerRow({ duo, rank }: { duo: DuoStats; rank: number }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-raise transition-colors">
      <span className={`text-xs font-bold w-5 ${rank === 1 ? "text-gold" : "text-faint"}`}>
        {rank === 1 ? "★" : `#${rank}`}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-ink truncate">
          {duo.partnerName}
        </p>
        <p className="text-xs text-faint">
          {duo.sessionsTogether} sessions
        </p>
      </div>
      <span className="text-accent text-xs font-mono font-bold">
        {formatDuration(duo.totalCoFocusTime)}
      </span>
    </div>
  );
}

// ── Session Row ─────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: SessionWithPartner }) {
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-raise">
      <WorldThumb worldId={session.world} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-ink truncate">
          {formatDuration(session.actual_focus)} focus
          {session.partner_name && (
            <span className="text-muted font-normal">
              {" "}
              with {session.partner_name}
            </span>
          )}
        </p>
        <p className="text-[10px] text-faint font-mono">
          {formatDate(session.ended_at)}
        </p>
      </div>
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          session.completed
            ? "bg-go/15 text-go"
            : "bg-danger/15 text-danger"
        }`}
      >
        {session.completed ? "✓" : "—"}
      </span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

import { useState } from "react";

export default function StatsPanel({
  open,
  onClose,
  userId,
  onViewFullStats,
}: Props) {
  const [tab, setTab] = useState<Tab>("personal");
  const {
    personalStats, duoStats, recentSessions, loading, fetchStats,
    error: statsError, retry,
  } = useStats(userId);

  useEffect(() => {
    if (open) fetchStats();
  }, [open, fetchStats]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-30 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-x-2 sm:inset-x-auto sm:right-4 top-0 bottom-0 z-40 flex items-stretch justify-end py-3 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full sm:w-80 bg-surface border border-line flex flex-col shadow-2xl rounded-2xl overflow-hidden"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-line">
                <h2 className="font-display text-lg text-ink tracking-wide">
                  Stats
                </h2>
                <button
                  onClick={onClose}
                  className="text-faint hover:text-ink transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-line">
                {(["personal", "duo", "history"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-xs font-bold capitalize transition-colors ${
                      tab === t
                        ? "text-accent border-b-2 border-accent"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3">
                {loading && (
                  <p className="text-faint text-sm text-center py-8">
                    Loading...
                  </p>
                )}

                {/* Personal tab */}
                {!loading && statsError && (
                  <StatsErrorState onRetry={retry} className="py-10" />
                )}

                {!loading && !statsError && tab === "personal" && (
                  <div>
                    {personalStats ? (
                      <div className="grid grid-cols-2 gap-2">
                        <StatCard
                          label="Total Focus"
                          value={formatDuration(personalStats.totalFocusTime)}
                        />
                        <StatCard
                          label="This Week"
                          value={formatDuration(personalStats.weeklyFocusTime)}
                        />
                        <StatCard
                          label="Sessions"
                          value={String(personalStats.sessionsCompleted)}
                        />
                        <StatCard
                          label="Avg Length"
                          value={formatDuration(personalStats.avgSessionLength)}
                        />
                        <StatCard
                          label="Streak"
                          value={`${personalStats.currentStreak}d`}
                        />
                        <StatCard
                          label="Best Streak"
                          value={`${personalStats.longestStreak}d`}
                        />
                      </div>
                    ) : (
                      <p className="text-faint text-sm text-center py-8">
                        No sessions yet.
                        <br />
                        Start focusing to see stats!
                      </p>
                    )}
                  </div>
                )}

                {/* Duo tab */}
                {!loading && !statsError && tab === "duo" && (
                  <div>
                    {duoStats.length === 0 ? (
                      <p className="text-faint text-sm text-center py-8">
                        No partner sessions yet.
                        <br />
                        Focus with a friend to see duo stats!
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {duoStats.map((duo, i) => (
                          <PartnerRow
                            key={duo.partnerId}
                            duo={duo}
                            rank={i + 1}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* History tab */}
                {!loading && !statsError && tab === "history" && (
                  <div>
                    {recentSessions.length === 0 ? (
                      <p className="text-faint text-sm text-center py-8">
                        No sessions recorded yet.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {recentSessions.map((s) => (
                          <SessionRow key={s.id} session={s} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-line px-4 py-3">
                <button
                  onClick={onViewFullStats}
                  className="w-full text-center text-xs text-accent hover:text-accent-deep font-bold transition-colors"
                >
                  View detailed stats →
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
