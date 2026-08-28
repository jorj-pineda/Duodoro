-- ─────────────────────────────────────────────────────────────────────────────
-- Stop every user being able to read every profile
-- ─────────────────────────────────────────────────────────────────────────────
--
-- profiles_read_all was `USING (true)`: any authenticated user could read any
-- profile row, including current_session_id / current_world_id / current_room.
-- Combined with join_session having had no membership check, that was a
-- complete enumeration path into strangers' live sessions — and independently
-- it leaks who is online, what they're doing, and when.
--
-- Reads are now scoped to people you actually have a relationship with:
--   * yourself
--   * anyone you have a friendships row with, in EITHER direction and at ANY
--     status. Pending matters as much as accepted: the Requests tab joins
--     profiles for the requester, and those aren't friends yet.
--
-- Discovering new people goes through search_profiles() (migration 011), which
-- is SECURITY DEFINER and returns public identity fields only — no presence.
--
-- Requires 011 to be applied first, and the client to be using the RPC,
-- otherwise friend search silently returns nothing.

DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
DROP POLICY IF EXISTS "profiles_read_known" ON profiles;

CREATE POLICY "profiles_read_known" ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM friendships f
      WHERE (f.requester_id = auth.uid() AND f.addressee_id = profiles.id)
         OR (f.addressee_id = auth.uid() AND f.requester_id = profiles.id)
    )
  );

-- The policy's EXISTS probes friendships by each side independently; the only
-- existing index is the LEAST/GREATEST expression one, which cannot serve
-- either lookup. Without these, every profile read becomes a seq scan of
-- friendships.
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run AFTER applying.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Expect exactly one SELECT policy, named profiles_read_known:
--
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'profiles' AND cmd = 'SELECT';
--
-- 2. Expect both new indexes present:
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'friendships' ORDER BY indexname;
-- Canonical timestamp version for legacy migration 012.
