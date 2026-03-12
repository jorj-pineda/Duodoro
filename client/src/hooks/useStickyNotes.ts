"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Task } from "@/lib/types";

type Tab = "mine" | "shared";

export function useStickyNotes(
  open: boolean,
  userId: string,
  roomCode: string | null,
) {
  const [tab, setTab] = useState<Tab>("mine");
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [sharedTasks, setSharedTasks] = useState<Task[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [colorIdx, setColorIdx] = useState(0);
  const optionsRef = useRef<HTMLDivElement>(null);
  const sb = getSupabase();

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
    if (open) {
      fetchMine();
      fetchShared();
    }
  }, [open, fetchMine, fetchShared]);

  useEffect(() => {
    if (!roomCode) return;
    const channel = sb
      .channel(`tasks-shared-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `room_code=eq.${roomCode}`,
        },
        fetchShared,
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [sb, roomCode, fetchShared]);

  useEffect(() => {
    if (!showOptions) return;
    const handler = (e: MouseEvent) => {
      if (
        optionsRef.current &&
        !optionsRef.current.contains(e.target as Node)
      ) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOptions]);

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

  const clearCompleted = async () => {
    const list = tab === "mine" ? myTasks : sharedTasks;
    const done = list.filter((t) => t.is_done);
    for (const t of done) await deleteTask(t.id);
    setShowOptions(false);
  };

  const activeTasks = tab === "mine" ? myTasks : sharedTasks;
  const completedCount = activeTasks.filter((t) => t.is_done).length;

  return {
    tab,
    setTab,
    showOptions,
    setShowOptions,
    colorIdx,
    setColorIdx,
    optionsRef,
    activeTasks,
    completedCount,
    addTask,
    toggleTask,
    deleteTask,
    clearCompleted,
  };
}
