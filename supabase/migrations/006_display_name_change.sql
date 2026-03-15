-- Add cooldown tracking for display name changes
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name_changed_at TIMESTAMPTZ;

-- RPC to change display name with 1-week cooldown
CREATE OR REPLACE FUNCTION change_display_name(new_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _uid UUID := auth.uid();
  _last TIMESTAMPTZ;
  _now  TIMESTAMPTZ := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Length validation (matches MAX_DISPLAY_NAME = 50)
  IF char_length(trim(new_name)) < 1 OR char_length(trim(new_name)) > 50 THEN
    RAISE EXCEPTION 'Display name must be 1-50 characters';
  END IF;

  -- Check cooldown
  SELECT display_name_changed_at INTO _last
    FROM profiles WHERE id = _uid;

  IF _last IS NOT NULL AND _last + INTERVAL '7 days' > _now THEN
    RAISE EXCEPTION 'You can change your display name again on %',
      to_char(_last + INTERVAL '7 days', 'YYYY-MM-DD');
  END IF;

  -- Apply change
  UPDATE profiles
    SET display_name = trim(new_name),
        display_name_changed_at = _now
    WHERE id = _uid;

  RETURN json_build_object(
    'display_name', trim(new_name),
    'display_name_changed_at', _now
  );
END;
$$;
