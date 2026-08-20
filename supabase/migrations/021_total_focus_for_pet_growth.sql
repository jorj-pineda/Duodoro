-- ─────────────────────────────────────────────────────────────────────────────
-- Total focus seconds for a named user, for pet growth
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `petStage` is derived from a user's completed focus (ROADMAP item 12), and
-- the server derives it — for both players, so two people never see the same
-- animal at two sizes. That means the server needs a total for a user who is
-- not the caller, and it has no caller at all: it holds the service key, which
-- has no `auth.uid()`. `get_focus_stats` reads `auth.uid()` and raises
-- "Not authenticated" without one, so it cannot serve this.
--
-- ── What this replaces ──────────────────────────────────────────────────────
-- The shipped version (PR #42) does the aggregation in JS: PostgREST cannot
-- sum over an embedded table, so `server/index.js` selects one row per
-- completed session and adds them up — on every create_session and every
-- join_session, for the whole of someone's history. A `sessions` row is
-- written per focus phase, so that is ~1,500 rows/year for a daily user, to
-- compute one integer. It is also silently truncated by the project's API
-- "Max rows" setting (1000 by default), which no error reports.
--
-- Same move migration 015 made for the stats page, and for the same reason:
-- send the number, not the history it was computed from.
--
-- ── Why not let each client report its own stage ────────────────────────────
-- Because it is earned. A client-sent stage is a client-chosen stage, and the
-- feature would be "type `full` to have a full-grown dragon". Pets are already
-- session state the server owns (`set_pet` sanitises against VALID_PETS); the
-- stage belongs on the same side of that line.
--
-- ── Why clients cannot call this ────────────────────────────────────────────
-- It takes a user id, so granting it to `authenticated` would let anyone read
-- anyone's focus total. EXECUTE goes to `service_role` only. A user's *own*
-- total already has a route — `get_focus_stats`, which needs no argument
-- precisely because it takes the caller from the JWT.
--
-- Seconds, not minutes: `sessions.actual_focus` is a seconds column. The body
-- below is the same `coalesce(sum(s.actual_focus), 0)::bigint` over the same
-- join and the same `s.completed` filter that `get_focus_stats.total_focus_time`
-- uses, so a pet's size and the number on the user's own stats page can never
-- disagree about how much focus they have.

CREATE OR REPLACE FUNCTION total_focus_seconds(target UUID)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT coalesce(sum(s.actual_focus), 0)::bigint
    FROM sessions s
    JOIN session_participants sp ON sp.session_id = s.id
   WHERE sp.user_id = target AND s.completed;
$$;

REVOKE ALL ON FUNCTION total_focus_seconds(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION total_focus_seconds(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION total_focus_seconds(UUID) TO service_role;

-- ── Verifying ───────────────────────────────────────────────────────────────
--
-- 1. Expect service_role and nothing else:
--
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name = 'total_focus_seconds';
--
-- 2. Expect prosecdef = true and a pinned search_path, matching migration 009:
--
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--    WHERE proname = 'total_focus_seconds';
--
-- 3. Expect this to agree with what the user's own stats page shows them:
--
--   SELECT total_focus_seconds(id), username FROM profiles LIMIT 5;
