# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Duodoro is a collaborative pomodoro web app for long-distance couples/friends. Users sign in (Google/Discord OAuth via Supabase), create a pixel-art avatar, pick a themed "world", and run synchronized focus/break sessions together in real time. Friends, invites, presence, sticky-note tasks, and session stats are layered on top.

## Repo layout

Two independent npm packages (each with its own `package.json` and lockfile), plus infra:

- `client/` — Next.js 16 (App Router, React 19, TypeScript, Tailwind 4, framer-motion). Single-page app: `app/page.tsx` just renders `DuoTimer`.
- `server/` — Plain Node.js (CommonJS) Express + Socket.IO server. The transport/handler layer is `server/index.js`; pure session-state helpers live in `server/session.js`.
- `supabase/migrations/` — Numbered SQL migrations (`001_initial.sql` onward). These are run manually in the Supabase SQL editor, not via a migration tool. Add new ones as the next number in sequence.
- `docker-compose.yml` — local/self-hosted Docker setup (client + server, no nginx); kept for local dev, not used by the current deploy.
- The root `package.json` is vestigial — don't add dependencies there; install into `client/` or `server/`.

## Commands

Run commands inside `client/` or `server/`, not the repo root.

Client (`cd client`):
- `npm run dev` — dev server on http://localhost:3000
- `npm run build` / `npm run lint`
- `npm run test:run` — vitest once; `npm test` for watch mode
- Single test: `npx vitest run src/lib/format.test.ts`

Server (`cd server`):
- `npm start` — runs on port 3001 (or `npx nodemon index.js` for reload)
- `npm run test:run` — vitest once
- Without `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` set, the server runs in dev mode: JWT verification and all persistence are skipped. In production those vars are required (it exits otherwise).

Local dev needs both processes running. Client env: `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Server env: see `server/.env.example`.

## Architecture

### Split of responsibilities

- **Socket.IO server** (`server/index.js`) is the source of truth for live session state: phases, timers, players, presence, invites. All session state is **in-memory** (`sessions`, `userSockets` maps) — it does not survive a server restart, and nothing live is read back from the DB.
- **Supabase** handles auth (JWT), and persistence: profiles, friendships, tasks/sticky notes, and *completed* session history (`sessions` + `session_participants` rows written by the server with the service-role key, bypassing RLS). The client talks to Supabase directly (anon key + RLS) for friends, tasks, and stats.
- **Client** never trusts its own clock for the timer: the server broadcasts `phase_change` with `phaseStartTime` and durations; the client renders countdowns from `Date.now() - phaseStartTime`.

### Server session lifecycle

Sessions are keyed by UUID. Phase state machine driven by `setTimeout` chains in `advancePhase()`:
`waiting → focus → celebration (4s) → break → returning (3.5s) → focus → …`

Two timer modes: `pomodoro` (fixed durations, server auto-advances) and `flow` (open-ended focus; client emits `finish_flow_focus`, break is computed as ~1/5 of elapsed focus). Focus is recorded to the DB when a focus phase completes or is stopped/abandoned early (`recordSession`, with `completed` flag).

A dropped socket doesn't eject its player immediately: authenticated players keep their slot for a reconnect grace window (`RECONNECT_GRACE_MS`, default 60 s), and `join_session` from the same `userId` re-keys the existing slot to the new socket instead of duplicating the player. The client mirrors the active session id into `sessionStorage` and auto-rejoins after a page reload.

Security conventions in the socket layer (preserve these when adding events):
- `io.use()` middleware verifies the Supabase JWT and sets `socket.userId` — **never trust a client-sent userId**.
- Every inbound payload is validated/sanitized (`sanitizeAvatar`, `VALID_WORLDS`, name length caps, duration clamps `MAX_FOCUS`/`MAX_BREAK`).
- Mutating events check the socket is actually a player in the session; create/join/invite are rate-limited per socket.

Pets are part of session state, not just local UI: `set_pet` updates the player's slot server-side (sanitized against `VALID_PETS`) and relays `pet_changed` to the other player, so both sides see the same companion.

Note: `server/session.js` holds the pure session-state helpers (`createSessionState`, `addPlayer`, `removePlayer`, `setPlayerPet`, `findPlayerByUserId`, `markPlayerDisconnected`, `sessionParticipantIds`, `buildSyncPayload`); `index.js` imports them and `session.test.js` covers them. Put new pure session logic there, not inline in `index.js`.

### Client structure

`DuoTimer.tsx` is the top-level orchestrator: it composes two hooks and switches screens on `appStep` (`loading → landing → avatar → home → game`, defined in `lib/sessionTypes.ts`).

- `hooks/useAuth.ts` — Supabase auth, profile load/save, drives `appStep`.
- `hooks/useGameSession.ts` — owns the Socket.IO connection (auth token in handshake, retries on token expiry), all session/phase/player state, invites, resume-after-tab-sleep resync (`request_sync`), and the `sessionStorage` mirror that drives rejoin-after-reload. This is the file to touch for any realtime behavior. It also exposes `connectionState`, which `ConnectionBanner` renders as a "reconnecting / connection lost" banner while you're in a session.
- `lib/supabase.ts` — browser Supabase singleton (PKCE flow, localStorage sessions — deliberately not cookie/SSR-based; `app/auth/callback/route.ts` exists for the OAuth redirect).
- Direct-to-Supabase data hooks: `useFriendsList`, `useFriendSearch`, `useTasks`, `useStickyNotes`, `lib/useStats.ts`. `useOnlineFriends` is a hybrid — the friend list comes from Supabase, the online/offline dots from the socket (`get_online_friends` + `presence_update`).
- Visuals: `GameWorld` renders the session scene; `PixelCharacter`/`PetCharacter`/`WorldDecorations` are hand-drawn SVG/CSS pixel art driven by `lib/avatarData.ts` (avatar options here must stay in sync with the server's `sanitizeAvatar` whitelist and `VALID_WORLDS`).

### Database conventions

- `profiles` extends `auth.users`; usernames use Discord-style `username#discriminator` tags via the `claim_username` RPC (one-time change enforced in SQL, migration 005).
- Live presence is mirrored into `profiles.current_session_id` / `current_world_id` by the server so friends can see "in a session" from the client's Supabase queries.
- RLS is on for all tables; the server's service-role key is what allows it to write session history and presence. Later migrations (004, 007, 009) tightened RLS and pinned function search paths — follow that pattern in new SQL.
- RLS gates which *rows* a client may write, never which *columns*. Anything privileged (`is_premium`, `username`, presence fields) is protected by column privileges instead — migration 010 revokes table-level UPDATE from `authenticated`/`anon` and grants back only the client-writable columns. A table-level UPDATE grant silently outranks column grants, so never re-grant one. Privileged writes go through `SECURITY DEFINER` RPCs or the service key.

## Deployment

Push to `main` auto-deploys both halves independently — each host watches the repo itself,
there is no deploy workflow in this repo:
- **Client** (`client/`) → Vercel. `NEXT_PUBLIC_*` env vars are set in the Vercel project
  and baked in at build time — changing one requires a redeploy, not just an env edit.
- **Server** (`server/`) → Render (Node web service). `ALLOWED_ORIGIN` (comma-separated
  for multiple origins), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` are set in Render's
  Environment tab; the server exits at boot if the Supabase vars are missing.

CI is separate from deploys: `.github/workflows/ci.yml` runs on PRs and pushes to `main` —
server tests, then client `tsc --noEmit` + tests + `next build` (with dummy `NEXT_PUBLIC_*`
values, since they're inlined at build time). There is deliberately **no lint job**:
`npm run lint` currently reports ~28 pre-existing violations, so a blocking job would fail
every PR and an advisory/`|| true` one would hide the signal. Burn the violations down
first, then add a blocking lint job — don't add a soft one in the meantime.

See `MIGRATE_TO_VERCEL.md` for the full migration history and gotchas. The old GCP VM /
Docker-Compose/Nginx/GHCR pipeline has been retired.
