# Production schema record

This file records production schema facts that were actually inspected. It is
not a replacement for Supabase migration history or the release checklist.

## 2026-08-27 — atomic focus recording

Migration `022_atomic_focus_recording.sql` was applied to the Duodoro
production project through the Supabase migration API and recorded remotely as
`20260828021445_atomic_focus_recording`.

Post-deploy inspection confirmed:

- `public.sessions.recording_key` is a nullable `uuid`;
- `sessions_recording_key_unique` is a partial unique index over non-null keys;
- `public.record_focus_session(...)` is `SECURITY INVOKER`;
- the function has an explicitly empty `search_path`; and
- only `postgres` and `service_role` hold `EXECUTE`.

The Supabase security and performance advisors were run after deployment. They
did not identify the new function or index. They did report older warnings
around callable definer functions, RLS initialization plans, and foreign-key
index coverage; those need to be assessed in the reproducible-migrations work
rather than being silently bundled into this deployment.

## Known migration-history drift

The production migration-history table does not contain a complete one-to-one
record of the numbered files in `supabase/migrations/`. Several older changes
were applied manually through the SQL editor, so schema presence and migration
history are currently different sources of truth. Do not run a blind remote
`db push` until that history has been reconciled and the full chain has passed
against a disposable Postgres 17 database.

## Remaining runtime verification

Use two designated test accounts to complete one production focus round and
confirm exactly one session plus both participant links appear in history.
That authenticated check remains open in `docs/RELEASE_CHECKLIST.md`; no real
user rows were created or altered merely to mark this deployment complete.
