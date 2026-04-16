-- ─────────────────────────────────────────────────────────────────────────────
-- Pin search_path on SECURITY DEFINER functions
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Fixes Supabase linter warning `function_search_path_mutable` (lint 0011):
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
--
-- A SECURITY DEFINER function with a mutable search_path can be exploited by a
-- caller who sets `search_path` before invoking the function, potentially
-- causing it to resolve unqualified names (e.g., `profiles`) to a malicious
-- schema they control. Pinning the search_path on the function removes that
-- attack surface.
--
-- `public, pg_temp` is used so that existing unqualified references to
-- `profiles` and `generate_discriminator` continue to resolve. `pg_temp` at
-- the end prevents temp-schema shadowing of unqualified built-ins.

ALTER FUNCTION public.claim_username(text)         SET search_path = public, pg_temp;
ALTER FUNCTION public.change_display_name(text)    SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_discriminator(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()            SET search_path = public, pg_temp;
