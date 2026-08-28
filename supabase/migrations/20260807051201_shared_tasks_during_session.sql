-- ─────────────────────────────────────────────────────────────────────────────
-- Make shared sticky notes visible during the session, not after it
-- ─────────────────────────────────────────────────────────────────────────────
--
-- tasks_read (007) grants non-owner reads only via:
--   EXISTS (session_participants sp JOIN sessions s ON s.room_code = ...)
--
-- But `sessions` rows are written exclusively by recordSession() on the server,
-- which fires when a focus phase completes or is stopped. So during `waiting`
-- and the whole of the first focus round there is no sessions row carrying that
-- room_code, and the partner's SELECT — plus the realtime subscription in
-- useStickyNotes, which is RLS-filtered the same way — return nothing.
--
-- The result: "Our Goals" silently shows its empty state at exactly the moment
-- a couple would use it, then fills in later. It looks like the feature is
-- broken rather than gated.
--
-- Fix: also allow reads when the caller is *currently in* that session.
-- profiles.current_session_id is maintained by the server with the service key,
-- and migration 010 revoked UPDATE on it from authenticated/anon — so it is a
-- trustworthy statement of where someone actually is, not a client claim.
--
-- The historical clause is kept: past participants keep access to notes from
-- sessions they were part of.

DROP POLICY IF EXISTS "tasks_read" ON tasks;
CREATE POLICY "tasks_read" ON tasks FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (
      is_shared = TRUE
      AND room_code IS NOT NULL
      AND (
        -- In that session right now (server-maintained presence)
        room_code = (
          SELECT p.current_session_id::text
            FROM profiles p
           WHERE p.id = auth.uid()
        )
        -- …or was a participant once it got recorded
        OR EXISTS (
          SELECT 1 FROM session_participants sp
          JOIN sessions s ON s.id = sp.session_id
          WHERE s.room_code = tasks.room_code
            AND sp.user_id = auth.uid()
        )
      )
    )
  );

-- sessions.room_code is the join key in the historical clause above, evaluated
-- per candidate task row, and was unindexed.
CREATE INDEX IF NOT EXISTS sessions_room_code_idx ON sessions (room_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run AFTER applying.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'sessions';
--   SELECT policyname FROM pg_policies WHERE tablename = 'tasks' AND cmd = 'SELECT';
-- Canonical timestamp version for legacy migration 013.
