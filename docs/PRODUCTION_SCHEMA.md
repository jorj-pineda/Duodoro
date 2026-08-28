# Production schema record

This file records production schema facts that were actually inspected. It is
not a replacement for Supabase migration history or the release checklist.

## 2026-08-27 — atomic focus recording

Migration `20260828021445_atomic_focus_recording.sql` (legacy sequence 022)
was applied to the Duodoro
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

## 2026-08-28 — migration history reconciled

The 22-file chain was renamed to canonical timestamp versions and rebuilt twice
from an empty local Supabase PostgreSQL 17 database. Supabase schema lint passed,
and the pgTAP contract reported 37 passing assertions. A read-only production
contract check then confirmed PostgreSQL 17.6 and the same tables, columns,
indexes, RLS policy set, realtime publication, signup trigger, world constraint,
and privileged-function execution boundaries.

Production already recorded migrations 007–015 and 022 under timestamps. The
following schema-present but untracked legacy versions were added to migration
metadata without executing their SQL or changing application/user rows:

`20260226231035`, `20260301005324`, `20260301010944`, `20260302222304`,
`20260313212753`, `20260315223924`, `20260809045643`, `20260811155613`,
`20260811155614`, `20260812220106`, `20260814194352`, and `20260820002800`.

Each repair row has `created_by = duodoro_schema_contract_repair_20260828` and
a single explanatory marker in `statements`. The final production migration
list contains exactly the same 22 versions as the repository. The repair is
reversible independently of schema changes by deleting only rows with that
exact `created_by` value, but doing so deliberately restores history drift and
must not be part of an ordinary rollback.

From this point forward, use `docs/DATABASE_WORKFLOW.md`. Do not apply schema
changes through the Dashboard or bypass a mismatch with `db push --include-all`.

## Remaining runtime verification

Use two designated test accounts to complete one production focus round and
confirm exactly one session plus both participant links appear in history.
That authenticated check remains open in `docs/RELEASE_CHECKLIST.md`; no real
user rows were created or altered merely to mark this deployment complete.
