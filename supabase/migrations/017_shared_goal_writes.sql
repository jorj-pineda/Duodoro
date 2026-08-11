-- ─────────────────────────────────────────────────────────────────────────────
-- Let both partners tick off a shared goal
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Our Goals" is the flagship couples feature and it has never worked as
-- rendered. tasks_update has been owner-only since migration 001, but
-- StickyNote's TaskRow draws a live checkbox on every shared note regardless of
-- who owns it. Ticking your partner's goal used to update local state, match
-- zero rows in Postgres, and silently revert on the next realtime refresh; as
-- of migration 016's client work it surfaces "Couldn't update that note."
-- Neither is the intended behaviour — a *shared* goal should be completable by
-- either person in the session.
--
-- RLS can't express this. A policy gates whole rows, so any UPDATE policy wide
-- enough to let a partner flip is_done also lets them rewrite content, and
-- WITH CHECK sees only the new row, so it cannot assert "nothing but is_done
-- changed". The repo's existing answer to exactly this shape of problem is a
-- SECURITY DEFINER RPC (claim_username, friendships_accept, search_profiles),
-- so shared toggles go through one here.
--
-- Deliberately NOT widened: DELETE and content edits stay owner-only. Your
-- partner can mark a goal done, not erase or reword it. The UI now hides the ✕
-- on notes you don't own instead of offering an action that can't succeed.

-- Who ticked it. Lets the UI say "✓ by Alex" instead of leaving both people
-- guessing which of them closed it out.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- completed_by is not client-writable
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Per migration 010's convention: RLS gates which *rows* you may write, never
-- which *columns*. With the table-level UPDATE grant in place, a client could
-- PATCH completed_by on its own row and credit the partner for work they never
-- did. So the grant is narrowed to the columns the client legitimately writes,
-- and completed_by is left to the RPC below (which runs as the definer).
--
-- Note the ordering trap called out in CLAUDE.md: a table-level UPDATE grant
-- silently outranks column grants, so the REVOKE has to come first and must
-- never be re-granted.
REVOKE UPDATE ON tasks FROM authenticated, anon;

-- is_done: ticking a task off, the only update the client makes today.
-- content: not written by the client yet, but it is the user's own text and
--   already fully client-settable at INSERT time, so withholding it here would
--   only turn a future "edit note" feature into a confusing 42501.
-- room_code / is_shared are intentionally absent: set once at INSERT, and
--   leaving them out makes migration 016's "relabel a personal task into
--   someone else's session" attack impossible at the privilege layer too, not
--   just at the policy layer.
GRANT UPDATE (is_done, content) ON tasks TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- The toggle
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Authorization mirrors migration 013's read rule: you may tick a shared goal
-- carrying the room_code of the session you are *currently in*.
-- profiles.current_session_id is written only by the server's service key
-- (migration 010 revoked it from authenticated/anon), so it is a trustworthy
-- statement of where someone actually is rather than a client claim.
--
-- Note this is stricter than tasks_read, which also lets *past* participants
-- see a session's notes. Historical goals stay immutable, which matches
-- migration 016 — its WITH CHECK already stops even the owner from editing a
-- task whose room_code isn't their live session.
CREATE OR REPLACE FUNCTION toggle_shared_task(p_task_id uuid, p_done boolean)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_room text;
  v_task tasks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.current_session_id::text INTO v_room
    FROM profiles p WHERE p.id = v_uid;

  IF v_room IS NULL THEN
    RAISE EXCEPTION 'not in a session' USING ERRCODE = '42501';
  END IF;

  UPDATE tasks
     SET is_done      = p_done,
         completed_by = CASE WHEN p_done THEN v_uid ELSE NULL END
   WHERE id        = p_task_id
     AND is_shared  = TRUE
     AND room_code  = v_room
  RETURNING * INTO v_task;

  -- Covers all of: no such task, not shared, and belongs to a session the
  -- caller isn't in. Collapsed into one message on purpose — distinguishing
  -- them would confirm the existence of tasks in sessions you can't see.
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'no shared goal with that id in your current session'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_task;
END $$;

REVOKE ALL ON FUNCTION toggle_shared_task(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION toggle_shared_task(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION toggle_shared_task(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run AFTER applying.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. completed_by exists:
--
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'tasks' AND column_name = 'completed_by';
--
-- 2. authenticated has column-level UPDATE and NO table-level UPDATE.
--    Expect exactly two rows — is_done and content — and nothing else:
--
--   SELECT column_name, privilege_type
--     FROM information_schema.column_privileges
--    WHERE table_name = 'tasks' AND grantee = 'authenticated'
--      AND privilege_type = 'UPDATE'
--    ORDER BY column_name;
--
--   SELECT privilege_type FROM information_schema.table_privileges
--    WHERE table_name = 'tasks' AND grantee = 'authenticated'
--    ORDER BY privilege_type;   -- must NOT contain UPDATE
--
-- 3. The RPC is executable by authenticated and not by anon:
--
--   SELECT has_function_privilege('authenticated',
--            'toggle_shared_task(uuid, boolean)', 'EXECUTE') AS authed,
--          has_function_privilege('anon',
--            'toggle_shared_task(uuid, boolean)', 'EXECUTE') AS anon;
--   -- expect: t, f
