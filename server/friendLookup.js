// Accepted-friend ids for one user. One service-role RPC, not a PostgREST
// table filter: an empty error result here used to make `areFriends` refuse
// real friends and `get_online_friends` report nobody.

function isMissingRpc(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  return code === "PGRST202" || code === "42883";
}

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
  if (!isMissingRpc(error)) throw error;

  // Migration not applied yet: keep invites working on the bound table filters.
  return fetchFriendIdsFromTable(supabase, userId);
}

module.exports = { fetchFriendIds, normalizeFriendIds };
