import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export function useFriendSearch(myProfileId: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const sb = getSupabase();

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const { data } = await sb
      .from("profiles")
      .select("id, username, display_name, is_premium, current_room")
      .ilike("username", `%${searchQuery.trim()}%`)
      .neq("id", myProfileId)
      .limit(10);
    setSearchResults((data as Profile[]) ?? []);
    setLoading(false);
  };

  const sendRequest = async (targetId: string) => {
    await sb
      .from("friendships")
      .insert({ requester_id: myProfileId, addressee_id: targetId });
    setSentRequests((prev) => new Set([...prev, targetId]));
  };

  return { searchQuery, setSearchQuery, searchResults, loading, handleSearch, sentRequests, sendRequest };
}
