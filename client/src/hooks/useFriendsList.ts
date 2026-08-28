import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

// Shape of the embedded-resource rows PostgREST returns for the two queries
// below. There are no generated DB types in this repo, so the client can't
// infer them.
type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  requester: Profile | null;
  addressee: Profile | null;
};
type RequestRow = { id: string; requester: Profile | null };

export function useFriendsList(myProfileId: string, active: boolean) {
  const [friends, setFriends] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<
    { id: string; requester: Profile }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sb = getSupabase();

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [friendsResult, requestsResult] = await Promise.all([
      sb
        .from("friendships")
        .select(
          `
        id, status, requester_id, addressee_id,
        requester:profiles!friendships_requester_id_fkey(id, username, discriminator, display_name, current_room, current_session_id, current_world_id, is_premium),
        addressee:profiles!friendships_addressee_id_fkey(id, username, discriminator, display_name, current_room, current_session_id, current_world_id, is_premium)
      `,
        )
        .eq("status", "accepted"),
      sb
        .from("friendships")
        .select(
          `
        id,
        requester:profiles!friendships_requester_id_fkey(id, username, discriminator, display_name, current_session_id, current_world_id)
      `,
        )
        .eq("addressee_id", myProfileId)
        .eq("status", "pending"),
    ]);

    if (friendsResult.error || requestsResult.error) {
      setLoadError("Couldn't load your friends. Check your connection.");
      setLoading(false);
      return false;
    }

    const rows = (friendsResult.data ?? []) as unknown as FriendshipRow[];
    setFriends(
      rows
        .map((f) =>
          f.requester_id === myProfileId ? f.addressee : f.requester,
        )
        // An unreadable profile embeds as null; dropping those beats
        // pushing a hole into the list for the UI to dereference.
        .filter((p): p is Profile => Boolean(p)),
    );
    setRequests(
      ((requestsResult.data ?? []) as unknown as RequestRow[])
        .filter((r): r is { id: string; requester: Profile } =>
          Boolean(r.requester),
        )
        .map((r) => ({ id: r.id, requester: r.requester })),
    );
    setLoaded(true);
    setLoading(false);
    return true;
  }, [sb, myProfileId]);

  useEffect(() => {
    // The rule can't see through the async boundary: these fetchers await a
    // network round trip before any setState, so nothing here is a synchronous
    // cascading render. Suppressed rather than restructured — the alternative
    // is a data-fetching library, which is a bigger change than this earns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) fetchFriends();
  }, [active, fetchFriends]);

  useEffect(() => {
    const channel = sb
      .channel("friends-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        fetchFriends,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        fetchFriends,
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [sb, fetchFriends]);

  const acceptRequest = async (friendshipId: string) => {
    setError(null);
    const { data, error: err } = await sb
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId)
      .select("id");
    if (err || !data || data.length === 0) {
      setError("Couldn't accept that request. You may not have permission.");
      return;
    }
    await fetchFriends();
  };

  // RLS refusing a DELETE is not an error — it just matches zero rows. So we
  // ask for the deleted rows back and treat an empty result as a failure,
  // rather than optimistically refetching and showing the entry again.
  const deleteFriendship = async (friendshipId: string, label: string) => {
    setError(null);
    const { data, error: err } = await sb
      .from("friendships")
      .delete()
      .eq("id", friendshipId)
      .select("id");
    if (err || !data || data.length === 0) {
      setError(`Couldn't ${label}. You may not have permission.`);
      return;
    }
    await fetchFriends();
  };

  const declineRequest = (friendshipId: string) =>
    deleteFriendship(friendshipId, "decline that request");

  const removeFriend = (friendshipId: string) =>
    deleteFriendship(friendshipId, "remove that friend");

  return {
    friends,
    requests,
    acceptRequest,
    declineRequest,
    removeFriend,
    fetchFriends,
    retry: fetchFriends,
    loading,
    loaded,
    loadError,
    error,
    clearError: () => setError(null),
  };
}
