-- ─────────────────────────────────────────────────────────────────────────────
-- Expand sessions.world CHECK constraint to match the app's current WorldId list
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Migration 007 defined the CHECK with only ('forest','space','beach','city'),
-- which pre-dated the mountain/library/cafe/lofi worlds. The constraint in 007
-- was never applied because the stricter list rejected existing rows.
--
-- Source of truth for WorldId: client/src/lib/avatarData.ts

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_world_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_world_check
  CHECK (world IN ('forest', 'space', 'beach', 'city', 'mountain', 'library', 'cafe', 'lofi'));
