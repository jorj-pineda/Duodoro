-- ─────────────────────────────────────────────────────────────────────────────
-- Lock down privileged columns + fix friendship UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Three holes, all reachable with nothing but the public anon key:
--
--   1. profiles_update_own allows updating ANY column of your own row, so a
--      user could set is_premium = true, rewrite username/discriminator to
--      bypass claim_username's one-time rule, clear username_changed, reset
--      display_name_changed_at to dodge the 7-day cooldown, or spoof
--      current_session_id so friends see a bogus "join" target.
--
--   2. friendships_accept is `FOR UPDATE ... USING (addressee_id = auth.uid())`
--      with no WITH CHECK and no column restriction. Postgres reuses USING as
--      the check, and both the old and new row satisfy it as long as
--      addressee_id stays put — so anyone holding a single pending request
--      could rewrite that row's requester_id to an arbitrary victim and set
--      status = 'accepted', forging a friendship. That grants presence
--      visibility, invites, and shared-task reads against someone who never
--      interacted with them.
--
--   3. friendships has no DELETE policy at all, so declining a request or
--      removing a friend silently matched zero rows and the entry came right
--      back on the next refetch.
--
-- RLS alone can't fix 1 and 2: a policy gates WHICH ROWS you may write, not
-- WHICH COLUMNS. Column privileges are the right tool. Note that in Postgres a
-- table-level UPDATE grant outranks column-level grants entirely, so the
-- table-level grant has to go first — otherwise the GRANTs below are dead
-- weight. Supabase hands `authenticated` table-wide UPDATE by default.
--
-- The privileged writes keep working because they don't go through this role:
-- claim_username / change_display_name are SECURITY DEFINER (they execute as
-- the owner), and the presence writes use the service key, which bypasses both
-- RLS and these grants.

-- ── profiles ──────────────────────────────────────────────────────────────
REVOKE UPDATE ON profiles FROM authenticated, anon;

-- Only what the client legitimately writes directly:
--   avatar_config — AvatarCreator save
--   display_name  — set once during first-run setup (see caveat below)
--   updated_at    — touched alongside those writes
GRANT UPDATE (avatar_config, display_name, updated_at) ON profiles TO authenticated;

-- CAVEAT: display_name stays directly writable because first-run setup writes
-- it straight to the table, before any cooldown should apply. That means the
-- 7-day cooldown in change_display_name is still bypassable by calling the
-- REST API directly. It's cosmetic abuse (renaming yourself often), not
-- privilege escalation, so it's deliberately left for a follow-up that folds
-- the first-set into an RPC and drops display_name from this grant.

-- ── friendships ───────────────────────────────────────────────────────────
REVOKE UPDATE ON friendships FROM authenticated, anon;

-- Accepting a request is the only legitimate client-side update, and status is
-- the only column it needs. With requester_id/addressee_id no longer writable,
-- the forgery in (2) is impossible regardless of policy wording.
GRANT UPDATE (status) ON friendships TO authenticated;

-- Defense in depth: pin the post-update row as well, so a future re-widening
-- of the grants can't silently reopen the hole.
DROP POLICY IF EXISTS "friendships_accept" ON friendships;
CREATE POLICY "friendships_accept" ON friendships FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid())
  WITH CHECK (addressee_id = auth.uid() AND status IN ('pending', 'accepted'));

-- Either party may withdraw: the addressee declines or unfriends, the
-- requester cancels a pending request or unfriends.
DROP POLICY IF EXISTS "friendships_delete" ON friendships;
CREATE POLICY "friendships_delete" ON friendships FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run this AFTER applying, in the same SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Expect exactly avatar_config, display_name, updated_at for profiles, and
--    exactly status for friendships. Any other row means the REVOKE didn't
--    take (most likely something re-granted table-wide UPDATE afterwards).
--
--   SELECT table_name, column_name
--     FROM information_schema.column_privileges
--    WHERE grantee = 'authenticated'
--      AND privilege_type = 'UPDATE'
--      AND table_name IN ('profiles', 'friendships')
--    ORDER BY table_name, column_name;
--
-- 2. Expect NO rows. A row here means table-level UPDATE is still granted,
--    which silently outranks every column grant above and leaves all three
--    holes open.
--
--   SELECT grantee, table_name
--     FROM information_schema.table_privileges
--    WHERE grantee IN ('authenticated', 'anon')
--      AND privilege_type = 'UPDATE'
--      AND table_name IN ('profiles', 'friendships');
--
-- 3. Expect a friendships_delete row alongside the others.
--
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'friendships' ORDER BY policyname;
-- Canonical timestamp version for legacy migration 010.
