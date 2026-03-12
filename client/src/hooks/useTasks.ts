"use client";
import { useState, useCallback, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Task } from "@/lib/types";

export function useTasks(ownerId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const sb = getSupabase();

  const fetchTasks = useCallback(async () => {
    const { data } = await sb
      .from("tasks")
      .select("*")
      .eq("owner_id", ownerId)
      .is("room_code", null)
      .order("created_at", { ascending: true });
    if (data) setTasks(data as Task[]);
  }, [sb, ownerId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const addTask = async () => {
    const text = newTask.trim();
    if (!text) return;
    const { data } = await sb
      .from("tasks")
      .insert({ owner_id: ownerId, content: text })
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

  return {
    tasks,
    newTask,
    setNewTask,
    addTask,
    toggleTask,
    deleteTask,
    pendingTasks,
    completedTasks,
    clearCompleted,
  };
}
