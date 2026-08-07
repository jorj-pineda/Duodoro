-- ─────────────────────────────────────────────────────────────────────────────
-- Index the columns every task query actually filters on
-- ─────────────────────────────────────────────────────────────────────────────
--
-- tasks has carried no index on owner_id or room_code since 001, yet those are
-- the only two columns anything filters by:
--
--   useTasks        .eq(owner_id).is(room_code, null)   -- personal to-dos
--   useStickyNotes  .eq(owner_id).is(room_code, null)   -- personal notes
--   useStickyNotes  .eq(room_code, <session>)           -- shared notes
--
-- Both run on every dashboard load and every session, and the second is also
-- re-evaluated by the tasks_read policy per candidate row. Fine at today's
-- size, a sequential scan of the whole table as it grows.
--
-- (The one index that does exist, tasks_session_id_idx from 003, is on
-- tasks.session_id — a column nothing in the client or server reads or writes.
-- It's partial on IS NOT NULL so it stays empty and costs nothing; left in
-- place rather than dropped, since removing it fixes nothing.)

-- Leading column owner_id serves owner-only lookups too, so this one index
-- covers both personal-task queries above.
CREATE INDEX IF NOT EXISTS tasks_owner_room_idx ON tasks (owner_id, room_code);

-- Shared-note reads always supply a non-null room_code, so keep it partial —
-- personal rows (the majority) stay out of the index entirely.
CREATE INDEX IF NOT EXISTS tasks_room_code_idx ON tasks (room_code)
  WHERE room_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run AFTER applying.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'tasks' ORDER BY 1;
