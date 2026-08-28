-- ─────────────────────────────────────────────────────────────────────────────
-- Premium, unlocked by a confirmed email address
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Premium exists in the UI and has never been grantable. `is_premium` defaults
-- to false, migration 010 revoked the client's ability to write it, and nothing
-- else sets it — so the flag is false for all 10 users and pets have been
-- unreachable for the life of the feature. The Upgrade button on the home
-- screen doesn't even open the modal (it calls setProfileMenuOpen(false) and
-- stops).
--
-- Owner's call, 2026-08-13: while the product is this small, premium is free in
-- exchange for a confirmed email address. Stripe arrives when there are enough
-- users to justify it; the seam for it is `client/src/lib/billing.ts`.
--
-- ── This is not a paywall, and is not trying to be ──────────────────────────
-- Any authenticated user can call claim_premium() and get premium. There is no
-- payment, no invite, no limit. That is the intent: the "price" is an email
-- address we can reach you at. Anyone reading this later and expecting a
-- revenue gate is reading the wrong function — see billing.ts.
--
-- ── Why there is no confirmation email ──────────────────────────────────────
-- Every user signs in with Google or Discord, so `auth.users.email_confirmed_at`
-- is already set for all of them: the provider verified the address at sign-in.
-- Sending our own "click to confirm" link would re-verify something already
-- verified, and verify it *worse* — a link in an inbox proves someone can read
-- that inbox, while an OAuth grant proves the account holder consented. It
-- would also need an email provider this project doesn't have (no Edge
-- Functions, and Supabase's built-in mailer sends auth templates only).
--
-- The function still checks `email_confirmed_at` rather than assuming it. If
-- email/password sign-in is ever enabled, unconfirmed accounts appear and this
-- is the line that keeps them out.

-- ── The record ──────────────────────────────────────────────────────────────
-- Kept separate from `profiles` rather than as another column on it. profiles
-- is read by other users (migration 012 restricts it, but friends see rows),
-- and an email address is not something a friend should be able to read. This
-- table is readable only by its own owner.
CREATE TABLE IF NOT EXISTS premium_grants (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text NOT NULL,
  -- Separate from the grant itself: giving us an address to identify you is
  -- not consent to be marketed at, and conflating the two is how mailing lists
  -- become spam complaints.
  marketing_opt_in boolean NOT NULL DEFAULT FALSE,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  -- How this grant was earned. When Stripe lands, paid grants get their own
  -- source and the free ones can be identified — and, if the owner chooses,
  -- expired — without guessing.
  source           text NOT NULL DEFAULT 'free_email_unlock'
);

-- Deliberately NOT unique. Supabase can hold two accounts with the same address
-- across two providers when identity linking is off, and a UNIQUE here would
-- turn that into an unexplainable failure for the second account.
CREATE INDEX IF NOT EXISTS premium_grants_email_idx ON premium_grants (email);

ALTER TABLE premium_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "premium_grants_read_own" ON premium_grants;
CREATE POLICY "premium_grants_read_own" ON premium_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No client writes at all: the RPC below is the only way in. Per migration
-- 010's convention, and note the ordering trap — a table-level grant outranks
-- column grants, so nothing here may be re-granted later.
REVOKE INSERT, UPDATE, DELETE ON premium_grants FROM authenticated, anon;

-- ── The grant ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER for two separate reasons, both required:
--   1. `is_premium` is not writable by `authenticated` (migration 010), and
--      must never become writable — that is the whole reason the flag is worth
--      anything.
--   2. `auth.users` is not readable by `authenticated` either, and the email
--      has to come from there rather than from the client. A client-supplied
--      address would make the "confirmed" check meaningless: you would be
--      confirming an address the caller just typed.
CREATE OR REPLACE FUNCTION claim_premium(p_marketing_opt_in boolean DEFAULT FALSE)
RETURNS premium_grants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_grant     premium_grants;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, u.email_confirmed_at
    INTO v_email, v_confirmed
    FROM auth.users u
   WHERE u.id = v_uid;

  IF v_email IS NULL OR v_confirmed IS NULL THEN
    RAISE EXCEPTION 'your account has no confirmed email address'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotent. Pressing the button twice is not an error, and re-claiming is
  -- how somebody changes their mind about marketing_opt_in. granted_at is left
  -- alone so it keeps meaning "when they first claimed".
  INSERT INTO premium_grants (user_id, email, marketing_opt_in)
  VALUES (v_uid, lower(v_email), COALESCE(p_marketing_opt_in, FALSE))
  ON CONFLICT (user_id) DO UPDATE
    SET email            = EXCLUDED.email,
        marketing_opt_in = EXCLUDED.marketing_opt_in
  RETURNING * INTO v_grant;

  UPDATE profiles
     SET is_premium = TRUE,
         updated_at = now()
   WHERE id = v_uid;

  RETURN v_grant;
END $$;

REVOKE ALL ON FUNCTION claim_premium(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_premium(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION claim_premium(boolean) TO authenticated;

-- The `waitlist` table from the "coming soon" modal is left in place. It holds
-- one row and nothing writes it any more; dropping it would discard the only
-- record of that signup for no benefit.

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run AFTER applying, in the same SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. The table and its RLS. Expect rowsecurity = true and one SELECT policy.
--
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'premium_grants';
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'premium_grants';
--
-- 2. Expect NO rows. Any row means a client can write the grant table directly
--    and premium is self-servable without the email being recorded.
--
--   SELECT grantee, privilege_type FROM information_schema.table_privileges
--    WHERE table_name = 'premium_grants'
--      AND grantee IN ('authenticated', 'anon')
--      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
--
-- 3. Expect exactly one row, `authenticated`. `anon` here would let a
--    logged-out caller invoke it (it would fail on auth.uid(), but it should
--    not be reachable at all).
--
--   SELECT grantee FROM information_schema.routine_privileges
--    WHERE routine_name = 'claim_premium' AND privilege_type = 'EXECUTE';
--
-- 4. Expect prosecdef = true and a pinned search_path, matching migration 009.
--
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--    WHERE proname = 'claim_premium';
--
-- 5. After somebody claims, expect their profile flag and their grant to agree:
--
--   SELECT p.username, p.is_premium, g.email, g.marketing_opt_in, g.source
--     FROM profiles p JOIN premium_grants g ON g.user_id = p.id;
-- Canonical timestamp version for legacy migration 020.
