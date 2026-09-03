// Accepted-friend ids for one user. Prefer the service-role RPC; confirm via
// bound table filters when the RPC errors or returns an empty parse. PostgREST
// can wrap a UUID[] scalar as a nested array, which used to look like "no
// friends" and refuse real invites.

function normalizeFriendIds(data) {
  const out = [];
  const walk = (value) => {
    if (value == null || value === "") return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          walk(JSON.parse(trimmed));
          return;
        } catch {
          /* fall through to a plain id */
        }
      }
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        for (const part of trimmed.slice(1, -1).split(",")) {
          walk(part.trim().replace(/^"|"$/g, ""));
        }
        return;
      }
      out.push(trimmed.toLowerCase());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      if (typeof value.friend_id === "string") walk(value.friend_id);
      else if (value.list_accepted_friend_ids != null) {
        walk(value.list_accepted_friend_ids);
      }
    }
  };
  walk(data);
  return out;
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
  ]
    .filter((id) => typeof id === "string" && id.length > 0)
    .map((id) => id.toLowerCase());
}

async function fetchFriendIds(supabase, userId) {
  if (!supabase || !userId) return [];

  let rpcIds = [];
  let rpcError = null;
  const { data, error } = await supabase.rpc("list_accepted_friend_ids", {
    target: userId,
  });
  if (error) rpcError = error;
  else rpcIds = normalizeFriendIds(data);

  // A successful empty parse is not proof of "no friends": PostgREST wrapping
  // UUID[] as [[id]] used to normalize to [] and skip this fallback.
  if (rpcIds.length > 0) return rpcIds;

  try {
    return await fetchFriendIdsFromTable(supabase, userId);
  } catch {
    if (rpcError) throw rpcError;
    return [];
  }
}

module.exports = { fetchFriendIds, normalizeFriendIds, fetchFriendIdsFromTable };
