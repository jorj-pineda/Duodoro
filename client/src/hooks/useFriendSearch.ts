import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { ProfileSearchResult } from "@/lib/types";

export function useFriendSearch(myProfileId: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = getSupabase();

  // Goes through the search_profiles RPC rather than selecting from profiles
  // directly: the table's read policy is scoped to people you actually know,
  // and the RPC returns public identity fields only — never presence. It also
  // owns the tag-vs-partial split, wildcard escaping and the caller exclusion.
  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query || query.length < 3) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await sb.rpc("search_profiles", { query });

    // Without this, a failed query is indistinguishable from "no such user"
    if (err) setError("Search failed. Check your connection.");
    setSearchResults(data ?? []);
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
