-- ─────────────────────────────────────────────────────────────────────────────
-- Security Fixes
-- ─────────────────────────────────────────────────────────────────────────────

-- [H-5] Fix tasks_read RLS: shared tasks should only be visible to session participants
DROP POLICY IF EXISTS "tasks_read" ON tasks;
CREATE POLICY "tasks_read" ON tasks FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (
      is_shared = TRUE
      AND room_code IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM session_participants sp
        JOIN sessions s ON s.id = sp.session_id
        WHERE s.room_code = tasks.room_code
          AND sp.user_id = auth.uid()
      )
    )
  );

-- [M-6] Fix TOCTOU race in claim_username: use SELECT FOR UPDATE + single atomic check
CREATE OR REPLACE FUNCTION claim_username(desired_username TEXT)
RETURNS JSONB AS $$
DECLARE
  caller_id UUID := auth.uid();
  clean_name TEXT;
  new_disc TEXT;
  already_changed BOOLEAN;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the row to prevent concurrent changes
  SELECT username_changed INTO already_changed
    FROM profiles WHERE id = caller_id FOR UPDATE;

  IF already_changed THEN
    RAISE EXCEPTION 'Username can only be changed once';
  END IF;

  clean_name := lower(trim(desired_username));

  IF clean_name !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Username must be 3-20 characters: lowercase letters, numbers, underscores only';
  END IF;

  new_disc := generate_discriminator(clean_name);

  UPDATE profiles
  SET username = clean_name, discriminator = new_disc, username_changed = TRUE
  WHERE id = caller_id;

  RETURN jsonb_build_object('username', clean_name, 'discriminator', new_disc);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- [L-3] Add CHECK constraint on sessions.world column
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_world_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_world_check
  CHECK (world IN ('forest', 'space', 'beach', 'city'));
-- Canonical timestamp version for legacy migration 007.
