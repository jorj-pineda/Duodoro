"use client";
import { useState, useCallback, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import type { Socket } from "socket.io-client";

// PostgREST embedded-resource shape; no generated DB types in this repo.
type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
  requester: Profile | null;
  addressee: Profile | null;
};

export function useOnlineFriends(
  userId: string,
  socketRef: { current: Socket | null },
) {
  const [friends, setFriends] = useState<Profile[]>([]);
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(
    new Set(),
  );
  const sb = getSupabase();

  const fetchFriends = useCallback(async () => {
    const { data } = await sb
      .from("friendships")
      .select(
        `
        id, requester_id, addressee_id,
        requester:profiles!friendships_requester_id_fkey(id, username, display_name, current_session_id, current_world_id),
        addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, current_session_id, current_world_id)
      `,
      )
      .eq("status", "accepted");
    if (data) {
      setFriends(
        (data as unknown as FriendshipRow[])
          .map((f) => (f.requester_id === userId ? f.addressee : f.requester))
          .filter((p): p is Profile => Boolean(p)),
      );
    }
  }, [sb, userId]);

  useEffect(() => {
    // The rule can't see through the async boundary: these fetchers await a
    // network round trip before any setState, so nothing here is a synchronous
    // cascading render. Suppressed rather than restructured — the alternative
    // is a data-fetching library, which is a bigger change than this earns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFriends();
  }, [fetchFriends]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || friends.length === 0) return;

    const friendIds = friends.map((f) => f.id);
    socket.emit("get_online_friends", { friendIds }, (online: string[]) => {
      setOnlineFriendIds(new Set(online));
    });

    const handlePresence = ({
      userId,
      online,
    }: {
      userId: string;
      online: boolean;
    }) => {
      setOnlineFriendIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    socket.on("presence_update", handlePresence);
    return () => {
      socket.off("presence_update", handlePresence);
    };
  }, [socketRef, friends]);

  return { friends, onlineFriendIds };
}
