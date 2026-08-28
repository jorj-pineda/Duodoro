-- ─────────────────────────────────────────────────────────────────────────────
-- Constrain where tasks can be written, and cap their size
-- ─────────────────────────────────────────────────────────────────────────────
--
-- tasks_insert (001) is `WITH CHECK (owner_id = auth.uid())` and says nothing
-- about room_code. So any authenticated user can POST a row with
-- is_shared = true and an arbitrary room_code, landing text directly in a
-- couple's "Our Goals" panel.
--
-- That is reachable, not theoretical. Migration 012 deliberately lets someone
-- with a *pending* friendship row read your profile — the Requests tab joins
-- profiles for people who aren't friends yet, so it has to. That read includes
-- current_session_id. Sending a friend request is therefore enough to learn a
-- live session id, and nothing then stopped writing into it. The victim can't
-- even remove the row: tasks_delete is owner-only.
--
-- Insert is now scoped the same way migration 013 scoped reads — to the
-- session you are actually in, which only the service key can set (010).
-- Personal tasks (room_code IS NULL) are unaffected.
--
-- content also had no server-side length limit; the 120-character cap is a
-- maxLength attribute on an input, which the REST API doesn't enforce. 500
-- leaves room for the existing UI without allowing a row to be used as blob
-- storage. Applied as NOT VALID so a long legacy row can't block the
-- migration, then validated separately.

DROP POLICY IF EXISTS "tasks_insert" ON tasks;
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      room_code IS NULL
      OR room_code = (
        SELECT p.current_session_id::text
          FROM profiles p
         WHERE p.id = auth.uid()
      )
    )
  );

-- Same scope on UPDATE: without it, someone could flip an existing personal
-- task's room_code to a session they aren't in and achieve the same thing.
DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      room_code IS NULL
      OR room_code = (
        SELECT p.current_session_id::text
          FROM profiles p
         WHERE p.id = auth.uid()
      )
    )
  );

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_content_length;
ALTER TABLE tasks ADD CONSTRAINT tasks_content_length
  CHECK (char_length(content) <= 500) NOT VALID;
ALTER TABLE tasks VALIDATE CONSTRAINT tasks_content_length;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run AFTER applying.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'tasks' ORDER BY cmd, policyname;
--
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_content_length';
--
-- If VALIDATE fails, some existing row is over 500 chars. Find them with:
--   SELECT id, char_length(content) FROM tasks WHERE char_length(content) > 500;
-- Canonical timestamp version for legacy migration 016.
