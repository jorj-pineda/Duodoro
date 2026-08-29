"use client";

import { WORLDS } from "@/lib/avatarData";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { InviteData } from "@/lib/sessionTypes";
import { WorldThumbnail } from "./WorldDecorations";
import Button from "./Button";

export default function InvitePopup({
  invite,
  onAccept,
  onDismiss,
}: {
  invite: InviteData;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const dialogRef = useModalAccessibility<HTMLDivElement>(true, onDismiss);
  const world = WORLDS.find((w) => w.id === invite.worldId);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-invite-title"
        tabIndex={-1}
        className="bg-surface border border-line rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center space-y-4"
      >
        {world && (
          <div className="h-16 rounded-xl overflow-hidden border border-line">
            <WorldThumbnail worldId={world.id} />
          </div>
        )}
        <p id="session-invite-title" className="text-ink font-bold text-sm">
          {invite.fromName} invited you to focus
          {world ? ` in ${world.label}` : ""}!
        </p>
        <div className="flex gap-3">
          <Button data-autofocus variant="surface" size="sm" className="flex-1" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button variant="go" size="sm" className="flex-1" onClick={onAccept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
