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
}: Props) {
  return (
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
  );
}
