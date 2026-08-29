"use client";
import { WORLDS } from "@/lib/avatarData";
import type { Profile } from "@/lib/types";
import WorldThumb from "./WorldThumb";

const WORLD_LABEL: Record<string, string> = Object.fromEntries(
  WORLDS.map((w) => [w.id, w.label]),
);

interface Props {
  onlineFriends: Profile[];
  error: string | null;
  retry: () => void;
  onOpenFriends: () => void;
  onJoinSession: (sessionId: string) => void;
  onInvite: (friendId: string) => void;
}

export default function FriendsOnlineSection({
  onlineFriends,
  error,
  retry,
  onOpenFriends,
  onJoinSession,
  onInvite,
}: Props) {
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 bg-surface border border-danger/30 rounded-2xl px-4 py-3"
      >
        <div className="flex-1 min-w-0">
          <p className="text-danger text-xs font-semibold">
            Friend presence is unavailable
          </p>
          <p className="text-faint text-[11px] mt-0.5">
            Your friend list was not reported as empty.
          </p>
        </div>
        <button
          onClick={retry}
          className="text-xs bg-raise hover:bg-line text-muted font-bold px-2.5 py-1.5 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (onlineFriends.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-line p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-faint uppercase tracking-wider">
          Friends online
        </h2>
        <button
          onClick={onOpenFriends}
          className="text-[10px] text-faint hover:text-accent transition-colors"
        >
          See all
        </button>
      </div>
      <div className="space-y-1">
        {onlineFriends.slice(0, 5).map((f) => {
          const inSession = !!f.current_session_id;
          const worldLabel = f.current_world_id
            ? WORLD_LABEL[f.current_world_id]
            : null;
          const name = f.display_name ?? f.username;
          return (
            <div
              key={f.id}
              className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl hover:bg-raise transition-colors group"
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${inSession ? "bg-go animate-pulse" : "bg-gold"}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">
                  {name}
                </p>
                {inSession && worldLabel && f.current_world_id ? (
                  <p className="text-[10px] text-go truncate flex items-center gap-1.5">
                    <WorldThumb worldId={f.current_world_id} />
                    In {worldLabel}
                  </p>
                ) : (
                  <p className="text-[10px] text-faint">Online</p>
                )}
              </div>
              {inSession && f.current_session_id ? (
                <button
                  onClick={() => onJoinSession(f.current_session_id!)}
                  className="text-[10px] bg-go/15 hover:bg-go/30 text-go font-bold px-2.5 py-1 rounded-lg transition-colors"
                >
                  Join
                </button>
              ) : (
                <button
                  onClick={() => onInvite(f.id)}
                  className="text-[10px] bg-raise hover:bg-line text-muted font-bold px-2.5 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
            className="w-full text-center text-[10px] text-faint hover:text-accent py-1.5 transition-colors"
          >
            +{onlineFriends.length - 5} more
          </button>
        )}
      </div>
    </div>
  );
}
