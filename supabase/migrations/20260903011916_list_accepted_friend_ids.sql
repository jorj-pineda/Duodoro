-- Accepted-friend ids for a named user, for invite and presence checks.
--
-- The realtime server holds the service key, which has no auth.uid(), and it
-- must answer "are these two people friends?" before sending an invite. Table
-- reads through PostgREST were returning an empty list for real friendships,
-- so the socket layer refused invites with "You can only invite friends" and
-- reported nobody online. One SECURITY DEFINER RPC, service_role-only, is the
-- same shape as total_focus_seconds: the server is the only caller because
-- the argument is a user id.

CREATE OR REPLACE FUNCTION list_accepted_friend_ids(target UUID)
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT coalesce(array_agg(
    CASE
      WHEN f.requester_id = target THEN f.addressee_id
      ELSE f.requester_id
    END
  ), '{}'::uuid[])
    FROM friendships AS f
   WHERE f.status = 'accepted'
     AND (f.requester_id = target OR f.addressee_id = target);
$$;

REVOKE ALL ON FUNCTION list_accepted_friend_ids(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_accepted_friend_ids(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION list_accepted_friend_ids(UUID) TO service_role;
