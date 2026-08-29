# Duodoro

A real-time focus timer for long-distance couples and friends.

Live: [duodoro.live](https://duodoro.live)

Sign in with Google or Discord, draw a pixel-art avatar, and run a
synchronised pomodoro (or open-ended flow) with someone in the same session.
You walk toward each other during focus, meet in the middle, and take the
break in whichever world the clock is on.

## How long this has been going

The git history starts on **26 February 2026** (`Initial commit of existing
project`). As of August 2026 that is a little under six months of recorded
work.

## What it is today

- **Two people, one timer.** The Socket.IO server owns the phase clock. The
  client never trusts its own `Date.now()` for the countdown.
- **Worlds rotate.** There is no picker. New sessions land in whichever of
  the eight worlds the UTC clock is on (hourly, on the :30). A session keeps
  the world it started in.
- **Companions grow with focus.** Free companion access unlocks a pet whose
  size is derived from completed focus time (young at the start, grown after 3
  hours, full after 15), not stored as its own column.
- **Companion access is currently free** with an OAuth-confirmed account email.
  Marketing email is a separate, optional choice. There is no world unlock,
  because nobody picks a world.
- Friends, invites, sticky-note tasks, and session stats sit on top.

## Stack

Two npm packages, plus Supabase:

| | |
|---|---|
| `client/` | Next.js 16, React 19, Tailwind 4. Deploys to Vercel. |
| `server/` | Express + Socket.IO (plain Node, CommonJS). Deploys to Render. |
| `supabase/migrations/` | Timestamped SQL, rebuilt and contract-tested by the Supabase CLI in CI. |

Auth and persistence (profiles, friends, tasks, completed session history)
are Supabase. Live session state is in-memory on the server and dies with
the process.

## Local development

You need both processes.

**Server** (`server/`):

```bash
cp .env.example .env   # then fill in, or leave Supabase blank for dev mode
npm install
npm start              # port 3001
```

Without `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` the server skips JWT
verification and persistence. That is fine for local timer work; it is not
how production runs.

**Client** (`client/`):

```bash
# .env.local
# NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
npm install
npm run dev            # http://localhost:3000
```

Tests: `npm run test:run` inside `client/` or `server/`. Lint and `tsc`
live in `client/`.

Database work uses Docker and Supabase CLI 2.116.0. From the repository root,
`supabase start`, `supabase db reset --local --no-seed`, and
`supabase test db` rebuild and verify the PostgreSQL 17 schema. See
[`docs/DATABASE_WORKFLOW.md`](docs/DATABASE_WORKFLOW.md) before creating or
deploying a migration.

`docker-compose.yml` is a leftover local/self-hosted setup (no nginx). The
live site is Vercel + Render, not that file.

## Deploy

Push to `main` deploys both halves. There is no deploy workflow in this
repo — each host watches the repo itself.

CI (`.github/workflows/ci.yml`) runs server tests, then client typecheck,
lint, tests, and `next build`.
