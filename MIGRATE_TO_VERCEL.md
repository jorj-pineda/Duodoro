# Migrating Duodoro off the GCP VM → Vercel (client) + free host (server)

## Current state

Everything runs on one GCP VM: GitHub Actions builds two Docker images (client + server),
pushes them to GHCR, then SSHes into the VM and runs `docker compose up -d`. Nginx on the
VM terminates TLS and proxies to the Next.js client (port 3000) and the Socket.IO server
(port 3001).

## Target state

| Piece | Where it goes | Why |
|---|---|---|
| `client/` (Next.js) | **Vercel** (free Hobby plan) | Native Next.js host, auto-deploy on push, free TLS/CDN |
| `server/` (Express + Socket.IO) | **Render free tier** (or see alternatives) | Vercel cannot host it — see below |
| Supabase | Stays exactly where it is | Nothing changes except auth redirect URLs |

> ⚠️ **The Socket.IO server cannot move to Vercel.** Vercel functions are serverless:
> no long-lived processes, no WebSockets, and your session state lives in in-memory maps
> (`sessions`, `userSockets`) plus `setTimeout` chains in `advancePhase()`. It needs a
> host with a persistent Node process.

### Server host options (pick one)

1. **Render free tier** (recommended for $0) — supports WebSockets, deploys straight from
   the GitHub repo. Catch: free services **spin down after ~15 min of inactivity** and take
   ~30–60 s to cold-start. Since your session state is in-memory anyway (already lost on
   any restart), this mostly means "first visitor after a quiet period waits a bit."
2. **Oracle Cloud Always Free VM** — a genuinely free-forever VM (ARM). Closest to your
   current setup: reuse `docker-compose.yml` (server service only) and the deploy workflow
   with new SSH secrets. More setup work, no spin-down.
3. **Fly.io / Railway** (~$2–5/mo) — always-on, painless, but not free.

The steps below assume **Render**.

---

## Step 0 — Prep (no code changes strictly required)

- [ ] `client/next.config.ts` keeps `output: "standalone"` — Vercel ignores it and the
      Dockerfile still uses it, so leave it alone.
- [ ] The root `package.json` is vestigial; you will point Vercel's **Root Directory** at
      `client/`, so it never sees it.
- [ ] Have your current env values handy (from the GitHub repo secrets / VM `.env`):
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
      `SUPABASE_SERVICE_KEY`.

## Step 1 — Deploy the server to Render

1. https://dashboard.render.com → **New → Web Service** → connect the GitHub repo.
2. Settings:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Instance type:** Free
3. Environment variables:
   - `NODE_ENV` = `production`
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_KEY` = the service-role key
   - `ALLOWED_ORIGIN` = `https://duodoro.live` — must match the browser origin exactly:
     scheme included, no trailing slash, and `www.duodoro.live` is a *different* origin.
     The server exits at boot if the Supabase vars are missing, so a "deploy failed" here
     is usually just a missing env var.
4. Deploy, then verify: `https://<your-server>.onrender.com/health` returns `{"ok":true}`.
5. Note the URL — it becomes `NEXT_PUBLIC_SOCKET_URL`.

Render doesn't use your `server/Dockerfile` with the settings above (native Node runtime
is simpler); the Dockerfile keeps working for local/docker-compose use.

## Step 2 — Deploy the client to Vercel

1. https://vercel.com/new → import the GitHub repo.
2. **Root Directory:** `client` (critical — the repo is a two-package monorepo).
   Framework preset auto-detects Next.js; leave build/output settings default.
3. Environment variables (all three are `NEXT_PUBLIC_*`, i.e. **baked in at build time** —
   they must be set *before* the first build, and any change requires a redeploy). Three
   different URLs are in play here — don't cross the streams:
   - `NEXT_PUBLIC_SUPABASE_URL` = your **Supabase project URL**, e.g.
     `https://oiubqvsyuoemzkoujvtb.supabase.co` (Supabase Dashboard → Settings → API →
     Project URL). **Not** the Render URL — if sign-in hits
     `<something>.onrender.com/auth/v1/authorize` and 404s, this is set wrong.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon/public key from that same API settings page.
   - `NEXT_PUBLIC_SOCKET_URL` = `https://<your-server>.onrender.com` — this is the *only*
     one of the three that should ever contain the Render URL (socket.io upgrades to
     `wss://` itself; just use the https URL).
4. Deploy. Note the production URL (`https://<your-app>.vercel.app`).
5. Update `ALLOWED_ORIGIN` on Render if needed. **Where to find it:** Render Dashboard →
   click the *server* web service → **Environment** tab in the left sidebar (it is NOT
   under Settings) → pencil-edit the `ALLOWED_ORIGIN` value → **Save Changes**. Saving
   triggers an automatic redeploy; wait for it to go live before testing.
   - While `duodoro.live` still points at GCP, browsers hit the app via the
     `*.vercel.app` URL — and the server only allows the one origin you set. Either set
     `ALLOWED_ORIGIN` to the vercel.app URL temporarily and switch it to
     `https://duodoro.live` when you flip DNS (Step 6), or set it to a comma-separated
     list (`https://duodoro.live,https://<your-app>.vercel.app`) once the server supports
     that — the fix/code-health branch adds comma-list support in `server/index.js`.

Optional, avoids rebuilding the client when only `server/` changes:
Project → Settings → Git → **Ignored Build Step**:
```bash
git diff --quiet HEAD^ HEAD -- .
```
(runs inside the Root Directory, so `.` = `client/`).

## Step 3 — Update Supabase auth redirects

You already own **duodoro.live** and it's the domain you're landing on (Step 6 just points
its DNS at Vercel later) — so set Supabase to that domain now, not the temporary
`vercel.app` URL. This avoids having to come back and change it again after DNS cuts over.

Supabase Dashboard → Authentication → **URL Configuration**:

- **Site URL:** `https://duodoro.live`
- **Redirect URLs:** add
  - `https://duodoro.live/auth/callback`
  - `https://<your-app>.vercel.app/auth/callback` — keep this too, temporarily, so OAuth
    still works when you test on the raw Vercel URL *before* DNS points `duodoro.live` at
    Vercel (Step 4). Remove it once DNS has cut over and Site URL is your only domain.
    **Use your literal deployed hostname, not the project name you typed in** — if your
    desired name was taken, Vercel silently suffixes it (e.g. `duodorov.vercel.app`
    instead of `duodoro.vercel.app`). Check Vercel → Project → Settings → Domains for the
    exact value. Supabase matches redirect URLs exactly; a mismatch here doesn't error —
    it just silently falls back to redirecting to Site URL instead, so after OAuth
    completes you bounce back to whatever's running at `duodoro.live` (still the old GCP
    app until Step 6), which looks like "sign-in just didn't work."
  - keep `http://localhost:3000/auth/callback` for local dev
  - (optional) `https://*.vercel.app/auth/callback` (Supabase supports `*` wildcards in
    redirect URLs) instead of the exact hostname above, so preview deployments and any
    future renames keep working without more Supabase edits

Nothing changes in the Google / Discord developer consoles — they redirect to Supabase's
callback, which is unchanged.

## Step 4 — Verify end-to-end

- [ ] Sign in with Google and with Discord on the `*.vercel.app` URL (full redirect
      round-trip) — this is what proves the temporary redirect URL from Step 3 works
      before `duodoro.live` DNS has even moved.
- [ ] Open the browser console: no CORS / websocket errors (a CORS error here =
      `ALLOWED_ORIGIN` mismatch on Render).
- [ ] Create a session, run a short 5-min pomodoro solo; confirm the phase changes arrive
      and the completed session shows up in Stats (proves the service key works).
- [ ] Two browsers: invite flow, presence dots, synchronized timer.
- [ ] Kill the Render service manually (Manual Deploy → restart) and confirm the client
      recovers via `request_sync` reconnection.

## Step 5 — Retire the GCP deploy pipeline

- [x] Deleted `.github/workflows/deploy.yml` — Vercel and Render both auto-deploy on push
      to `main`, so the GHCR build + SSH deploy was dead weight. `Dockerfile`s and
      `docker-compose.yml` are kept for local/self-hosted use.
- [x] Deleted `nginx/` and `scripts/` — both were VM-only (nginx TLS termination + the
      VPS bootstrap script); nothing else in the repo referenced them.
- [ ] Repo secrets that are now unused — delete from GitHub repo Settings → Secrets and
      variables → Actions: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_TOKEN`, and the
      three `NEXT_PUBLIC_*` secrets (they now live in Vercel instead).
- [ ] **Delete the GCP VM / project** so nothing tries to bill you.

## Step 6 — Point duodoro.live at Vercel

Supabase is already configured for this domain (Step 3), so this step is just DNS + CORS.

1. Vercel → Project → Settings → Domains → add `duodoro.live` and follow the DNS
   instructions (move the A/CNAME records that currently point at the GCP VM to Vercel:
   apex A record → `76.76.21.21`, or CNAME → `cname.vercel-dns.com`).
2. Once DNS propagates, confirm `ALLOWED_ORIGIN` on Render (Environment tab, see Step 2.5)
   includes `https://duodoro.live` — it should already, since Step 2 set it as the primary
   value.
3. Optional cleanup: remove the `*.vercel.app` redirect URL from Supabase (Step 3) now
   that `duodoro.live` is live, and drop it from `ALLOWED_ORIGIN` on Render too if you'd
   added it there for testing.
4. Rebuild nothing — `NEXT_PUBLIC_SOCKET_URL` still points at Render, which is fine.
   (Render free doesn't do custom domains on the websocket side without a paid plan;
   the onrender.com URL is invisible to users anyway.)

## Gotchas worth knowing

- **Render cold starts:** after 15 idle minutes the free instance sleeps. First socket
  connection after that waits ~30–60 s. If it bothers you, a free uptime pinger
  (e.g. UptimeRobot hitting `/health` every 10 min) keeps it warm, or move to option 2/3.
- **In-memory sessions die on every server deploy/restart** — already true today on the
  VM, just more frequent on Render free. Users mid-session get bounced to `waiting`.
- **Preview deployments:** every Vercel preview gets a unique origin, and the server's
  CORS allows exactly one origin. Previews will render but websockets will be blocked
  unless you extend `ALLOWED_ORIGIN` handling (e.g. accept a comma-separated list or a
  `*.vercel.app` regex in `server/index.js`).
- **`NEXT_PUBLIC_*` are compile-time constants.** Changing them in Vercel does nothing
  until the next deployment.
