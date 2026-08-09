"use client";
import { useEffect, useState } from "react";
import { useStats } from "@/lib/useStats";
import { WORLDS, type WorldId } from "@/lib/avatarData";
import { formatDuration, formatTag } from "@/lib/format";
import { useTasks } from "@/hooks/useTasks";
import { useOnlineFriends } from "@/hooks/useOnlineFriends";
import TaskSection from "./TaskSection";
import FriendsOnlineSection from "./FriendsOnlineSection";
import ThemeToggle from "./ThemeToggle";
import { WorldThumbnail } from "./WorldDecorations";
import Button from "./Button";
import {
  UsersIcon,
  ChartIcon,
  PencilIcon,
  StarIcon,
  SignOutIcon,
} from "./Icons";
import type { Profile } from "@/lib/types";
import type { Socket } from "socket.io-client";

interface Props {
  profile: Profile;
  activeSessionId?: string;
  socketRef: { current: Socket | null };
  onFocus: (world: WorldId) => void;
  /** Controlled by DuoTimer so the invite path sees the same choice */
  selectedWorld: WorldId;
  onSelectWorld: (world: WorldId) => void;
  onRejoinSession: () => void;
  onJoinSession: (sessionId: string) => void;
  onInvite: (friendId: string) => void;
  onEditAvatar: () => void;
  onChangeUsername: () => void;
  onChangeDisplayName: () => void;
  onSignOut: () => void;
  onOpenFriends: () => void;
  onOpenStats: () => void;
}

function QuickStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface border border-line rounded-xl px-3 py-3 text-center flex-1">
      <p className="text-faint text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${
          accent ? "text-accent" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function HomeDashboard({
  profile,
  activeSessionId,
  socketRef,
  onFocus,
  selectedWorld,
  onSelectWorld,
  onRejoinSession,
  onJoinSession,
  onInvite,
  onEditAvatar,
  onChangeUsername,
  onChangeDisplayName,
  onSignOut,
  onOpenFriends,
  onOpenStats,
}: Props) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const { personalStats, loading, fetchStats } = useStats(profile.id);

  const {
    tasks,
    newTask,
    setNewTask,
    addTask,
    toggleTask,
    deleteTask,
    pendingTasks,
    completedTasks,
    clearCompleted,
    error: taskError,
    clearError: clearTaskError,
  } = useTasks(profile.id);

  const { friends, onlineFriendIds } = useOnlineFriends(profile.id, socketRef);

  const displayName = profile.display_name ?? profile.username ?? "You";
  const initial = displayName.charAt(0).toUpperCase();
  const isPremium = profile.is_premium ?? false;

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onlineFriends = friends.filter(
    (f) => onlineFriendIds.has(f.id) || !!f.current_session_id,
  );

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12
      ? "Good morning"
      : greetingHour < 17
        ? "Good afternoon"
        : "Good evening";

  return (
    <div
      className="min-h-screen bg-bg texture-dots flex flex-col"
      onClick={() => setProfileMenuOpen(false)}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface/80 backdrop-blur border-b border-line">
        <div className="flex items-center gap-2">
          <span className="font-display text-lg text-ink tracking-wide">
            Duodoro
          </span>
          {activeSessionId && (
            <div
              className="w-2 h-2 rounded-full bg-gold animate-pulse"
              title="Session in progress"
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenFriends();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-ink hover:bg-raise transition-colors"
          >
            <UsersIcon /> <span className="hidden sm:inline">Friends</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenStats();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-ink hover:bg-raise transition-colors"
          >
            <ChartIcon /> <span className="hidden sm:inline">Stats</span>
          </button>
          <ThemeToggle />
          <div className="relative ml-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProfileMenuOpen((o) => !o);
              }}
              className="w-8 h-8 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent text-sm font-bold hover:bg-accent/25 transition-colors"
            >
              {initial}
            </button>
            {profileMenuOpen && (
              <div
                className="absolute top-10 right-0 z-50 bg-surface border border-line rounded-xl p-3 shadow-xl min-w-48"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-ink font-bold text-sm mb-0.5">
                  {displayName}
                </p>
                <p className="text-faint text-xs font-mono mb-3">
                  @{profile.discriminator ? formatTag(profile.username, profile.discriminator) : profile.username}
                </p>
                <button
                  onClick={() => {
                    onEditAvatar();
                    setProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 text-left text-xs text-muted hover:text-ink py-1.5 transition-colors"
                >
                  <PencilIcon className="w-3.5 h-3.5" /> Edit character
                </button>
                {!profile.username_changed && (
                  <button
                    onClick={() => {
                      onChangeUsername();
                      setProfileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 text-left text-xs text-accent hover:text-accent-deep py-1.5 transition-colors"
                  >
                    <PencilIcon className="w-3.5 h-3.5" /> Change username (1x)
                  </button>
                )}
                <button
                  onClick={() => {
                    onChangeDisplayName();
                    setProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 text-left text-xs text-muted hover:text-ink py-1.5 transition-colors"
                >
                  <PencilIcon className="w-3.5 h-3.5" /> Change display name
                </button>
                {!isPremium && (
                  <button
                    onClick={() => setProfileMenuOpen(false)}
                    className="w-full flex items-center gap-2 text-left text-xs text-gold hover:text-gold-deep py-1.5 transition-colors"
                  >
                    <StarIcon className="w-3.5 h-3.5" /> Upgrade to Premium
                  </button>
                )}
                <button
                  onClick={() => {
                    onSignOut();
                    setProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 text-left text-xs text-muted hover:text-danger py-1.5 transition-colors"
                >
                  <SignOutIcon className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <div>
            <h1 className="font-display text-3xl text-ink">
              {greeting}, {displayName}
            </h1>
            <p className="text-muted text-sm mt-1">Ready to focus?</p>
          </div>

          {!loading && personalStats && (
            <div className="flex gap-2">
              <QuickStat
                label="Total"
                value={formatDuration(personalStats.totalFocusTime)}
                accent
              />
              <QuickStat
                label="This Week"
                value={formatDuration(personalStats.weeklyFocusTime)}
              />
              <QuickStat
                label="Streak"
                value={`${personalStats.currentStreak}d`}
                accent
              />
            </div>
          )}

          {!loading && !personalStats && (
            <div className="flex gap-2">
              <QuickStat label="Total" value="0m" />
              <QuickStat label="This Week" value="0m" />
              <QuickStat label="Streak" value="0d" />
            </div>
          )}

          <TaskSection
            tasks={tasks}
            pendingTasks={pendingTasks}
            completedTasks={completedTasks}
            newTask={newTask}
            setNewTask={setNewTask}
            addTask={addTask}
            toggleTask={toggleTask}
            deleteTask={deleteTask}
            clearCompleted={clearCompleted}
            error={taskError}
            onDismissError={clearTaskError}
          />

          <FriendsOnlineSection
            onlineFriends={onlineFriends}
            onOpenFriends={onOpenFriends}
            onJoinSession={onJoinSession}
            onInvite={onInvite}
          />

          <div>
            <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
              Choose a world
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {WORLDS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onSelectWorld(w.id)}
                  className={`rounded-xl border overflow-hidden transition-all text-center ${
                    selectedWorld === w.id
                      ? "border-accent ring-2 ring-accent/40 text-ink shadow-sm"
                      : "border-line bg-surface text-muted hover:border-faint"
                  }`}
                >
                  <div className="h-12 w-full">
                    <WorldThumbnail worldId={w.id} />
                  </div>
                  <span className="block py-1 text-[10px] font-medium">
                    {w.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {activeSessionId && (
              <Button variant="gold" size="lg" fullWidth onClick={onRejoinSession}>
                Return to session
              </Button>
            )}
            <Button
              variant={activeSessionId ? "surface" : "accent"}
              size={activeSessionId ? "md" : "lg"}
              fullWidth
              onClick={() => onFocus(selectedWorld)}
            >
              {activeSessionId ? "New session" : "Focus"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
