"use client";
import { useCallback, useSyncExternalStore } from "react";
import { isMuted, setMuted, subscribeMuted } from "@/lib/sounds";

// Mirrors useTheme's shape. The store lives in lib/sounds.ts rather than here
// because playSound is called from useGameSession's socket handlers, which run
// outside React's tree — so the flag has to be readable without a hook.
//
// getServerSnapshot returns false so SSR renders the audible icon; if the user
// had muted, React re-renders with the real value straight after hydration.
export function useSound() {
  const muted = useSyncExternalStore(
    subscribeMuted,
    isMuted,
    () => false,
  );

  const toggleMuted = useCallback(() => setMuted(!isMuted()), []);

  return { muted, toggleMuted };
}
