import { NextRequest, NextResponse } from "next/server";

// This route receives the OAuth code from the provider and passes it to the
// browser so the client-side Supabase (with detectSessionInUrl + flowType:pkce)
// can exchange it for a session itself, storing the token in localStorage.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    return NextResponse.redirect(`${origin}${next}?code=${code}`);
  }

  return NextResponse.redirect(`${origin}/`);
}
