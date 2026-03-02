-- ─────────────────────────────────────────────────────────────────────────────
-- Tighten session recording RLS — only the server (service role) can insert.
-- The service role key bypasses RLS entirely, so removing these INSERT policies
-- means no client-side user can create fake session records.
-- Run this AFTER 002_sessions.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove the overly permissive INSERT policies
DROP POLICY IF EXISTS "sessions_insert" ON sessions;
DROP POLICY IF EXISTS "sp_insert" ON session_participants;

-- No replacement INSERT policies needed — the server uses the service role key
-- which bypasses RLS. Authenticated users can still SELECT their own sessions
-- via the existing "sessions_read_own" and "sp_read_own" policies.
