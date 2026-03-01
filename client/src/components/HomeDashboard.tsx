"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase";
import { useStats } from "@/lib/useStats";
import { WORLDS, type WorldId } from "@/lib/avatarData";
import type { Profile, Task } from "@/lib/types";

interface Props {
  profile: Profile;
  activeSessionId?: string;
  onFocus: (world: WorldId) => void;
  onRejoinSession: () => void;
  onJoinSession: (sessionId: string) => void;
  onEditAvatar: () => void;
  onSignOut: () => void;
  onOpenFriends: () => void;
  onOpenStats: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function QuickStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-gray-800/60 rounded-xl px-3 py-3 text-center flex-1">
      <p className="text-gray-500 text-[10px] font-mono font-bold uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-xl font-bold font-mono mt-0.5 ${
          accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function HomeDashboard({
  profile,
  activeSessionId,
  onFocus,
  onRejoinSession,
  onJoinSession,
  onEditAvatar,
  onSignOut,
  onOpenFriends,
  onOpenStats,
}: Props) {
  const [selectedWorld, setSelectedWorld] = useState<WorldId>("forest");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const sb = getSupabase();
  const { personalStats, loading, fetchStats } = useStats(profile.id);

  const displayName = profile.display_name ?? profile.username ?? "You";
  const initial = displayName.charAt(0).toUpperCase();
  const isPremium = profile.is_premium ?? false;

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const fetchTasks = useCallback(async () => {
    const { data } = await sb
      .from("tasks")
      .select("*")
      .eq("owner_id", profile.id)
      .is("room_code", null)
      .order("created_at", { ascending: true });
    if (data) setTasks(data as Task[]);
  }, [sb, profile.id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const addTask = async () => {
    const text = newTask.trim();
    if (!text) return;
    const { data } = await sb
      .from("tasks")
      .insert({ owner_id: profile.id, content: text })
      .select()
      .single();
    if (data) setTasks((p) => [...p, data as Task]);
    setNewTask("");
  };

  const toggleTask = async (id: string, done: boolean) => {
    await sb.from("tasks").update({ is_done: done }).eq("id", id);
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, is_done: done } : t)));
  };

  const deleteTask = async (id: string) => {
    await sb.from("tasks").delete().eq("id", id);
    setTasks((p) => p.filter((t) => t.id !== id));
  };

  const pendingTasks = tasks.filter((t) => !t.is_done);
  const completedTasks = tasks.filter((t) => t.is_done);

  const clearCompleted = async () => {
    const done = completedTasks;
    for (const t of done) {
      await sb.from("tasks").delete().eq("id", t.id);
    }
    setTasks((p) => p.filter((t) => !t.is_done));
  };

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div
      className="min-h-screen bg-gray-900 flex flex-col"
      onClick={() => setProfileMenuOpen(false)}
    >
      {/* Top bar — same grid as game screen, Duodoro always dead center */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 bg-gray-800/80 border-b border-gray-700">
        {/* Left: Friends — right-aligned toward Duodoro */}
        <div className="flex items-center justify-end pr-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenFriends();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
          >
            {"👥"} <span className="hidden sm:inline">Friends</span>
          </button>
        </div>

        {/* Center: Duodoro + status dot — always dead center */}
        <div className="flex flex-col items-center px-3 py-0.5">
          <span className="text-white font-black font-mono tracking-widest text-sm">
            Duodoro
          </span>
          <div
            className={`w-2 h-2 rounded-full ${activeSessionId ? "bg-yellow-400" : "bg-red-400"}`}
            style={{ boxShadow: activeSessionId ? "0 0 6px #facc15" : "0 0 6px #f87171" }}
          />
        </div>

        {/* Right: Stats, Account — left-aligned from Duodoro, Account pushed far right */}
        <div className="flex items-center gap-1.5 pl-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenStats();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
          >
            {"📊"} <span className="hidden sm:inline">Stats</span>
          </button>
          <div className="flex-1" />
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProfileMenuOpen((o) => !o);
              }}
              className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-sm font-bold hover:bg-emerald-500/30 transition-colors"
            >
              {initial}
            </button>
            {profileMenuOpen && (
              <div
                className="absolute top-10 right-0 z-50 bg-gray-800 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-44"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-white font-bold text-sm mb-0.5">
                  {displayName}
                </p>
                <p className="text-gray-500 text-xs font-mono mb-3">
                  @{profile.username}
                </p>
                <button
                  onClick={() => {
                    onEditAvatar();
                    setProfileMenuOpen(false);
                  }}
                  className="w-full text-left text-xs font-mono text-gray-400 hover:text-white py-1.5 transition-colors"
                >
                  {"✏️"} Edit character
                </button>
                {!isPremium && (
                  <button
                    onClick={() => setProfileMenuOpen(false)}
                    className="w-full text-left text-xs font-mono text-yellow-400 hover:text-yellow-300 py-1.5 transition-colors"
                  >
                    {"⭐"} Upgrade to Premium
                  </button>
                )}
                <button
                  onClick={() => {
                    onSignOut();
                    setProfileMenuOpen(false);
                  }}
                  className="w-full text-left text-xs font-mono text-gray-400 hover:text-red-400 py-1.5 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Greeting */}
          <div>
            <h1 className="text-2xl font-bold text-white font-mono">
              {greeting}, {displayName}
            </h1>
            <p className="text-gray-500 text-sm font-mono mt-0.5">
              Ready to focus?
            </p>
          </div>

          {/* Quick Stats */}
          {!loading && personalStats && (
            <div className="flex gap-2">
              <QuickStat
                label="Total"
                value={formatDuration(personalStats.totalFocusTime)}
                accent
              />
              <QuickStat
                label="This Week"
                value={formatDuration(personalStats.weeklyFocusTime)}
              />
              <QuickStat
                label="Streak"
                value={`${personalStats.currentStreak}d`}
                accent
              />
            </div>
          )}

          {!loading && !personalStats && (
            <div className="flex gap-2">
              <QuickStat label="Total" value="0m" />
              <QuickStat label="This Week" value="0m" />
              <QuickStat label="Streak" value="0d" />
            </div>
          )}

          {/* Goals / Tasks */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-wider">
                Goals
              </h2>
              {tasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-600">
                    {completedTasks.length}/{tasks.length} done
                  </span>
                  {completedTasks.length > 0 && (
                    <button
                      onClick={clearCompleted}
                      className="text-[10px] font-mono text-gray-600 hover:text-red-400 transition-colors"
                    >
                      Clean
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Task list */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {pendingTasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="flex items-center gap-2.5 group"
                  >
                    <button
                      onClick={() => toggleTask(task.id, true)}
                      className="flex-shrink-0 w-4.5 h-4.5 w-[18px] h-[18px] rounded border-2 border-gray-600 hover:border-emerald-500 flex items-center justify-center transition-colors"
                    />
                    <p className="flex-1 text-sm text-gray-300 font-mono truncate">
                      {task.content}
                    </p>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-gray-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {"✕"}
                    </button>
                  </motion.div>
                ))}
                {completedTasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2.5 group"
                  >
                    <button
                      onClick={() => toggleTask(task.id, false)}
                      className="flex-shrink-0 w-[18px] h-[18px] rounded border-2 border-emerald-600 bg-emerald-600 flex items-center justify-center"
                    >
                      <span className="text-white text-[10px]">{"✓"}</span>
                    </button>
                    <p className="flex-1 text-sm text-gray-600 font-mono truncate line-through">
                      {task.content}
                    </p>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-gray-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {"✕"}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {tasks.length === 0 && (
              <p className="text-gray-600 text-xs font-mono text-center py-3">
                Add goals for your focus session
              </p>
            )}

            {/* Add task input */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
              <input
                className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none font-mono"
                placeholder="Add a goal..."
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                maxLength={120}
              />
              <button
                onClick={addTask}
                disabled={!newTask.trim()}
                className="text-emerald-400 font-bold text-lg disabled:opacity-30 transition-opacity"
              >
                +
              </button>
            </div>
          </div>

          {/* World Picker */}
          <div>
            <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-wider mb-3">
              Choose World
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {WORLDS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWorld(w.id)}
                  className={`py-2.5 px-1 rounded-xl border text-xs font-mono transition-all text-center ${
                    selectedWorld === w.id
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                      : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  <span className="text-base block">{w.emoji}</span>
                  <span className="mt-0.5 block text-[10px]">{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Focus Button — directly below world picker */}
          <div className="space-y-2 pt-2">
            {activeSessionId && (
              <button
                onClick={onRejoinSession}
                className="w-full bg-yellow-500 hover:bg-yellow-400 active:scale-[0.98] text-gray-900 font-black px-8 py-4 rounded-2xl shadow-lg shadow-yellow-500/20 font-mono tracking-widest transition-all border-b-4 border-yellow-700 text-lg"
              >
                RETURN TO SESSION
              </button>
            )}
            <button
              onClick={() => onFocus(selectedWorld)}
              className={`w-full active:scale-[0.98] text-white font-black px-8 rounded-2xl shadow-lg font-mono tracking-widest transition-all border-b-4 ${
                activeSessionId
                  ? "bg-gray-700 hover:bg-gray-600 shadow-gray-700/20 border-gray-800 py-3 text-sm"
                  : "bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20 border-emerald-700 py-4 text-lg"
              }`}
            >
              {activeSessionId ? "NEW SESSION" : "FOCUS"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
