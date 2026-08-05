import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export function useFriendsList(myProfileId: string, active: boolean) {
  const [friends, setFriends] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<
    { id: string; requester: Profile }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const sb = getSupabase();

  const fetchFriends = useCallback(async () => {
    const { data } = await sb
      .from("friendships")
      .select(
        `
        id, status, requester_id, addressee_id,
        requester:profiles!friendships_requester_id_fkey(id, username, discriminator, display_name, current_room, current_session_id, current_world_id, is_premium),
        addressee:profiles!friendships_addressee_id_fkey(id, username, discriminator, display_name, current_room, current_session_id, current_world_id, is_premium)
      `,
      )
      .eq("status", "accepted");

    if (data) {
      setFriends(
        data.map((f: any) =>
          f.requester_id === myProfileId ? f.addressee : f.requester,
        ) as Profile[],
      );
    }

    const { data: reqs } = await sb
      .from("friendships")
      .select(
        `
        id,
        requester:profiles!friendships_requester_id_fkey(id, username, discriminator, display_name, current_session_id, current_world_id)
      `,
      )
      .eq("addressee_id", myProfileId)
      .eq("status", "pending");

    if (reqs) {
      setRequests(
        reqs.map((r: any) => ({ id: r.id, requester: r.requester as Profile })),
      );
    }
  }, [sb, myProfileId]);

  useEffect(() => {
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
    const { error: err } = await sb
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);
    if (err) {
      setError("Couldn't accept that request. Try again.");
      return;
    }
    fetchFriends();
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
    fetchFriends();
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
    error,
    clearError: () => setError(null),
  };
}
