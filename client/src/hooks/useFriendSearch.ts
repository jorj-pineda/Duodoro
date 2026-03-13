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
    const query = searchQuery.trim();
    const hashIdx = query.indexOf("#");

    let result;
    if (hashIdx !== -1 && query.length > hashIdx + 1) {
      // Full tag search: name#XXXX → exact match
      const name = query.slice(0, hashIdx).toLowerCase();
      const disc = query.slice(hashIdx + 1);
      result = await sb
        .from("profiles")
        .select("id, username, discriminator, display_name, is_premium, current_room")
        .eq("username", name)
        .eq("discriminator", disc)
        .neq("id", myProfileId)
        .limit(10);
    } else {
      // Partial search: ilike on username
      result = await sb
        .from("profiles")
        .select("id, username, discriminator, display_name, is_premium, current_room")
        .ilike("username", `%${query}%`)
        .neq("id", myProfileId)
        .limit(10);
    }
    setSearchResults((result.data as Profile[]) ?? []);
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
