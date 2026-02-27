-- ─────────────────────────────────────────────────────────────────────────────
-- DuoFocus — Initial Schema
-- Run this in your Supabase project's SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Profiles (extends auth.users) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  avatar_config JSONB,
  is_premium    BOOLEAN DEFAULT FALSE,
  current_room  TEXT,       -- set when hosting/in a session
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Friendships ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status       TEXT CHECK (status IN ('pending', 'accepted')) DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate pairs regardless of direction (A→B same as B→A)
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique
  ON friendships (
    LEAST(requester_id::text, addressee_id::text),
    GREATEST(requester_id::text, addressee_id::text)
  );

-- ── Tasks (sticky note journal) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id   UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  room_code  TEXT,            -- NULL = personal task
  content    TEXT NOT NULL,
  is_done    BOOLEAN DEFAULT FALSE,
  is_shared  BOOLEAN DEFAULT FALSE,  -- TRUE = visible to partner in same room
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Waitlist (premium email capture) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row-Level Security ────────────────────────────────────────────────────

ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist    ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_read_all"   ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_read_all"   ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- friendships
DROP POLICY IF EXISTS "friendships_read_own" ON friendships;
DROP POLICY IF EXISTS "friendships_insert"   ON friendships;
DROP POLICY IF EXISTS "friendships_accept"   ON friendships;
CREATE POLICY "friendships_read_own" ON friendships FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY "friendships_insert"   ON friendships FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());
CREATE POLICY "friendships_accept"   ON friendships FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid());

-- tasks
DROP POLICY IF EXISTS "tasks_read"   ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;
CREATE POLICY "tasks_read" ON tasks FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (room_code IS NOT NULL AND is_shared = TRUE));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- waitlist
DROP POLICY IF EXISTS "waitlist_insert" ON waitlist;
CREATE POLICY "waitlist_insert" ON waitlist FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ── Real-time subscriptions ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
  END IF;
END $$;

-- ── Auto-create profile on sign-up ───────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  suffix INT := 0;
BEGIN
  -- Build base username from OAuth metadata or email
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'preferred_username',
    NEW.raw_user_meta_data->>'user_name',
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );

  -- Sanitize: keep only alphanumeric + underscores, lowercase
  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g'));

  -- Fallback if empty after sanitize
  IF base_username = '' THEN
    base_username := 'user';
  END IF;

  -- Find a unique username by appending a number if needed
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      base_username
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup due to profile creation errors
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
