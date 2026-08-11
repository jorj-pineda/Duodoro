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

- **Socket.IO server** (`server/index.js`) is the source of truth for live session state: phases, timers, players, presence, invites. All session state is **in-memory** (the `sessions` map plus the presence registry in `server/presence.js`) — it does not survive a server restart, and nothing live is read back from the DB.
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
- Knowing a session id is not permission to use it: `join_session` requires an existing slot, an invite, or friendship with someone already in the session, and `send_invite` is friends-only. Server-side ids are read from `socketToSession`, never taken from the payload.

Pets are part of session state, not just local UI: `set_pet` updates the player's slot server-side (sanitized against `VALID_PETS`) and relays `pet_changed` to the other player, so both sides see the same companion.

Note: `server/session.js` holds the pure session-state helpers (`createSessionState`, `addPlayer`, `removePlayer`, `setPlayerPet`, `findPlayerByUserId`, `markPlayerDisconnected`, `sessionParticipantIds`, `buildSyncPayload`); `index.js` imports them and `session.test.js` covers them. Put new pure session logic there, not inline in `index.js`.

### Client structure

`DuoTimer.tsx` is the top-level orchestrator: it composes two hooks and switches screens on `appStep` (`loading → landing → avatar → home → game`, defined in `lib/sessionTypes.ts`).

- `hooks/useAuth.ts` — Supabase auth, profile load/save, drives `appStep`.
- `hooks/useGameSession.ts` — owns the Socket.IO connection (auth token in handshake, retries on token expiry), all session/phase/player state, invites, resume-after-tab-sleep resync (`request_sync`), and the `sessionStorage` mirror that drives rejoin-after-reload. This is the file to touch for any realtime behavior. It also exposes `connectionState`, which `ConnectionBanner` renders as a "reconnecting / connection lost" banner while you're in a session.
- `lib/supabase.ts` — browser Supabase singleton (PKCE flow, localStorage sessions — deliberately not cookie/SSR-based; `app/auth/callback/route.ts` exists for the OAuth redirect).
- Direct-to-Supabase data hooks: `useFriendsList`, `useFriendSearch`, `useTasks`, `useStickyNotes`, `lib/useStats.ts`. In these, **check `error` on reads as well as writes** — `if (data) setX(data)` leaves the list at its old value and renders the empty state, which makes a hard failure indistinguishable from "you have nothing yet". That is exactly how the `42P17` outage fixed in migration 018 hid: every task read was erroring and the UI said "No tasks yet". Likewise, RLS refusing an UPDATE or DELETE is not an error — it matches zero rows — so those need `.select()` and a row-count check.
- **An empty result and a failed request must never render the same way.** Zeros and "nothing here yet" are claims about the user's data; making them on a failed fetch tells someone their history is gone. Where a hook can return legitimately-empty data, expose a *loaded* flag alongside `error` — `useStats` does — and gate the empty state on it, because `personalStats === null` covers both "new account" and "never loaded". `StatsErrorState` is the shared "couldn't load, nothing was lost, retry" panel.
- `useOnlineFriends` is a hybrid — the friend list comes from Supabase, the online/offline dots from the socket (`get_online_friends` + `presence_update`).
- `public/sw.js` caches **nothing about the app** — only `/offline.html`, served as a fallback for failed *navigations*. Timer state is server-authoritative, so a stale socket.io or Supabase reply is worse than no reply; the fetch handler returns early for anything that isn't a navigation. Keep it that way. `offline.html` is standalone by necessity (no network means no hashed CSS bundle, no Google Fonts), so its theme tokens are a copy of `globals.css` — update both together.
- `lib/sounds.ts` owns audio *and* the mute flag. The flag is a module-level variable with its own listener set, not React state, because `playSound` is called from `useGameSession`'s socket handlers — outside the component tree, sometimes while nothing is mounted. `useSound` subscribes to it via `useSyncExternalStore`, so any number of `SoundToggle`s stay in agreement. Add new sounds to `FILES`; don't add a second playback path that bypasses the mute check.
- Visuals: `GameWorld` renders the session scene; `PixelCharacter`/`PetCharacter`/`WorldDecorations` are hand-drawn SVG/CSS pixel art driven by `lib/avatarData.ts`. Note what the server actually validates: `sanitizeAvatar` whitelists `hairStyle` and `eyeStyle`, but checks colours with a plain `/^#[0-9a-fA-F]{6}$/` regex — so recolouring the palette is client-only, while adding a *style* also needs `VALID_HAIR_STYLES`/`VALID_EYE_STYLES`, and adding a *world* needs both `VALID_WORLDS` and the SQL `sessions_world_check` (migration 008).

### Mobile / viewport conventions

The game screen is a fixed app shell (`h-dvh` + `overflow-hidden`) with an internal scroll region, so layout mistakes there strand controls off-screen with no gesture to reach them rather than just looking cramped.

- **Use `dvh`, never `vh`/`h-screen`.** On iOS Safari `100vh` is the *large* viewport — the height the page would have with the toolbar hidden — so a `vh`-sized shell is taller than what's visible, and anything at the bottom of an inner scroll region falls below the fold inside an `overflow-hidden` parent.
- `layout.tsx` sets `viewportFit: "cover"`, so any element flush to a screen edge must account for `env(safe-area-inset-*)`. **Fold the inset into the element's existing padding** (`pt-[calc(0.625rem+env(safe-area-inset-top))]`) rather than adding a `.pt-safe` helper class — a plain CSS class declaring `padding-top` lands later in the cascade than Tailwind's `py-*` and replaces it instead of adding to it.
- **Landscape phones need height queries, not width breakpoints.** A landscape phone is *wide*, so `sm:` fires exactly when vertical space has run out and makes things bigger. `globals.css` keys the HUD's compact form off `max-height: 520px`.
- Overlay panels go `inset-x-2 sm:inset-x-auto` + `w-full sm:w-80` — `FriendsPanel`, `StatsPanel` and `StickyNote` all follow this; a bare `w-80` is 320px of a 360px screen.
- Touch targets follow the `w-11 h-11 sm:w-7 sm:h-7` / `px-4 py-2.5 sm:px-0 sm:py-0` pattern already in `Button` and `AvatarCreator`.
- Still outstanding: `GameWorld` has no responsive sprite scaling — characters are the same fixed CSS px on a 360px phone as on a desktop. That wants a single canonical pixel unit first (see the art notes), since scaling sprites by non-integer factors is what makes pixel art blur.

### Database conventions

- `profiles` extends `auth.users`; usernames use Discord-style `username#discriminator` tags via the `claim_username` RPC (one-time change enforced in SQL, migration 005).
- Live presence is mirrored into `profiles.current_session_id` / `current_world_id` by the server so friends can see "in a session" from the client's Supabase queries. Because only the service key can write those columns (migration 010), they're trusted as proof of where a user is — migration 013's `tasks_read` policy relies on that.
- Socket presence is tracked per *user* with a set of sockets (`server/presence.js`), not one socket per user: extra tabs must not evict each other, and a user only counts as offline once their last socket closes.
- The DB mirror follows the same rule: leaving a session refreshes `profiles.current_session_id` to whichever session the user is *still* in (`refreshPresence`), and only clears it when they're in none. The server also sweeps stale presence on boot and drains it on SIGTERM — in-memory sessions die with the process but that column doesn't, and a stale value both shows friends a dead "Join" button and wrongly satisfies migration 013's `tasks_read`.
- RLS is on for all tables; the server's service-role key is what allows it to write session history and presence. Later migrations (004, 007, 009) tightened RLS and pinned function search paths — follow that pattern in new SQL.
- RLS gates which *rows* a client may write, never which *columns*. Anything privileged (`is_premium`, `username`, presence fields) is protected by column privileges instead — migration 010 revokes table-level UPDATE from `authenticated`/`anon` and grants back only the client-writable columns. A table-level UPDATE grant silently outranks column grants, so never re-grant one. Privileged writes go through `SECURITY DEFINER` RPCs or the service key.
- **Never let a policy's `USING`/`WITH CHECK` reference its own table.** Postgres applies RLS to the subquery too, re-expands the policy, and raises `42P17 infinite recursion detected in policy` at *rewrite* time — so the surrounding `OR` never short-circuits it and every statement touching the table fails regardless of the rows involved. `sp_read_own` (002) did this and took the whole `tasks` feature down with it, because `tasks_read` probes `session_participants`; migration 018 moves the membership check into the `SECURITY DEFINER` helper `is_session_participant()`, which runs as the owner and so isn't subject to RLS. Any new policy that needs to ask "is the caller a member of X" must go through a definer function, not a self-join.
- A policy can't express "you may change this column and no other": `WITH CHECK` sees only the new row, so it can't assert the rest of it stayed put. When two people need write access to *part* of a row, use a `SECURITY DEFINER` RPC that writes just that column — `toggle_shared_task` (017) is the pattern: either partner may flip `is_done` on a shared goal, while `content` edits and deletes stay owner-only via ordinary policies.
- Postgres is not the only place a permission check lives. A client that renders an action the database will refuse is a bug even when the refusal is correct — `StickyNote` drew a ✕ on notes only the owner can delete for as long as the feature existed.

## Deployment

Push to `main` auto-deploys both halves independently — each host watches the repo itself,
there is no deploy workflow in this repo:
- **Client** (`client/`) → Vercel. `NEXT_PUBLIC_*` env vars are set in the Vercel project
  and baked in at build time — changing one requires a redeploy, not just an env edit.
- **Server** (`server/`) → Render (Node web service). `ALLOWED_ORIGIN` (comma-separated
  for multiple origins), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` are set in Render's
  Environment tab; the server exits at boot if the Supabase vars are missing.

CI is separate from deploys: `.github/workflows/ci.yml` runs on PRs and pushes to `main` —
server tests, then client `tsc --noEmit` + **blocking** `npm run lint` + tests +
`next build` (with dummy `NEXT_PUBLIC_*` values, since they're inlined at build time).
Lint is at zero violations and the job is hard-failing; keep it that way rather than
adding suppressions in bulk.

See `MIGRATE_TO_VERCEL.md` for the full migration history and gotchas. The old GCP VM /
Docker-Compose/Nginx/GHCR pipeline has been retired.

## How work gets done here

The repo owner has settled on these; follow them without being asked.

- **Never commit to `main`.** Every change goes on a feature branch, then a PR. `main` is
  auto-deployed, so a commit there is a production deploy.
- **Many small commits, not one big one.** Each commit should be one coherent change with a
  message explaining *why*, not what. A PR of 4–8 focused commits is the target shape; PR
  size itself stays moderate.
- **Merge with `--rebase`, never `--squash`.** Squashing collapses the whole PR into one
  commit on `main` and throws away exactly the granular history the small commits existed
  for.
- **A/B every fix.** A test for a bug must *fail against the previous commit* and pass with
  the fix — and say so in the PR. Tests that pass both ways are guards; label them as such
  rather than presenting them as evidence. For SQL, run the whole migration chain against
  Postgres 17 in Docker and show the before/after output.
- **Report honestly.** State what was not verified. Nothing in this repo has been
  browser-tested by an agent; say so rather than implying it works.
- **Verify claims before acting on them.** Findings handed over from an audit or a previous
  session are frequently wrong on specifics. Three reported sprite defects (eye centring,
  duplicate `long` hair, palm misalignment) turned out not to exist on inspection. Check
  the source, then fix.

`ROADMAP.local.md` in the repo root is the prioritised backlog — gitignored via
`*.local.md`, so it is local-only and safe to edit freely. It carries file:line references,
a corrections section for debunked findings, and the recommended order of work. Read it
before proposing what to do next, and tick items off as they ship.

## Pixel art conventions

The art is generated at runtime — there are no image assets. `client/public/` holds six
SVGs, five of which are untouched Next.js starter files.

- `PixelSprite` (string map + palette → merged `<rect>`s, `shapeRendering: crispEdges`) is
  the right primitive. `PixelCharacter` and `PetCharacter` do **not** use it — they are ~90
  hand-placed `<rect x= y=>` elements, which is why they can't be palette-swapped,
  outlined or given a blink frame without editing coordinates by hand.
- **`PixelSprite` fails silently in three ways**, all covered by `lib/uiSprites.test.ts`:
  a short row is padded rather than rejected (the viewBox takes the *longest* row), a
  character with no palette entry is skipped, and two palette keys with the same colour
  render as one shape. The last was a real bug — the coffee cup's handle.
- **SVG clips out-of-bounds geometry without warning.** The cat and rabbit shipped with a
  leg drawn at row 10 inside a 10-row viewBox and simply never drew it. Rect counts don't
  catch this; comparing geometry to the declared viewBox does —
  `components/PetCharacter.test.tsx`. All four pets now share one 11-row grid.
- **Never rotate or non-integer-scale pixel art.** It resamples hard edges into grey
  fringe, which is why sprites look blurry despite `crispEdges`. `globals.css` still has
  ±1° rotations and fractional `scaleY` on the character keyframes — outstanding work, see
  the roadmap.
- To review sprite changes without a browser, render the component in jsdom and dump the
  SVG to a static HTML page — that is how the pet fix was reviewed. Screenshots and visual
  judgement still need the repo owner; say so instead of guessing.
