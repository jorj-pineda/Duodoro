import { WORLDS } from "@/lib/avatarData";
import type { InviteData } from "@/lib/sessionTypes";

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
        <p className="text-3xl">{world?.emoji ?? "🌍"}</p>
        <p className="text-ink font-bold text-sm">
          {invite.fromName} invited you to focus
          {world ? ` in ${world.label}` : ""}!
        </p>
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-3 sm:py-2.5 rounded-xl bg-raise hover:bg-line text-muted font-bold text-sm transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3 sm:py-2.5 rounded-xl bg-accent hover:brightness-105 text-white font-bold text-sm transition-all"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
