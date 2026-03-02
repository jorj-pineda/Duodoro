# Deployment Guide

## Prerequisites

- GitHub repo pushed: `https://github.com/jorj-pineda/Duodoro.git`
- Supabase project (already set up)
- Vercel account (free tier)
- Render account (free tier)

---

## Step 0: Run Supabase Migrations

Before deploying, the database schema must be set up. Run these migrations **in order** in your Supabase dashboard:

1. Go to your Supabase project > **SQL Editor**.
2. Paste and run each migration file one at a time, in order:

  | #   | File                                              | Creates                                                                          |
  | --- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
  | 1   | `supabase/migrations/001_initial.sql`             | `profiles`, `friendships`, `tasks`, `waitlist` tables + RLS policies             |
  | 2   | `supabase/migrations/002_sessions.sql`            | `sessions`, `session_participants` tables + RLS policies                         |
  | 3   | `supabase/migrations/003_worlds_and_sessions.sql` | Adds `current_session_id`, `current_world_id` to profiles; `session_id` to tasks |
  | 4   | `supabase/migrations/004_tighten_session_rls.sql` | Removes permissive INSERT policies on sessions tables (server-only writes) |

3. After running all migrations, verify in **Table Editor** that all tables exist and RLS is enabled (lock icon on each table).
4. Under **Authentication > URL Configuration**, add your production URL to **Redirect URLs** (e.g. `https://duodoro.vercel.app/`**).

---

## Step 1: Deploy the Client (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **"Add New Project"** and import the `jorj-pineda/Duodoro` repo.
3. In the project configuration:
  - **Root Directory**: Set to `client`
  - **Framework Preset**: Next.js (auto-detected)
4. Add these **Environment Variables**:

  | Variable                        | Value                                                                                 |
  | ------------------------------- | ------------------------------------------------------------------------------------- |
  | `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL (e.g. `https://xxx.supabase.co`)                            |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key                                                         |
  |                                 | Your Render server URL (add after Step 2, e.g. `https://duodoro-server.onrender.com`) |

5. Click **Deploy**. Vercel will build and host the Next.js app.
6. Note your deployment URL (e.g. `https://duodoro.vercel.app`).

---

## Step 2: Deploy the Server (Render)

1. Go to [render.com](https://render.com) and sign in.
2. Click **"New" > "Web Service"** and connect the `jorj-pineda/Duodoro` repo.
3. In the service configuration:
  - **Name**: `duodoro-server`
  - **Root Directory**: `server`
  - **Runtime**: Node
  - **Build Command**: `npm install`
  - **Start Command**: `node index.js`
4. Add these **Environment Variables**:

  | Variable               | Value                                               |
  | ---------------------- | --------------------------------------------------- |
  | `PORT`                 | `10000` (Render's default)                          |
  | `ALLOWED_ORIGIN`       | Your Vercel URL (e.g. `https://duodoro.vercel.app`) |
  | `SUPABASE_URL`         | Your Supabase project URL                           |
  | `SUPABASE_SERVICE_KEY` | Your Supabase **service role** key                  |

5. Click **Create Web Service**. Render will build and start the server.
6. Note your server URL (e.g. `https://duodoro-server.onrender.com`).

---

## Step 3: Connect Client to Server

1. Go back to your Vercel project dashboard.
2. Go to **Settings > Environment Variables**.
3. Set `NEXT_PUBLIC_SOCKET_URL` to your Render server URL (e.g. `https://duodoro-server.onrender.com`).
4. Trigger a **redeploy** from the Vercel dashboard (Deployments > Redeploy).

---

## Step 4: Verify

1. Open your Vercel URL in a browser.
2. Sign in with your auth provider.
3. Check that the home dashboard loads.
4. Open a second browser/incognito window, sign in as a different user.
5. Test:
  - Friend request and acceptance
  - "Friends Online" showing up on the dashboard
  - Creating a session and inviting a friend
  - The invite popup appearing on the friend's screen
  - Focus timer running and completing

---

## Pre-Deploy Checklist

- All 4 Supabase migrations run in order (Step 0)
- Supabase redirect URL added for production domain
- `NEXT_PUBLIC_SOCKET_URL` set to Render server URL on Vercel
- `ALLOWED_ORIGIN` set to Vercel URL on Render (no trailing slash)
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set on Render
- `npm run build` passes locally in `client/`
- Sound files (`.mp3`) added to `client/public/sounds/` (optional — app works without them)

## Supabase Notes

- Your Supabase project is already cloud-hosted, no changes needed.
- Make sure RLS policies are in place (they were set up in migrations).
- The Supabase URL and keys are the same ones you use locally.
- The server uses the **service role key** (not the anon key) to bypass RLS for session recording.

## Troubleshooting

- **CORS errors**: Make sure `ALLOWED_ORIGIN` on Render matches your Vercel URL exactly (no trailing slash).
- **Socket not connecting**: Check that `NEXT_PUBLIC_SOCKET_URL` is set correctly and the Render service is running.
- **Render free tier cold starts**: The first request after inactivity may take ~30s. This is normal on the free tier.
- **Auth redirect issues**: Add your Vercel URL to the allowed redirect URLs in your Supabase project dashboard under Authentication > URL Configuration.
- **Sessions not recording**: Check that `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set on Render. Server logs will show "Supabase not configured — session recording disabled" if missing.

