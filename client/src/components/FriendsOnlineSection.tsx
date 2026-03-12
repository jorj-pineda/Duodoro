"use client";
import { WORLDS } from "@/lib/avatarData";
import type { Profile } from "@/lib/types";

const WORLD_LABEL: Record<string, { emoji: string; label: string }> =
  Object.fromEntries(
    WORLDS.map((w) => [w.id, { emoji: w.emoji, label: w.label }]),
  );

interface Props {
  onlineFriends: Profile[];
  onOpenFriends: () => void;
  onJoinSession: (sessionId: string) => void;
  onInvite: (friendId: string) => void;
}

export default function FriendsOnlineSection({
  onlineFriends,
  onOpenFriends,
  onJoinSession,
  onInvite,
}: Props) {
  if (onlineFriends.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold font-mono text-gray-400 uppercase tracking-wider">
          Friends Online
        </h2>
        <button
          onClick={onOpenFriends}
          className="text-[10px] font-mono text-gray-600 hover:text-emerald-400 transition-colors"
        >
          See all
        </button>
      </div>
      <div className="space-y-1">
        {onlineFriends.slice(0, 5).map((f) => {
          const inSession = !!f.current_session_id;
          const worldInfo = f.current_world_id
            ? WORLD_LABEL[f.current_world_id]
            : null;
          const name = f.display_name ?? f.username;
          return (
            <div
              key={f.id}
              className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl hover:bg-gray-700/50 transition-colors group"
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${inSession ? "bg-emerald-400 animate-pulse" : "bg-yellow-400"}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {name}
                </p>
                {inSession && worldInfo ? (
                  <p className="text-[10px] text-emerald-400 font-mono truncate">
                    {worldInfo.emoji} In {worldInfo.label}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-500 font-mono">
                    Online
                  </p>
                )}
              </div>
              {inSession && f.current_session_id ? (
                <button
                  onClick={() => onJoinSession(f.current_session_id!)}
                  className="text-[10px] bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-mono font-bold px-2 py-1 rounded-lg transition-colors"
                >
                  Join
                </button>
              ) : (
                <button
                  onClick={() => onInvite(f.id)}
                  className="text-[10px] bg-gray-700/50 hover:bg-gray-700 text-gray-400 font-mono font-bold px-2 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                >
                  Invite
                </button>
              )}
            </div>
          );
        })}
        {onlineFriends.length > 5 && (
          <button
            onClick={onOpenFriends}
            className="w-full text-center text-[10px] font-mono text-gray-500 hover:text-emerald-400 py-1.5 transition-colors"
          >
            +{onlineFriends.length - 5} more
          </button>
        )}
      </div>
    </div>
  );
}
