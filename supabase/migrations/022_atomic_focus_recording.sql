-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic, idempotent completed-focus recording
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The server previously made two Data API requests: INSERT sessions, then
-- INSERT session_participants. A failure between them left an orphan session
-- and lost that focus from every participant's stats and pet progress.
--
-- A Postgres function call is one transaction. If participant validation or
-- insertion fails, the session insert rolls back with it. `recording_key` is a
-- stable UUID generated once per live focus round, so retrying after a lost
-- response returns the existing record instead of crediting the round twice.
--
-- The column remains nullable for deploy compatibility: migration first, then
-- server. An old server still doing direct inserts can run during that window.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS recording_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_recording_key_unique
  ON public.sessions (recording_key)
  WHERE recording_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_focus_session(
  p_recording_key  UUID,
  p_room_code      TEXT,
  p_world          TEXT,
  p_focus_duration INT,
  p_break_duration INT,
  p_actual_focus   INT,
  p_completed      BOOLEAN,
  p_started_at     TIMESTAMPTZ,
  p_user_ids       UUID[]
)
RETURNS TABLE (session_id UUID, inserted BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_session_id UUID;
  v_inserted   BOOLEAN := FALSE;
  v_existing   public.sessions%ROWTYPE;
  v_user_count INT;
BEGIN
  IF p_recording_key IS NULL THEN
    RAISE EXCEPTION 'recording key is required' USING ERRCODE = '22023';
  END IF;
  IF p_room_code IS NULL OR btrim(p_room_code) = '' THEN
    RAISE EXCEPTION 'room code is required' USING ERRCODE = '22023';
  END IF;
  IF p_world IS NULL OR btrim(p_world) = '' THEN
    RAISE EXCEPTION 'world is required' USING ERRCODE = '22023';
  END IF;
  IF p_focus_duration IS NULL OR p_focus_duration < 60 OR p_focus_duration > 7200 THEN
    RAISE EXCEPTION 'focus duration is out of range' USING ERRCODE = '22023';
  END IF;
  IF p_break_duration IS NULL OR p_break_duration < 30 OR p_break_duration > 3600 THEN
    RAISE EXCEPTION 'break duration is out of range' USING ERRCODE = '22023';
  END IF;
  IF p_actual_focus IS NULL OR p_actual_focus < 0 OR p_actual_focus > p_focus_duration THEN
    RAISE EXCEPTION 'actual focus is out of range' USING ERRCODE = '22023';
  END IF;
  IF p_completed IS NULL OR p_started_at IS NULL THEN
    RAISE EXCEPTION 'completion and start time are required' USING ERRCODE = '22023';
  END IF;
  IF p_user_ids IS NULL OR cardinality(p_user_ids) < 1 OR cardinality(p_user_ids) > 2 THEN
    RAISE EXCEPTION 'one or two participants are required' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT uid)::INT
    INTO v_user_count
    FROM unnest(p_user_ids) AS uid
   WHERE uid IS NOT NULL;

  IF v_user_count <> cardinality(p_user_ids) THEN
    RAISE EXCEPTION 'participants must be distinct, non-null users'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sessions (
    recording_key,
    room_code,
    world,
    focus_duration,
    break_duration,
    actual_focus,
    completed,
    started_at
  )
  VALUES (
    p_recording_key,
    p_room_code,
    p_world,
    p_focus_duration,
    p_break_duration,
    p_actual_focus,
    p_completed,
    p_started_at
  )
  ON CONFLICT (recording_key) WHERE recording_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_session_id;

  v_inserted := v_session_id IS NOT NULL;

  IF v_inserted THEN
    INSERT INTO public.session_participants (session_id, user_id)
    SELECT v_session_id, uid
      FROM unnest(p_user_ids) AS uid;
  ELSE
    SELECT *
      INTO v_existing
      FROM public.sessions
     WHERE recording_key = p_recording_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'recording conflict could not be resolved';
    END IF;

    -- A key identifies one immutable focus round, not merely "some write that
    -- already happened". Reject conflicting reuse rather than silently
    -- attaching new people or accepting different credit under the same key.
    IF v_existing.room_code       IS DISTINCT FROM p_room_code
       OR v_existing.world        IS DISTINCT FROM p_world
       OR v_existing.focus_duration IS DISTINCT FROM p_focus_duration
       OR v_existing.break_duration IS DISTINCT FROM p_break_duration
       OR v_existing.actual_focus IS DISTINCT FROM p_actual_focus
       OR v_existing.completed    IS DISTINCT FROM p_completed
       OR v_existing.started_at   IS DISTINCT FROM p_started_at THEN
      RAISE EXCEPTION 'recording key was reused with different session data'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      (SELECT sp.user_id
         FROM public.session_participants AS sp
        WHERE sp.session_id = v_existing.id
       EXCEPT
       SELECT uid FROM unnest(p_user_ids) AS uid)
      UNION ALL
      (SELECT uid FROM unnest(p_user_ids) AS uid
       EXCEPT
       SELECT sp.user_id
         FROM public.session_participants AS sp
        WHERE sp.session_id = v_existing.id)
    ) THEN
      RAISE EXCEPTION 'recording key was reused with different participants'
        USING ERRCODE = '22023';
    END IF;

    v_session_id := v_existing.id;
  END IF;

  RETURN QUERY SELECT v_session_id, v_inserted;
END;
$$;

-- The server is the sole writer and already uses the service-role key. Keep
-- this privileged write path unavailable to browser clients and PUBLIC's
-- default function EXECUTE grant.
REVOKE ALL ON FUNCTION public.record_focus_session(
  UUID, TEXT, TEXT, INT, INT, INT, BOOLEAN, TIMESTAMPTZ, UUID[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_focus_session(
  UUID, TEXT, TEXT, INT, INT, INT, BOOLEAN, TIMESTAMPTZ, UUID[]
) TO service_role;

-- ── Verification after applying ─────────────────────────────────────────────
--
-- 1. Expect service_role and nothing else:
--
--   SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE routine_schema = 'public'
--      AND routine_name = 'record_focus_session';
--
-- 2. Expect SECURITY INVOKER and an empty search_path:
--
--   SELECT proname, prosecdef, proconfig
--     FROM pg_proc
--    WHERE proname = 'record_focus_session';
--
-- 3. Call twice with the same key and inputs. The first row returns
--    inserted=true, the second inserted=false, with one sessions row and one
--    participant row per supplied user.
--
-- Rollback, if the server has first been rolled back to the two-insert path:
--   DROP FUNCTION public.record_focus_session(
--     UUID, TEXT, TEXT, INT, INT, INT, BOOLEAN, TIMESTAMPTZ, UUID[]
--   );
--   DROP INDEX public.sessions_recording_key_unique;
--   ALTER TABLE public.sessions DROP COLUMN recording_key;
