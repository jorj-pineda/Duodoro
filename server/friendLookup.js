// Accepted-friend ids for one user. Two equality filters, never a string
// `.or(...)` interpolation: a 400 from PostgREST here used to become an
// empty list, which made `areFriends` refuse real friends and
// `get_online_friends` report nobody.

async function fetchFriendIds(supabase, userId) {
  if (!supabase || !userId) return [];

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

module.exports = { fetchFriendIds };
