import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export function useFriendSearch(myProfileId: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = getSupabase();

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query || query.length < 3) return;
    setLoading(true);
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
      // Partial search: ilike on username — escape SQL wildcards
      const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
      result = await sb
        .from("profiles")
        .select("id, username, discriminator, display_name, is_premium, current_room")
        .ilike("username", `%${escaped}%`)
        .neq("id", myProfileId)
        .limit(10);
    }
    // Without this, a failed query is indistinguishable from "no such user"
    if (result.error) setError("Search failed. Check your connection.");
    setSearchResults((result.data as Profile[]) ?? []);
    setLoading(false);
  };

  const sendRequest = async (targetId: string) => {
    setError(null);
    const { error: err } = await sb
      .from("friendships")
      .insert({ requester_id: myProfileId, addressee_id: targetId });
    if (err) {
      // 23505 = friendships_pair_unique. Very common: they already sent *you*
      // a request, so the pair already exists in the other direction.
      setError(
        err.code === "23505"
          ? "You already have a request or friendship with this person — check the Requests tab."
          : "Couldn't send that request. Try again.",
      );
      return;
    }
    setSentRequests((prev) => new Set([...prev, targetId]));
  };

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    loading,
    handleSearch,
    sentRequests,
    sendRequest,
    error,
    clearError: () => setError(null),
  };
}
