// Accepted-friend ids for one user. Prefer the service-role RPC; fall back to
// bound table filters when PostgREST cannot call or parse the function.

function normalizeFriendIds(data) {
  const raw = Array.isArray(data)
    ? data
    : typeof data === "string"
      ? data.replace(/^{|}$/g, "").split(",").map((part) => part.trim())
      : [];
  return raw.flatMap((item) => {
    if (typeof item === "string" && item.length > 0) return [item];
    if (item && typeof item === "object" && typeof item.friend_id === "string") {
      return item.friend_id.length > 0 ? [item.friend_id] : [];
    }
    return [];
  });
}

async function fetchFriendIdsFromTable(supabase, userId) {
  const [asRequester, asAddressee] = await Promise.all([
    supabase
      .from("friendships")
      .select("addressee_id")
      .eq("status", "accepted")
      .eq("requester_id", userId),
    supabase
      .from("friendships")
      .select("requester_id")
      .eq("status", "accepted")
      .eq("addressee_id", userId),
  ]);

  if (asRequester.error) throw asRequester.error;
  if (asAddressee.error) throw asAddressee.error;

  return [
    ...(asRequester.data ?? []).map((row) => row.addressee_id),
    ...(asAddressee.data ?? []).map((row) => row.requester_id),
  ].filter((id) => typeof id === "string" && id.length > 0);
}

async function fetchFriendIds(supabase, userId) {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase.rpc("list_accepted_friend_ids", {
    target: userId,
  });
  if (!error) return normalizeFriendIds(data);

  try {
    return await fetchFriendIdsFromTable(supabase, userId);
  } catch {
    throw error;
  }
}

module.exports = { fetchFriendIds, normalizeFriendIds, fetchFriendIdsFromTable };
