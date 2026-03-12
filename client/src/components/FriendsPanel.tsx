"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WORLDS } from "@/lib/avatarData";
import type { Profile } from "@/lib/types";
import { useFriendsList } from "@/hooks/useFriendsList";
import { useFriendSearch } from "@/hooks/useFriendSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  myProfile: Profile;
  onJoinSession: (sessionId: string) => void;
  onInviteFriend: (friendId: string) => void;
}

type Tab = "friends" | "requests" | "find";

const WORLD_LABEL: Record<string, { emoji: string; label: string }> =
  Object.fromEntries(
    WORLDS.map((w) => [w.id, { emoji: w.emoji, label: w.label }]),
  );

function StatusDot({ inSession }: { inSession: boolean }) {
  return (
    <div
      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${inSession ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`}
      title={inSession ? "In session" : "Offline"}
    />
  );
}

function FriendRow({
  friend,
  onJoin,
  onInvite,
}: {
  friend: Profile;
  onJoin: (sessionId: string) => void;
  onInvite: () => void;
}) {
  const inSession = !!friend.current_session_id;
  const worldInfo = friend.current_world_id
    ? WORLD_LABEL[friend.current_world_id]
    : null;
  const name = friend.display_name ?? friend.username;

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-700/50 transition-colors group">
      <StatusDot inSession={inSession} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{name}</p>
        {inSession && worldInfo ? (
          <p className="text-xs text-emerald-400 font-mono truncate">
            {worldInfo.emoji} In {worldInfo.label}
          </p>
        ) : (
          <p className="text-xs text-gray-500 font-mono truncate">
            @{friend.username}
          </p>
        )}
      </div>
      {inSession && friend.current_session_id ? (
        <button
          onClick={() => onJoin(friend.current_session_id!)}
          className="text-xs bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-mono font-bold px-2.5 py-1 rounded-lg transition-colors"
        >
          Join
        </button>
      ) : (
        <button
          onClick={onInvite}
          className="text-xs bg-gray-700/50 hover:bg-gray-700 text-gray-400 font-mono font-bold px-2.5 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
        >
          Invite
        </button>
      )}
    </div>
  );
}

function RequestRow({
  requester,
  friendshipId,
  onAccept,
  onDecline,
}: {
  requester: Profile;
  friendshipId: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-gray-700/30">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">
          {requester.display_name ?? requester.username}
        </p>
        <p className="text-xs text-gray-500 font-mono">wants to be friends</p>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => onAccept(friendshipId)}
          className="text-xs bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-2.5 py-1 rounded-lg transition-colors"
        >
          ✓
        </button>
        <button
          onClick={() => onDecline(friendshipId)}
          className="text-xs bg-gray-600 hover:bg-gray-500 text-white font-bold px-2.5 py-1 rounded-lg transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function FriendsPanel({
  open,
  onClose,
  myProfile,
  onJoinSession,
  onInviteFriend,
}: Props) {
  const [tab, setTab] = useState<Tab>("friends");
  const { friends, requests, acceptRequest, declineRequest } = useFriendsList(myProfile.id, open);
  const { searchQuery, setSearchQuery, searchResults, loading, handleSearch, sentRequests, sendRequest } = useFriendSearch(myProfile.id);

  const friendIds = new Set(friends.map((f) => f.id));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-30 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Vertically-centered panel on the left */}
          <div className="fixed left-4 top-0 bottom-0 z-40 flex items-stretch py-3 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-80 bg-gray-900 border border-gray-700 flex flex-col shadow-2xl rounded-2xl overflow-hidden"
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
                <h2 className="font-bold text-white font-mono tracking-widest">
                  FRIENDS
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-700">
                {(["friends", "requests", "find"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-xs font-mono font-bold capitalize transition-colors ${
                      tab === t
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {t}
                    {t === "requests" && requests.length > 0 && (
                      <span className="ml-1 bg-red-500 text-white rounded-full px-1 text-[10px]">
                        {requests.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3">
                {/* Friends tab */}
                {tab === "friends" && (
                  <div>
                    {friends.length === 0 ? (
                      <p className="text-gray-500 text-sm font-mono text-center py-8">
                        No friends yet.
                        <br />
                        Use the &quot;Find&quot; tab to add some!
                      </p>
                    ) : (
                      friends.map((f) => (
                        <FriendRow
                          key={f.id}
                          friend={f}
                          onJoin={onJoinSession}
                          onInvite={() => onInviteFriend(f.id)}
                        />
                      ))
                    )}
                  </div>
                )}

                {/* Requests tab */}
                {tab === "requests" && (
                  <div className="space-y-2">
                    {requests.length === 0 ? (
                      <p className="text-gray-500 text-sm font-mono text-center py-8">
                        No pending requests
                      </p>
                    ) : (
                      requests.map((r) => (
                        <RequestRow
                          key={r.id}
                          requester={r.requester}
                          friendshipId={r.id}
                          onAccept={acceptRequest}
                          onDecline={declineRequest}
                        />
                      ))
                    )}
                  </div>
                )}

                {/* Find tab */}
                {tab === "find" && (
                  <div>
                    <div className="flex gap-2 mb-3">
                      <input
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                        placeholder="Search by username..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      />
                      <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
                      >
                        {loading ? "…" : "Go"}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.map((user) => {
                        const alreadyFriend = friendIds.has(user.id);
                        const sent = sentRequests.has(user.id);
                        return (
                          <div
                            key={user.id}
                            className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-800/50"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">
                                {user.display_name ?? user.username}
                              </p>
                              <p className="text-xs text-gray-500 font-mono">
                                @{user.username}
                              </p>
                            </div>
                            {alreadyFriend ? (
                              <span className="text-xs text-gray-500 font-mono">
                                Friends
                              </span>
                            ) : sent ? (
                              <span className="text-xs text-emerald-400 font-mono">
                                Sent ✓
                              </span>
                            ) : (
                              <button
                                onClick={() => sendRequest(user.id)}
                                className="text-xs bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-mono font-bold px-2.5 py-1 rounded-lg transition-colors"
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer: my profile */}
              <div className="border-t border-gray-700 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-sm font-bold">
                  {(myProfile.display_name ?? myProfile.username)
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {myProfile.display_name ?? myProfile.username}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    @{myProfile.username}
                  </p>
                </div>
                {myProfile.is_premium && (
                  <span className="text-xs font-mono text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                    PRO
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
