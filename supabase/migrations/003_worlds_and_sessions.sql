-- ─────────────────────────────────────────────────────────────────────────────
-- DuoFocus — Worlds & session-based presence (replace room codes)
-- Run after 001_initial.sql and 002_sessions.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Profiles: session-based presence (keep current_room for backward compat; can drop later)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_session_id UUID,
  ADD COLUMN IF NOT EXISTS current_world_id TEXT;

-- Tasks: optional session scope (alongside room_code for migration)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS session_id UUID;

-- Optional: index for "my tasks in this session"
CREATE INDEX IF NOT EXISTS tasks_session_id_idx ON tasks (session_id) WHERE session_id IS NOT NULL;
