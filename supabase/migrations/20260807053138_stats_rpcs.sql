-- ─────────────────────────────────────────────────────────────────────────────
-- Aggregate stats in Postgres instead of shipping the whole history
-- ─────────────────────────────────────────────────────────────────────────────
--
-- useStats currently: SELECTs every session the user has ever joined (no
-- LIMIT), aggregates in JS, then sends *every* session id back as an .in()
-- list to find co-participants. A `sessions` row is written per focus phase,
-- so a few pomodoros a day is ~1,500 rows/year — the second query's URL
-- outgrows what PostgREST will accept long before the data is interesting.
-- Three components each mount their own useStats, so it all happens 3x.
--
-- These four functions do the aggregation server-side and return only what the
-- UI renders.
--
-- SECURITY DEFINER for two reasons: they need to read partner display names,
-- which migration 012 scoped to friends-only (unfriending someone should not
-- retroactively blank their name out of your history), and they read
-- session_participants rows for other users. Every one filters strictly to
-- sessions the caller participated in, so no cross-user data is reachable.
--
-- Streaks and "this week" take an IANA timezone. The old JS did its date math
-- in UTC while comparing against a local `new Date()`, so for anyone west of
-- UTC an evening session landed on tomorrow's UTC date and streaks flickered.

-- ── Personal totals + streaks ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_focus_stats(tz TEXT DEFAULT 'UTC')
RETURNS TABLE (
  total_focus_time   BIGINT,
  weekly_focus_time  BIGINT,
  sessions_completed BIGINT,
  current_streak     INT,
  longest_streak     INT,
  avg_session_length INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  safe_tz   TEXT := coalesce(nullif(trim(tz), ''), 'UTC');
  today     DATE;
  cur       INT := 0;
  best      INT := 0;
  run       INT := 0;
  prev_day  DATE := NULL;
  d         DATE;
  day_list  DATE[];
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Reject an unknown timezone rather than silently reporting wrong streaks
  BEGIN
    today := (now() AT TIME ZONE safe_tz)::date;
  EXCEPTION WHEN OTHERS THEN
    safe_tz := 'UTC';
    today := (now() AT TIME ZONE 'UTC')::date;
  END;

  SELECT array_agg(DISTINCT dd ORDER BY dd DESC) INTO day_list
    FROM (
      SELECT (s.ended_at AT TIME ZONE safe_tz)::date AS dd
        FROM sessions s
        JOIN session_participants sp ON sp.session_id = s.id
       WHERE sp.user_id = caller_id
         AND s.completed
         AND s.ended_at IS NOT NULL
    ) t;

  -- Longest run of consecutive days, and the current one anchored to
  -- today-or-yesterday (one day of grace, matching the old behavior).
  FOREACH d IN ARRAY coalesce(day_list, ARRAY[]::date[]) LOOP
    IF prev_day IS NULL OR prev_day - d = 1 THEN
      run := run + 1;
    ELSE
      run := 1;
    END IF;
    best := greatest(best, run);
    IF cur = 0 AND (d = today OR d = today - 1) THEN
      cur := 1;
    ELSIF cur > 0 AND prev_day - d = 1 THEN
      cur := cur + 1;
    ELSIF cur > 0 THEN
      cur := -cur; -- freeze: the current run has ended
    END IF;
    prev_day := d;
  END LOOP;
  cur := abs(cur);

  RETURN QUERY
  SELECT
    coalesce(sum(s.actual_focus), 0)::bigint,
    coalesce(sum(s.actual_focus) FILTER (
      WHERE (s.ended_at AT TIME ZONE safe_tz)::date
            >= date_trunc('week', (now() AT TIME ZONE safe_tz))::date
    ), 0)::bigint,
    count(*)::bigint,
    cur,
    best,
    coalesce(avg(s.actual_focus), 0)::int
  FROM sessions s
  JOIN session_participants sp ON sp.session_id = s.id
  WHERE sp.user_id = caller_id AND s.completed;
END $$;

-- ── Per-partner totals ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_duo_stats()
RETURNS TABLE (
  partner_id          UUID,
  partner_name        TEXT,
  total_co_focus_time BIGINT,
  sessions_together   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT other.user_id,
         coalesce(p.display_name, p.username, 'Unknown'),
         coalesce(sum(s.actual_focus), 0)::bigint,
         count(*)::bigint
    FROM session_participants mine
    JOIN sessions s              ON s.id = mine.session_id AND s.completed
    JOIN session_participants other ON other.session_id = mine.session_id
                                   AND other.user_id <> caller_id
    LEFT JOIN profiles p         ON p.id = other.user_id
   WHERE mine.user_id = caller_id
   GROUP BY other.user_id, coalesce(p.display_name, p.username, 'Unknown')
   ORDER BY 3 DESC;
END $$;

-- ── Recent history ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_recent_sessions(lim INT DEFAULT 20)
RETURNS TABLE (
  id             UUID,
  room_code      TEXT,
  world          TEXT,
  focus_duration INT,
  break_duration INT,
  actual_focus   INT,
  completed      BOOLEAN,
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  partner_name   TEXT,
  partner_id     UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT s.id, s.room_code, s.world, s.focus_duration, s.break_duration,
         s.actual_focus, s.completed, s.started_at, s.ended_at,
         coalesce(p.display_name, p.username),
         other.user_id
    FROM session_participants mine
    JOIN sessions s ON s.id = mine.session_id
    LEFT JOIN LATERAL (
      SELECT sp.user_id FROM session_participants sp
       WHERE sp.session_id = mine.session_id AND sp.user_id <> caller_id
       LIMIT 1
    ) other ON TRUE
    LEFT JOIN profiles p ON p.id = other.user_id
   WHERE mine.user_id = caller_id
   ORDER BY s.ended_at DESC NULLS LAST
   LIMIT greatest(1, least(coalesce(lim, 20), 100));
END $$;

-- ── Daily totals for the activity chart ──────────────────────────────────────
-- StatsScreen's "Last 7 Days" was built from recentSessions, which is capped
-- at 20 rows — so anyone doing more than 20 focus rounds in a week saw a
-- silently undercounted chart. Aggregating by day removes the cap entirely.
CREATE OR REPLACE FUNCTION get_daily_focus(days INT DEFAULT 7, tz TEXT DEFAULT 'UTC')
RETURNS TABLE (day DATE, focus_seconds BIGINT, session_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  safe_tz   TEXT := coalesce(nullif(trim(tz), ''), 'UTC');
  span      INT  := greatest(1, least(coalesce(days, 7), 366));
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  BEGIN
    PERFORM now() AT TIME ZONE safe_tz;
  EXCEPTION WHEN OTHERS THEN safe_tz := 'UTC';
  END;

  -- Emit a row per day, including zeros, so the chart doesn't have to
  -- reconstruct missing days on the client.
  -- Collapse the caller's history to (day, focus) once, then left-join the day
  -- series onto it — rather than pairing every day with every participation.
  RETURN QUERY
  WITH mine AS (
    SELECT (s.ended_at AT TIME ZONE safe_tz)::date AS d,
           s.actual_focus,
           s.id
      FROM sessions s
      JOIN session_participants sp ON sp.session_id = s.id
     WHERE sp.user_id = caller_id
       AND s.completed
       AND s.ended_at IS NOT NULL
  )
  SELECT g.day::date,
         coalesce(sum(mine.actual_focus), 0)::bigint,
         count(mine.id)::bigint
    FROM generate_series(
           ((now() AT TIME ZONE safe_tz)::date - (span - 1)),
           (now() AT TIME ZONE safe_tz)::date,
           interval '1 day'
         ) AS g(day)
    LEFT JOIN mine ON mine.d = g.day::date
   GROUP BY g.day
   ORDER BY g.day;
END $$;

REVOKE ALL ON FUNCTION get_focus_stats(TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_duo_stats()                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_recent_sessions(INT)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_daily_focus(INT, TEXT)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_focus_stats(TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION get_duo_stats()             TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_sessions(INT)    TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_focus(INT, TEXT)  TO authenticated;
-- Canonical timestamp version for legacy migration 015.
