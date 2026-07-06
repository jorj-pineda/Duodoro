import { WORLDS } from "@/lib/avatarData";
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
  const world = WORLDS.find((w) => w.id === invite.worldId);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface border border-line rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center space-y-4">
        {world && (
          <div className="h-16 rounded-xl overflow-hidden border border-line">
            <WorldThumbnail worldId={world.id} />
          </div>
        )}
        <p className="text-ink font-bold text-sm">
          {invite.fromName} invited you to focus
          {world ? ` in ${world.label}` : ""}!
        </p>
        <div className="flex gap-3">
          <Button variant="surface" size="sm" className="flex-1" onClick={onDismiss}>
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
