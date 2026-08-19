"use client";
import { WORLDS, type WorldId } from "@/lib/avatarData";
import { WorldThumbnail } from "./WorldDecorations";

export function isWorldId(id: string): id is WorldId {
  return WORLDS.some((w) => w.id === id);
}

/**
 * Inline world chip for lists that used to print an emoji.
 *
 * `WorldThumbnail` already draws the sky + signature sprite; this just gives
 * it a box small enough to sit in a friend row or a history line.
 */
export default function WorldThumb({
  worldId,
  className = "w-8 h-5",
}: {
  worldId: string;
  className?: string;
}) {
  if (!isWorldId(worldId)) return null;
  return (
    <span
      className={`relative inline-block overflow-hidden rounded-sm border border-line shrink-0 ${className}`}
      aria-hidden="true"
    >
      <WorldThumbnail worldId={worldId} />
    </span>
  );
}
