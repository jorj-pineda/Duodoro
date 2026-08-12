"use client";
import { useEffect, useState } from "react";
import { worldAt, msUntilRotation } from "@/lib/rotation";
import type { WorldId } from "@/lib/avatarData";

export interface RotationState {
  world: WorldId;
  /** Milliseconds until the world changes. */
  msLeft: number;
}

/**
 * The world currently in play, and how long it has left.
 *
 * Starts as `null` and fills in from an effect rather than reading the clock
 * during render. The home screen is inside a client component but Next still
 * renders it on the server, and `Date.now()` is a different number there — a
 * countdown computed during render is a guaranteed hydration mismatch. `null`
 * means "not known yet", which the caller renders as a placeholder for one
 * frame.
 *
 * Ticks every second. The clock is read fresh each tick instead of counting
 * down from a stored value, so a backgrounded tab that gets its timers
 * throttled catches up on the next tick rather than drifting — the same reason
 * the session timer renders from `phaseStartTime` instead of decrementing.
 */
export function useRotatingWorld(): RotationState | null {
  const [state, setState] = useState<RotationState | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setState({ world: worldAt(now), msLeft: msUntilRotation(now) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return state;
}
