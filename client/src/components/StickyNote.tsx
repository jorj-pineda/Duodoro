"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase";
import type { Task } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  roomCode: string | null;
}

type Tab = "mine" | "shared";

const NOTE_COLORS = [
  { label: "Yellow", gradient: "linear-gradient(180deg, #fef9c3 0%, #fef08a 100%)", accent: "#78350f" },
  { label: "Pink",   gradient: "linear-gradient(180deg, #fce7f3 0%, #fbcfe8 100%)", accent: "#831843" },
  { label: "Blue",   gradient: "linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%)", accent: "#1e3a5f" },
  { label: "Green",  gradient: "linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%)", accent: "#064e3b" },
];

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
            ? "bg-emerald-600 border-emerald-600"
            : "border-amber-600 hover:border-emerald-600"
        }`}
      >
        {task.is_done && <span className="text-white text-xs">✓</span>}
      </button>
      <p
        className={`flex-1 text-sm leading-snug font-mono transition-colors ${
          task.is_done ? "line-through text-amber-500" : "text-amber-900"
        }`}
      >
        {task.content}
      </p>
      <button
        onClick={() => onDelete(task.id)}
        className="text-amber-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 text-xs mt-0.5 flex-shrink-0"
      >
        ✕
      </button>
    </motion.div>
  );
}

function AddTaskInput({
  onAdd,
  accent,
}: {
  onAdd: (text: string) => void;
  accent: string;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onAdd(text);
    setValue("");
  };
  return (
    <div className="flex gap-2 mt-3 pt-3 border-t border-black/10">
      <input
        className="flex-1 bg-transparent text-sm placeholder-amber-500/60 focus:outline-none font-mono"
        style={{ color: accent }}
        placeholder="Add a task..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        maxLength={120}
      />
      <button
        onClick={submit}
        disabled={!value.trim()}
        className="font-bold text-xl transition-opacity disabled:opacity-30"
        style={{ color: accent }}
      >
        +
      </button>
    </div>
  );
}

export default function StickyNote({ open, onClose, userId, roomCode }: Props) {
  const [tab, setTab] = useState<Tab>("mine");
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [sharedTasks, setSharedTasks] = useState<Task[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [colorIdx, setColorIdx] = useState(0);
  const optionsRef = useRef<HTMLDivElement>(null);
  const sb = getSupabase();
  const color = NOTE_COLORS[colorIdx];

  const fetchMine = useCallback(async () => {
    const { data } = await sb
      .from("tasks")
      .select("*")
      .eq("owner_id", userId)
      .is("room_code", null)
      .order("created_at", { ascending: true });
    if (data) setMyTasks(data as Task[]);
  }, [sb, userId]);

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
    if (open) { fetchMine(); fetchShared(); }
  }, [open, fetchMine, fetchShared]);

  useEffect(() => {
    if (!roomCode) return;
    const channel = sb
      .channel(`tasks-shared-${roomCode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `room_code=eq.${roomCode}` }, fetchShared)
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [sb, roomCode, fetchShared]);

  // Close options when clicking outside
  useEffect(() => {
    if (!showOptions) return;
    const handler = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOptions]);

  const addTask = async (content: string, shared = false) => {
    const row = { owner_id: userId, content, is_shared: shared, room_code: shared ? roomCode : null };
    const { data } = await sb.from("tasks").insert(row).select().single();
    if (data) {
      if (shared) setSharedTasks((p) => [...p, data as Task]);
      else setMyTasks((p) => [...p, data as Task]);
    }
  };

  const toggleTask = async (id: string, done: boolean) => {
    await sb.from("tasks").update({ is_done: done }).eq("id", id);
    const update = (list: Task[]) => list.map((t) => (t.id === id ? { ...t, is_done: done } : t));
    setMyTasks(update);
    setSharedTasks(update);
  };

  const deleteTask = async (id: string) => {
    await sb.from("tasks").delete().eq("id", id);
    setMyTasks((p) => p.filter((t) => t.id !== id));
    setSharedTasks((p) => p.filter((t) => t.id !== id));
  };

  const clearCompleted = async () => {
    const list = tab === "mine" ? myTasks : sharedTasks;
    const done = list.filter((t) => t.is_done);
    for (const t of done) await deleteTask(t.id);
    setShowOptions(false);
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
          {/* Vertically-centered panel on the right */}
          <div className="fixed right-4 top-0 bottom-0 z-40 flex items-center pointer-events-none">
            <motion.div
              className="pointer-events-auto w-80 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
              style={{ background: color.gradient, maxHeight: "min(600px, 85vh)" }}
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              {/* Tape decoration */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-4 bg-white/50 rounded-sm z-10" />

              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b-2 border-black/10">
                <h2 className="font-black font-mono tracking-widest text-sm" style={{ color: color.accent }}>
                  SESSION NOTES
                </h2>
                <div className="flex items-center gap-0.5">
                  {/* Options (⋮) */}
                  <div className="relative" ref={optionsRef}>
                    <button
                      onClick={() => setShowOptions((o) => !o)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-lg font-bold transition-opacity hover:opacity-60"
                      style={{ color: color.accent }}
                      title="Options"
                    >
                      ⋮
                    </button>
                    {showOptions && (
                      <div
                        className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 min-w-44"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-xs font-bold text-gray-400 font-mono mb-2 uppercase tracking-wider">Note Color</p>
                        <div className="flex gap-2 mb-3">
                          {NOTE_COLORS.map((c, i) => (
                            <button
                              key={i}
                              onClick={() => { setColorIdx(i); setShowOptions(false); }}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${
                                colorIdx === i ? "border-gray-700 scale-110" : "border-transparent hover:border-gray-400"
                              }`}
                              style={{ background: c.gradient }}
                              title={c.label}
                            />
                          ))}
                        </div>
                        <button
                          onClick={clearCompleted}
                          disabled={completedCount === 0}
                          className="w-full text-left text-xs font-mono text-gray-600 hover:text-red-500 py-1 disabled:opacity-30 transition-colors"
                        >
                          ✕ Clear completed ({completedCount})
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Close */}
                  <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-opacity hover:opacity-60"
                    style={{ color: color.accent }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b-2 border-black/10">
                {(["mine", "shared"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2 text-xs font-mono font-bold transition-all ${
                      tab === t ? "border-b-2" : "opacity-50 hover:opacity-70"
                    }`}
                    style={{
                      color: color.accent,
                      borderColor: tab === t ? color.accent : "transparent",
                    }}
                  >
                    {t === "mine" ? "My Tasks" : (
                      <>Our Goals{!roomCode && <span className="ml-1 text-[10px] opacity-60">(join first)</span>}</>
                    )}
                  </button>
                ))}
              </div>

              {/* Progress bar */}
              {activeTasks.length > 0 && (
                <div className="px-4 pt-3 pb-1">
                  <div className="flex justify-between text-[10px] font-mono mb-1" style={{ color: color.accent, opacity: 0.6 }}>
                    <div className="flex items-center gap-2">
                      <span>{completedCount}/{activeTasks.length} done</span>
                      {completedCount > 0 && (
                        <button
                          onClick={clearCompleted}
                          className="hover:opacity-100 opacity-60 transition-opacity"
                          style={{ color: color.accent }}
                        >
                          Clear done
                        </button>
                      )}
                    </div>
                    <span>{Math.round((completedCount / activeTasks.length) * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden bg-black/10">
                    <motion.div
                      className="h-full rounded-full bg-emerald-600"
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
                  <p className="text-sm font-mono text-center py-8 leading-relaxed" style={{ color: color.accent, opacity: 0.6 }}>
                    Start a session with<br />your partner first to<br />share goals!
                  </p>
                ) : activeTasks.length === 0 ? (
                  <p className="text-sm font-mono text-center py-8" style={{ color: color.accent, opacity: 0.6 }}>
                    {tab === "mine" ? "No tasks yet. Add one below!" : "No shared goals yet!"}
                  </p>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {activeTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Add task */}
              <div className="px-4 pb-4">
                {(tab === "mine" || (tab === "shared" && roomCode)) && (
                  <AddTaskInput onAdd={(text) => addTask(text, tab === "shared")} accent={color.accent} />
                )}
              </div>

              {/* Notebook lines decoration */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-10">
                {Array.from({ length: 20 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 h-px"
                    style={{ top: `${90 + i * 28}px`, backgroundColor: color.accent }}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
