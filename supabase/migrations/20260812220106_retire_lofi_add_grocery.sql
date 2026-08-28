-- ─────────────────────────────────────────────────────────────────────────────
-- Retire the 'lofi' world, add 'grocery'
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The lo-fi world was replaced by a grocery store. Two things follow.
--
-- 1. `sessions.world` has a CHECK constraint (migration 008) listing the valid
--    ids. It has to learn 'grocery'.
--
-- 2. It must ALSO keep accepting 'lofi'. Those rows are the historical record
--    of sessions people actually ran in that world; rewriting them to 'grocery'
--    would be inventing history, and dropping 'lofi' from the CHECK would make
--    the whole table fail validation. So 'lofi' stays legal for existing rows
--    while the server's VALID_WORLDS no longer offers it, which means nothing
--    new can be written with it.
--
-- Source of truth for WorldId: client/src/lib/avatarData.ts

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_world_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_world_check
  CHECK (world IN (
    'forest', 'space', 'beach', 'city', 'mountain', 'library', 'cafe',
    'grocery',
    'lofi'   -- retired; kept so historical rows stay valid
  ));

-- Presence is ephemeral and points at a world the client can no longer render.
-- getWorld() falls back to forest for an unknown id so this is cosmetic, but a
-- stale value would show friends a room that no longer exists.
UPDATE profiles SET current_world_id = NULL WHERE current_world_id = 'lofi';
-- Canonical timestamp version for legacy migration 019.
