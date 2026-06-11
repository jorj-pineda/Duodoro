import type { GamePhase } from "./GameWorld";
import ThemeToggle from "./ThemeToggle";
import {
  UsersIcon,
  ChartIcon,
  NoteIcon,
  PencilIcon,
  StarIcon,
  SignOutIcon,
} from "./Icons";

function SessionStatusDot({ phase }: { phase: GamePhase }) {
  const color =
    phase === "focus"
      ? "bg-go"
      : phase === "waiting"
        ? "bg-faint"
        : "bg-gold";
  return (
    <div
      className={`w-2 h-2 rounded-full ${color} ${phase !== "waiting" ? "animate-pulse" : ""}`}
    />
  );
}

interface SessionTopBarProps {
  phase: GamePhase;
  displayName: string;
  username?: string;
  discriminator?: string;
  initial: string;
  isPremium: boolean;
  friendsOpen: boolean;
  notesOpen: boolean;
  statsOpen: boolean;
  profileMenuOpen: boolean;
  onToggleFriends: () => void;
  onToggleNotes: () => void;
  onToggleStats: () => void;
  onToggleProfileMenu: () => void;
  onGoHome: () => void;
  onEditAvatar: () => void;
  onOpenPremium: () => void;
  onSignOut: () => void;
}

export default function SessionTopBar({
  phase,
  displayName,
  username,
  discriminator,
  initial,
  isPremium,
  friendsOpen,
  notesOpen,
  statsOpen,
  profileMenuOpen,
  onToggleFriends,
  onToggleNotes,
  onToggleStats,
  onToggleProfileMenu,
  onGoHome,
  onEditAvatar,
  onOpenPremium,
  onSignOut,
}: SessionTopBarProps) {
  const tabClass = (open: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
      open
        ? "bg-raise text-ink"
        : "text-muted hover:text-ink hover:bg-raise"
    }`;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 bg-surface/85 backdrop-blur border-b border-line z-10">
      {/* Left: Friends */}
      <div className="flex items-center justify-end pr-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFriends();
          }}
          className={tabClass(friendsOpen)}
        >
          <UsersIcon /> <span className="hidden sm:inline">Friends</span>
        </button>
      </div>

      {/* Center: Duodoro + status dot */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onGoHome();
        }}
        className="flex flex-col items-center px-3 py-0.5 rounded-lg hover:bg-raise transition-colors"
      >
        <span className="font-display text-ink tracking-wide text-base leading-tight">
          Duodoro
        </span>
        <SessionStatusDot phase={phase} />
      </button>

      {/* Right: Notes, Stats, Theme, Account */}
      <div className="flex items-center gap-1.5 pl-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleNotes();
          }}
          className={tabClass(notesOpen)}
        >
          <NoteIcon /> <span className="hidden sm:inline">Notes</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStats();
          }}
          className={tabClass(statsOpen)}
        >
          <ChartIcon /> <span className="hidden sm:inline">Stats</span>
        </button>
        <ThemeToggle />
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleProfileMenu();
            }}
            className="w-7 h-7 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent text-xs font-bold hover:bg-accent/25 transition-colors"
          >
            {initial}
          </button>
          {profileMenuOpen && (
            <div
              className="absolute top-9 right-0 z-50 bg-surface border border-line rounded-xl p-3 shadow-xl min-w-48"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-ink font-bold text-sm mb-0.5">
                {displayName}
              </p>
              <p className="text-faint text-xs font-mono mb-3">
                @{username}{discriminator ? `#${discriminator}` : ""}
              </p>
              <button
                onClick={onEditAvatar}
                className="w-full flex items-center gap-2 text-left text-xs text-muted hover:text-ink py-1.5 transition-colors"
              >
                <PencilIcon className="w-3.5 h-3.5" /> Edit character
              </button>
              {!isPremium && (
                <button
                  onClick={onOpenPremium}
                  className="w-full flex items-center gap-2 text-left text-xs text-gold hover:text-gold-deep py-1.5 transition-colors"
                >
                  <StarIcon className="w-3.5 h-3.5" /> Upgrade to Premium
                </button>
              )}
              <button
                onClick={onSignOut}
                className="w-full flex items-center gap-2 text-left text-xs text-muted hover:text-danger py-1.5 transition-colors"
              >
                <SignOutIcon className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
