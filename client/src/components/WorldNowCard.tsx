"use client";
import { getWorld } from "@/lib/avatarData";
import { formatTime } from "@/lib/format";
import { WorldThumbnail } from "./WorldDecorations";
import { useRotatingWorld } from "@/hooks/useRotatingWorld";

/**
 * The world everyone is in, and how long it has left.
 *
 * Replaces the eight-thumbnail picker. Nobody chooses a world any more — the
 * server puts everyone in the same one and changes it on the :30 — so this is
 * a readout, not a control, and it deliberately doesn't look like a button.
 *
 * The countdown is what makes the rotation legible instead of arbitrary: a
 * world that swaps without warning reads as a glitch, one with a timer on it
 * reads as a schedule.
 */
export default function WorldNowCard() {
  const rotation = useRotatingWorld();
  const world = rotation ? getWorld(rotation.world) : null;

  return (
    <div>
      <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
        Everyone&apos;s world
      </h2>
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {/* Taller than the old thumbnails were: there is one of these now, not
            eight in a grid, so it can be looked at rather than scanned. */}
        <div className="h-28 sm:h-24 w-full">
          {world && <WorldThumbnail worldId={world.id} />}
        </div>
        <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
          <span className="text-sm font-semibold text-ink">
            {world ? world.label : "—"}
          </span>
          <span className="text-[11px] text-muted">
            {rotation ? (
              <>
                Changes in{" "}
                <span className="font-mono tabular-nums text-ink">
                  {formatTime(rotation.msLeft / 1000)}
                </span>
              </>
            ) : (
              " "
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
