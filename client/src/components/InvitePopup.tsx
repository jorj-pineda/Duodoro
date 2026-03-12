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
      <div className="bg-gray-800 border border-gray-600 rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center space-y-4">
        <p className="text-3xl">{world?.emoji ?? "🌍"}</p>
        <p className="text-white font-bold font-mono text-sm">
          {invite.fromName} invited you to focus
          {world ? ` in ${world.label}` : ""}!
        </p>
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono font-bold text-sm transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold text-sm transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
