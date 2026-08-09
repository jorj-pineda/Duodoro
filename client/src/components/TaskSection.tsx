"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@/lib/types";

interface Props {
  tasks: Task[];
  pendingTasks: Task[];
  completedTasks: Task[];
  newTask: string;
  setNewTask: (v: string) => void;
  addTask: () => void;
  toggleTask: (id: string, done: boolean) => void;
  deleteTask: (id: string) => void;
  clearCompleted: () => void;
  error?: string | null;
  onDismissError?: () => void;
}

export default function TaskSection({
  tasks,
  pendingTasks,
  completedTasks,
  newTask,
  setNewTask,
  addTask,
  toggleTask,
  deleteTask,
  clearCompleted,
  error,
  onDismissError,
}: Props) {
  return (
    <div className="bg-surface rounded-2xl border border-line p-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs"
        >
          <span className="flex-1">{error}</span>
          {onDismissError && (
            <button
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="font-bold hover:opacity-70"
            >
              ✕
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-faint uppercase tracking-wider">
          Goals
        </h2>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-faint">
              {completedTasks.length}/{tasks.length} done
            </span>
            {completedTasks.length > 0 && (
              <button
                onClick={clearCompleted}
                className="text-[10px] text-faint hover:text-danger transition-colors"
              >
                Clean
              </button>
            )}
          </div>
        )}
      </div>

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
                className="flex-shrink-0 w-[18px] h-[18px] rounded border-2 border-line hover:border-go flex items-center justify-center transition-colors"
              />
              <p className="flex-1 text-sm text-ink truncate">
                {task.content}
              </p>
              <button
                onClick={() => deleteTask(task.id)}
                className="text-faint hover:text-danger text-xs opacity-0 group-hover:opacity-100 transition-all"
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
                className="flex-shrink-0 w-[18px] h-[18px] rounded border-2 border-go bg-go flex items-center justify-center"
              >
                <span className="text-white text-[10px]">{"✓"}</span>
              </button>
              <p className="flex-1 text-sm text-faint truncate line-through">
                {task.content}
              </p>
              <button
                onClick={() => deleteTask(task.id)}
                className="text-faint hover:text-danger text-xs opacity-0 group-hover:opacity-100 transition-all"
              >
                {"✕"}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {tasks.length === 0 && (
        <p className="text-faint text-xs text-center py-3">
          Add goals for your focus session
        </p>
      )}

      <div className="flex gap-2 mt-3 pt-3 border-t border-line">
        <input
          className="flex-1 bg-transparent text-sm text-ink placeholder-faint focus:outline-none"
          placeholder="Add a goal..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          maxLength={120}
        />
        <button
          onClick={addTask}
          disabled={!newTask.trim()}
          className="text-accent font-bold text-lg disabled:opacity-30 transition-opacity"
        >
          +
        </button>
      </div>
    </div>
  );
}
