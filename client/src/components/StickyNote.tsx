"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase";
import type { Task } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  roomCode: string | null; // null when not in a session
}

type Tab = "mine" | "shared";

// ── Single task row ────────────────────────────────────────────────────────
function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="flex items-start gap-2 group py-1.5"
    >
      <button
        onClick={() => onToggle(task.id, !task.is_done)}
        className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          task.is_done
            ? "bg-emerald-500 border-emerald-500"
            : "border-gray-500 hover:border-emerald-400"
        }`}
      >
        {task.is_done && <span className="text-white text-xs">✓</span>}
      </button>
      <p
        className={`flex-1 text-sm leading-snug transition-colors ${
          task.is_done ? "line-through text-gray-600" : "text-gray-200"
        }`}
      >
        {task.content}
      </p>
      <button
        onClick={() => onDelete(task.id)}
        className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs mt-0.5 flex-shrink-0"
      >
        ✕
      </button>
    </motion.div>
  );
}

// ── Add task input ─────────────────────────────────────────────────────────
function AddTaskInput({ onAdd }: { onAdd: (text: string) => void }) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onAdd(text);
    setValue("");
  };

  return (
    <div className="flex gap-2 mt-3 pt-3 border-t border-yellow-900/40">
      <input
        className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none font-mono"
        placeholder="Add a task..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        maxLength={120}
      />
      <button
        onClick={submit}
        disabled={!value.trim()}
        className="text-yellow-500 hover:text-yellow-300 disabled:opacity-30 font-bold text-lg transition-colors"
      >
        +
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function StickyNote({ open, onClose, userId, roomCode }: Props) {
  const [tab, setTab] = useState<Tab>("mine");
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [sharedTasks, setSharedTasks] = useState<Task[]>([]);
  const sb = getSupabase();

  // ── Fetch personal tasks ──────────────────────────────────────────────
  const fetchMine = useCallback(async () => {
    const { data } = await sb
      .from("tasks")
      .select("*")
      .eq("owner_id", userId)
      .is("room_code", null)
      .order("created_at", { ascending: true });
    if (data) setMyTasks(data as Task[]);
  }, [sb, userId]);

  // ── Fetch shared tasks ────────────────────────────────────────────────
  const fetchShared = useCallback(async () => {
    if (!roomCode) return;
    const { data } = await sb
      .from("tasks")
      .select("*")
      .eq("room_code", roomCode)
      .eq("is_shared", true)
      .order("created_at", { ascending: true });
    if (data) setSharedTasks(data as Task[]);
  }, [sb, roomCode]);

  useEffect(() => {
    if (open) {
      fetchMine();
      fetchShared();
    }
  }, [open, fetchMine, fetchShared]);

  // ── Real-time: shared tasks ───────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;
    const channel = sb
      .channel(`tasks-shared-${roomCode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `room_code=eq.${roomCode}` },
        fetchShared
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sb, roomCode, fetchShared]);

  // ── CRUD ─────────────────────────────────────────────────────────────
  const addTask = async (content: string, shared = false) => {
    const row = {
      owner_id: userId,
      content,
      is_shared: shared,
      room_code: shared ? roomCode : null,
    };
    const { data } = await sb.from("tasks").insert(row).select().single();
    if (data) {
      if (shared) setSharedTasks((p) => [...p, data as Task]);
      else setMyTasks((p) => [...p, data as Task]);
    }
  };

  const toggleTask = async (id: string, done: boolean) => {
    await sb.from("tasks").update({ is_done: done }).eq("id", id);
    const update = (list: Task[]) =>
      list.map((t) => (t.id === id ? { ...t, is_done: done } : t));
    setMyTasks(update);
    setSharedTasks(update);
  };

  const deleteTask = async (id: string) => {
    await sb.from("tasks").delete().eq("id", id);
    setMyTasks((p) => p.filter((t) => t.id !== id));
    setSharedTasks((p) => p.filter((t) => t.id !== id));
  };

  const activeTasks = tab === "mine" ? myTasks : sharedTasks;
  const completedCount = activeTasks.filter((t) => t.is_done).length;

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
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-40 w-80 flex flex-col shadow-2xl"
            style={{
              background: "linear-gradient(180deg, #fef9c3 0%, #fef08a 100%)",
            }}
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            {/* Notebook top tape */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-4 bg-yellow-300/80 rounded-sm border border-yellow-400/60 z-10" />

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b-2 border-yellow-300/60">
              <h2 className="font-black text-yellow-900 font-mono tracking-widest text-sm">
                SESSION NOTES
              </h2>
              <button onClick={onClose} className="text-yellow-700 hover:text-yellow-900 transition-colors text-lg">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b-2 border-yellow-300/60">
              <button
                onClick={() => setTab("mine")}
                className={`flex-1 py-2 text-xs font-mono font-bold transition-colors ${
                  tab === "mine"
                    ? "text-yellow-900 border-b-2 border-yellow-700"
                    : "text-yellow-600 hover:text-yellow-800"
                }`}
              >
                My Tasks
              </button>
              <button
                onClick={() => setTab("shared")}
                className={`flex-1 py-2 text-xs font-mono font-bold transition-colors ${
                  tab === "shared"
                    ? "text-yellow-900 border-b-2 border-yellow-700"
                    : "text-yellow-600 hover:text-yellow-800"
                }`}
              >
                Our Goals
                {!roomCode && (
                  <span className="ml-1 text-[10px] text-yellow-500">(join session)</span>
                )}
              </button>
            </div>

            {/* Progress bar */}
            {activeTasks.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <div className="flex justify-between text-[10px] font-mono text-yellow-700 mb-1">
                  <span>{completedCount}/{activeTasks.length} done</span>
                  <span>{Math.round((completedCount / activeTasks.length) * 100)}%</span>
                </div>
                <div className="w-full h-1.5 bg-yellow-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-emerald-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(completedCount / activeTasks.length) * 100}%` }}
                    transition={{ ease: "easeOut", duration: 0.4 }}
                  />
                </div>
              </div>
            )}

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {tab === "shared" && !roomCode ? (
                <p className="text-yellow-700 text-sm font-mono text-center py-8 leading-relaxed">
                  Start a session with<br />your partner first to<br />share goals!
                </p>
              ) : activeTasks.length === 0 ? (
                <p className="text-yellow-600 text-sm font-mono text-center py-8">
                  {tab === "mine" ? "No tasks yet. Add one below!" : "No shared goals yet!"}
                </p>
              ) : (
                <AnimatePresence mode="popLayout">
                  {activeTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Add task */}
            <div className="px-4 pb-4">
              {(tab === "mine" || (tab === "shared" && roomCode)) && (
                <AddTaskInput onAdd={(text) => addTask(text, tab === "shared")} />
              )}
            </div>

            {/* Notebook lines decoration */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 h-px bg-yellow-600"
                  style={{ top: `${90 + i * 28}px` }}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
