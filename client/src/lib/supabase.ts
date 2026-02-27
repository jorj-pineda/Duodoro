import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-side Supabase client (singleton)
// Uses localStorage for session storage (not cookies) — avoids SSR cookie handoff issues.
// detectSessionInUrl: true + flowType: pkce lets the client exchange the OAuth code itself.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        flowType: "pkce",
      },
    });
  }
  return _client;
}

export async function signInWithProvider(provider: "google" | "discord") {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
