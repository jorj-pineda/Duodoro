-- ─────────────────────────────────────────────────────────────────────────────
-- Fix the self-referential policy that breaks every task read
-- ─────────────────────────────────────────────────────────────────────────────
--
-- sp_read_own (migration 002) is a SELECT policy on session_participants whose
-- USING clause selects from session_participants:
--
--   USING (user_id = auth.uid() OR EXISTS (
--     SELECT 1 FROM session_participants sp2
--      WHERE sp2.session_id = session_participants.session_id
--        AND sp2.user_id = auth.uid()))
--
-- Postgres applies RLS to that inner subquery too, which re-expands the same
-- policy, and bails out at *rewrite* time with
--
--   ERROR: infinite recursion detected in policy for relation
--          "session_participants"                             (SQLSTATE 42P17)
--
-- Because it fails during planning rather than execution, the OR does not
-- short-circuit it: any statement that has to expand the policy errors, no
-- matter which rows are involved or whether the EXISTS would ever be reached.
--
-- The blast radius is much wider than the sessions history screen, because two
-- other policies reference this table:
--
--   * tasks_read (007, extended by 013) probes session_participants in its
--     "was a participant once it got recorded" clause. So EVERY authenticated
--     SELECT on tasks fails — including a user reading their own personal
--     to-dos, which has nothing to do with sessions. And since a WHERE clause
--     on UPDATE/DELETE has to read the row first, task updates and deletes
--     fail too.
--   * sessions_read_own (002) probes it as well, so reading `sessions` fails.
--
-- Which means: the sticky-note feature has been returning 42P17 to the client
-- for every read. useTasks/useStickyNotes do `if (data) setTasks(...)`, so an
-- errored fetch leaves the list at its previous value and shows the empty
-- state — the failure looks like "I have no tasks" rather than like an error.
-- That also explains why migration 013 read as a *visibility* problem: the
-- symptom of a 42P17 here is indistinguishable from an empty result set.
--
-- The stats RPCs (015) and the server's writes were unaffected: SECURITY
-- DEFINER functions and the service-role key both run as the table owner, who
-- is not subject to RLS, so nothing expands the policy on those paths.
--
-- Fix: do the membership probe inside a SECURITY DEFINER function. It runs as
-- the owner, so RLS is not applied to the lookup and there is nothing to
-- recurse into. Same visibility rule as before, minus the recursion.

CREATE OR REPLACE FUNCTION is_session_participant(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM session_participants sp
     WHERE sp.session_id = p_session_id
       AND sp.user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION is_session_participant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_session_participant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION is_session_participant(uuid) TO authenticated;

-- The `user_id = auth.uid()` term is kept first so the common case — reading
-- your own participation rows — never pays for the function call.
DROP POLICY IF EXISTS "sp_read_own" ON session_participants;
CREATE POLICY "sp_read_own" ON session_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_session_participant(session_id)
  );

-- sessions_read_own is not itself recursive, but it expands sp_read_own to
-- probe session_participants. Pointing it at the function instead keeps that
-- expansion out of the plan entirely, which is both cheaper and one less place
-- for a future policy edit to reintroduce a cycle.
DROP POLICY IF EXISTS "sessions_read_own" ON sessions;
CREATE POLICY "sessions_read_own" ON sessions FOR SELECT TO authenticated
  USING (is_session_participant(id));

-- The function filters on (session_id, user_id); migration 002 indexed
-- session_id alone.
CREATE INDEX IF NOT EXISTS session_participants_session_user_idx
  ON session_participants (session_id, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run AFTER applying.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Neither policy should mention the table it is defined on:
--
--   SELECT tablename, policyname, qual FROM pg_policies
--    WHERE policyname IN ('sp_read_own', 'sessions_read_own');
--
-- 2. The real test is that a normal user can read tasks at all. Run as any
--    signed-in user from the client, or in the SQL editor:
--
--      SET LOCAL ROLE authenticated;
--      SELECT set_config('request.jwt.claim.sub', '<a real user uuid>', true);
--      SELECT count(*) FROM tasks;
--      SELECT count(*) FROM session_participants;
--      RESET ROLE;
--
--    Before this migration both raise SQLSTATE 42P17. After, both return a
--    count.
