"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { storePendingShareInvite } from "@/lib/shareInvite";

export default function JoinInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!storePendingShareInvite(params.token)) {
      // This state intentionally follows URL validation performed in an
      // effect; no server-rendered markup depends on browser storage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInvalid(true);
      return;
    }
    router.replace("/");
  }, [params.token, router]);

  return (
    <main className="min-h-dvh bg-bg texture-dots flex items-center justify-center p-6">
      <div className="hud-card bg-surface border-2 border-line border-b-4 p-8 text-center max-w-sm">
        <h1 className="font-display text-2xl text-ink tracking-wide">
          {invalid ? "Invalid invite" : "Opening your invite…"}
        </h1>
        <p className="text-muted text-sm mt-3">
          {invalid
            ? "This invite link is malformed. Ask your partner for a new one."
            : "We’ll bring you into the focus room after sign-in."}
        </p>
        {invalid && (
          <Link
            href="/"
            className="inline-block mt-5 text-accent font-bold hover:underline"
          >
            Go to Duodoro
          </Link>
        )}
      </div>
    </main>
  );
}
