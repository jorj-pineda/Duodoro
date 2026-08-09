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
  // Writes can legitimately be refused now that migration 016 scopes shared
  // notes to the session you're in; these used to update local state blindly.
  const [error, setError] = useState<string | null>(null);
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
    // The rule can't see through the async boundary: these fetchers await a
    // network round trip before any setState, so nothing here is a synchronous
    // cascading render. Suppressed rather than restructured — the alternative
    // is a data-fetching library, which is a bigger change than this earns.
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const { data, error: err } = await sb
      .from("tasks")
      .insert(row)
      .select()
      .single();
    if (err || !data) {
      // Shared writes are scoped to the session you're actually in (016), so
      // this can fail for a real reason rather than a transient one.
      setError(
        shared
          ? "Couldn't add that shared goal. Are you still in the session?"
          : "Couldn't save that note.",
      );
      return;
    }
    if (shared) setSharedTasks((p) => [...p, data as Task]);
    else setMyTasks((p) => [...p, data as Task]);
  };

  const toggleTask = async (id: string, done: boolean) => {
    setError(null);
    // RLS refusing this is not an error — it matches zero rows. Ticking off a
    // note you don't own silently reverted on the next fetch.
    const { data, error: err } = await sb
      .from("tasks")
      .update({ is_done: done })
      .eq("id", id)
      .select("id");
    if (err || !data || data.length === 0) {
      setError("Couldn't update that note.");
      return;
    }
    const update = (list: Task[]) =>
      list.map((t) => (t.id === id ? { ...t, is_done: done } : t));
    setMyTasks(update);
    setSharedTasks(update);
  };

  const deleteTask = async (id: string) => {
    setError(null);
    const { data, error: err } = await sb
      .from("tasks")
      .delete()
      .eq("id", id)
      .select("id");
    if (err || !data || data.length === 0) {
      setError("Couldn't delete that note.");
      return;
    }
    setMyTasks((p) => p.filter((t) => t.id !== id));
    setSharedTasks((p) => p.filter((t) => t.id !== id));
  };

  const clearCompleted = async () => {
    const list = tab === "mine" ? myTasks : sharedTasks;
    const ids = list.filter((t) => t.is_done).map((t) => t.id);
    if (ids.length > 0) {
      setError(null);
      // One round trip, not one per note
      const { error: err } = await sb.from("tasks").delete().in("id", ids);
      if (err) {
        setError("Couldn't clear those notes.");
        return;
      }
      const drop = (l: Task[]) => l.filter((t) => !ids.includes(t.id));
      setMyTasks(drop);
      setSharedTasks(drop);
    }
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
    error,
    clearError: () => setError(null),
  };
}
