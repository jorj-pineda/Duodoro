# Deployment Guide — Self-Hosted VPS

## Architecture

```
Internet → [Nginx :80/:443]
              ├── /              → Next.js (:3000)  ─┐
              ├── /socket.io/*   → Express  (:3001)  ├── Docker containers
              └── /.well-known/* → Certbot           │
```

Both app services run as Docker containers on a single VPS. Nginx handles SSL termination and reverse proxying. Supabase remains a managed cloud service.

---

## Prerequisites

- A VPS (Hetzner CX22 ~$4.50/mo or DigitalOcean $6/mo, Ubuntu 24.04 LTS)
- A domain name pointed at the VPS IP (A record)
- Supabase project (already set up)
- GitHub repo: `https://github.com/jorj-pineda/Duodoro.git`

---

## Step 0: Run Supabase Migrations

Run these in your Supabase dashboard **SQL Editor**, one at a time, in order:

| # | File | Creates |
|---|------|---------|
| 1 | `supabase/migrations/001_initial.sql` | `profiles`, `friendships`, `tasks`, `waitlist` + RLS |
| 2 | `supabase/migrations/002_sessions.sql` | `sessions`, `session_participants` + RLS |
| 3 | `supabase/migrations/003_worlds_and_sessions.sql` | Adds `current_session_id`, `current_world_id` to profiles |
| 4 | `supabase/migrations/004_tighten_session_rls.sql` | Drops permissive INSERT policies (server-only writes) |

After running all migrations, add your production URL (`https://yourdomain.com`) to **Authentication > URL Configuration > Redirect URLs** in Supabase.

---

## Step 1: Provision the VPS

1. Create an Ubuntu 24.04 VPS and note the IP address.
2. Point your domain's A record to the VPS IP.
3. SSH in as root:
   ```bash
   ssh root@your-vps-ip
   ```
4. Run the setup script:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/jorj-pineda/Duodoro/main/scripts/setup-vps.sh -o setup.sh
   sudo bash setup.sh yourdomain.com your-email@example.com
   ```
   This installs Docker, Nginx, Certbot, obtains SSL, creates a `deploy` user, and clones the repo to `/opt/duodoro`.

---

## Step 2: Configure Environment

Create the production `.env` file on the VPS:

```bash
nano /opt/duodoro/.env
```

Use `.env.production.example` as a template:

```env
ALLOWED_ORIGIN=https://yourdomain.com
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

---

## Step 3: Build and Start

```bash
cd /opt/duodoro
docker compose up -d --build
```

First build takes a few minutes. After that, visit `https://yourdomain.com`.

---

## Step 4: Set Up CI/CD (GitHub Actions)

The repo includes `.github/workflows/deploy.yml` which auto-deploys on push to `main`.

Add these secrets in your GitHub repo (Settings > Secrets and variables > Actions):

| Secret | Value |
|--------|-------|
| `VPS_HOST` | Your VPS IP or domain |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | SSH private key (generate with `ssh-keygen -t ed25519`) |

To set up the SSH key:
```bash
# On your local machine:
ssh-keygen -t ed25519 -f ~/.ssh/duodoro-deploy -N ""

# Copy the public key to the VPS:
ssh-copy-id -i ~/.ssh/duodoro-deploy.pub deploy@your-vps-ip

# Copy the private key contents — paste this into the VPS_SSH_KEY GitHub secret:
cat ~/.ssh/duodoro-deploy
```

Now every push to `main` will automatically deploy.

---

## Common Commands

```bash
# View logs
docker compose logs -f client    # Next.js logs
docker compose logs -f server    # Express logs
docker compose logs --since 1h   # Last hour, all services

# Restart services
docker compose restart server    # Restart just the server
docker compose up -d --build     # Rebuild and restart everything

# Check health
curl https://yourdomain.com/api/health

# Manual SSL renewal (auto-renews via systemd, this is a fallback)
sudo bash /opt/duodoro/scripts/renew-certs.sh

# Check container status
docker compose ps
```

---

## Troubleshooting

- **CORS errors**: Verify `ALLOWED_ORIGIN` in `.env` matches your domain exactly (no trailing slash).
- **WebSocket falling back to polling**: Check Nginx config has `Upgrade` and `Connection` headers in the `/socket.io/` block. Check browser DevTools Network tab for `ws://` vs `http://` connections.
- **SSL certificate issues**: Run `sudo certbot renew --dry-run` to test renewal. Check `/etc/letsencrypt/live/yourdomain.com/` exists.
- **Container won't start**: Check `docker compose logs <service>` for errors. Common causes: missing env vars, port conflicts.
- **Sessions not recording**: Check server logs for "Supabase not configured". Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in `.env`.
- **Auth redirect issues**: Add `https://yourdomain.com` to Supabase Auth redirect URLs.
- **Out of memory during build**: Ensure VPS has at least 4GB RAM, or add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.
