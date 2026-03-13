-- ─────────────────────────────────────────────────────────────────────────────
-- DuoFocus — Username Tag System (Discord-style #XXXX discriminators)
-- Run after 004_tighten_session_rls.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add discriminator column (nullable first for backfill) + username_changed flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discriminator TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_changed BOOLEAN DEFAULT FALSE;

-- 2. Helper: generate a random 4-digit discriminator that doesn't collide
CREATE OR REPLACE FUNCTION generate_discriminator(base_username TEXT)
RETURNS TEXT AS $$
DECLARE
  candidate TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    candidate := lpad(floor(random() * 10000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE username = base_username AND discriminator = candidate
    );
    attempts := attempts + 1;
    IF attempts >= 20 THEN
      RAISE EXCEPTION 'Could not generate unique discriminator for "%"', base_username;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: claim_username — validates, generates discriminator, updates profile
CREATE OR REPLACE FUNCTION claim_username(desired_username TEXT)
RETURNS JSONB AS $$
DECLARE
  caller_id UUID := auth.uid();
  clean_name TEXT;
  new_disc TEXT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Enforce one-time change
  IF EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND username_changed = TRUE) THEN
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

-- 4. Sanitize existing usernames that don't match the new format, then backfill discriminators
DO $$
DECLARE
  r RECORD;
  clean TEXT;
  disc TEXT;
BEGIN
  -- Fix usernames that violate the new pattern
  -- lowercase FIRST so uppercase chars become valid instead of being stripped
  FOR r IN SELECT id, username FROM profiles WHERE username !~ '^[a-z0-9_]{3,20}$' LOOP
    clean := regexp_replace(lower(r.username), '[^a-z0-9_]', '', 'g');
    clean := left(clean, 20);
    IF length(clean) < 3 THEN
      clean := clean || repeat('_', 3 - length(clean));
    END IF;
    RAISE NOTICE 'Sanitizing user %: "%" -> "%"', r.id, r.username, clean;
    UPDATE profiles SET username = clean WHERE id = r.id;
  END LOOP;

  -- Backfill discriminators
  FOR r IN SELECT id, username FROM profiles WHERE discriminator IS NULL LOOP
    disc := generate_discriminator(r.username);
    UPDATE profiles SET discriminator = disc WHERE id = r.id;
  END LOOP;
END $$;

-- 5. Now enforce NOT NULL + check constraints (drop first for re-runnability)
ALTER TABLE profiles ALTER COLUMN discriminator SET NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS discriminator_format;
ALTER TABLE profiles ADD CONSTRAINT discriminator_format CHECK (discriminator ~ '^\d{4}$');
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS username_format;
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$');

-- 6. Drop old unique constraint on username alone, add composite unique
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_discriminator_unique
  ON profiles (username, discriminator);

-- 7. Update handle_new_user() trigger to also generate a discriminator
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  new_disc TEXT;
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

  -- Truncate to 20 chars max
  base_username := left(base_username, 20);

  -- Ensure minimum 3 chars
  IF length(base_username) < 3 THEN
    base_username := base_username || repeat('_', 3 - length(base_username));
  END IF;

  final_username := base_username;
  new_disc := generate_discriminator(final_username);

  INSERT INTO public.profiles (id, username, display_name, discriminator)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      base_username
    ),
    new_disc
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup due to profile creation errors
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
