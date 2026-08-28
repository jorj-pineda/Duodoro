-- ─────────────────────────────────────────────────────────────────────────────
-- search_profiles RPC
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Prerequisite for migration 012, which stops letting every authenticated user
-- SELECT every profile row. Friend search is the one legitimate reason to read
-- a stranger's profile, and it only needs the public identity fields — never
-- presence (current_session_id / current_world_id / current_room), which is
-- what makes the current blanket read policy an enumeration path into other
-- people's live sessions.
--
-- SECURITY DEFINER so it keeps working once the table policy narrows.

CREATE OR REPLACE FUNCTION search_profiles(query TEXT)
RETURNS TABLE (
  id            UUID,
  username      TEXT,
  discriminator TEXT,
  display_name  TEXT,
  is_premium    BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  raw       TEXT := lower(trim(coalesce(query, '')));
  hash_at   INT;
  want_name TEXT;
  want_disc TEXT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Mirrors the client guard; also stops '' matching every row via ILIKE
  IF char_length(raw) < 3 THEN
    RETURN;
  END IF;

  hash_at := position('#' IN raw);

  IF hash_at > 0 AND char_length(raw) > hash_at THEN
    -- Exact tag lookup: name#0000
    want_name := substring(raw FROM 1 FOR hash_at - 1);
    want_disc := substring(raw FROM hash_at + 1);
    RETURN QUERY
      SELECT p.id, p.username, p.discriminator, p.display_name, p.is_premium
        FROM profiles p
       WHERE p.username = want_name
         AND p.discriminator = want_disc
         AND p.id <> caller_id
       LIMIT 10;
  ELSE
    -- Partial match. Escape LIKE wildcards so a user can't scan with '%'.
    RETURN QUERY
      SELECT p.id, p.username, p.discriminator, p.display_name, p.is_premium
        FROM profiles p
       WHERE p.username ILIKE '%' || replace(replace(raw, '%', '\%'), '_', '\_') || '%'
         AND p.id <> caller_id
       LIMIT 10;
  END IF;
END $$;

REVOKE ALL ON FUNCTION search_profiles(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_profiles(TEXT) TO authenticated;
-- Canonical timestamp version for legacy migration 011.
