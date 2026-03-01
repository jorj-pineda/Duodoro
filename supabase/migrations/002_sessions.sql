-- ─────────────────────────────────────────────────────────────────────────────
-- DuoFocus — Session Stats & History
-- Run this in your Supabase project's SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Sessions (one row per completed focus phase) ────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code       TEXT NOT NULL,
  world           TEXT NOT NULL DEFAULT 'forest',
  focus_duration  INT NOT NULL,           -- configured duration in seconds
  break_duration  INT NOT NULL,           -- configured duration in seconds
  actual_focus    INT NOT NULL,           -- actual seconds focused (< focus_duration if stopped early)
  completed       BOOLEAN DEFAULT TRUE,   -- FALSE if stopped early or disconnect
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Session Participants (join table) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_participants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate user per session
CREATE UNIQUE INDEX IF NOT EXISTS session_participants_unique
  ON session_participants (session_id, user_id);

-- Fast per-user queries (stats, history)
CREATE INDEX IF NOT EXISTS session_participants_user_idx
  ON session_participants (user_id);

-- Time-based queries (streaks, weekly stats)
CREATE INDEX IF NOT EXISTS sessions_ended_at_idx
  ON sessions (ended_at);

-- ── Row-Level Security ──────────────────────────────────────────────────────

ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants  ENABLE ROW LEVEL SECURITY;

-- Sessions: users can read sessions they participated in
DROP POLICY IF EXISTS "sessions_read_own" ON sessions;
CREATE POLICY "sessions_read_own" ON sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = sessions.id AND sp.user_id = auth.uid()
    )
  );

-- Sessions: allow inserts (server uses service role, but keep open for flexibility)
DROP POLICY IF EXISTS "sessions_insert" ON sessions;
CREATE POLICY "sessions_insert" ON sessions FOR INSERT TO authenticated
  WITH CHECK (true);

-- Session participants: read own + sessions you participated in
DROP POLICY IF EXISTS "sp_read_own" ON session_participants;
CREATE POLICY "sp_read_own" ON session_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM session_participants sp2
      WHERE sp2.session_id = session_participants.session_id AND sp2.user_id = auth.uid()
    )
  );

-- Session participants: allow inserts
DROP POLICY IF EXISTS "sp_insert" ON session_participants;
CREATE POLICY "sp_insert" ON session_participants FOR INSERT TO authenticated
  WITH CHECK (true);
