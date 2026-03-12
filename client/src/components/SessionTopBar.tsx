import type { GamePhase } from "./GameWorld";

function SessionStatusDot({ phase }: { phase: GamePhase }) {
  const color =
    phase === "focus"
      ? "bg-emerald-400"
      : phase === "waiting"
        ? "bg-red-400"
        : "bg-yellow-400";
  const shadow =
    phase === "focus"
      ? "0 0 6px #34d399"
      : phase === "waiting"
        ? "0 0 6px #f87171"
        : "0 0 6px #facc15";
  return (
    <div
      className={`w-2 h-2 rounded-full ${color}`}
      style={{ boxShadow: shadow }}
    />
  );
}

interface SessionTopBarProps {
  phase: GamePhase;
  displayName: string;
  username?: string;
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
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 bg-gray-800/90 backdrop-blur border-b border-gray-700 z-10">
      {/* Left: Friends */}
      <div className="flex items-center justify-end pr-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFriends();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            friendsOpen
              ? "bg-gray-600 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-700"
          }`}
        >
          {"👥"} <span className="hidden sm:inline">Friends</span>
        </button>
      </div>

      {/* Center: Duodoro + status dot */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onGoHome();
        }}
        className="flex flex-col items-center px-3 py-0.5 rounded-lg hover:bg-gray-700/50 transition-colors"
      >
        <span className="text-white font-black font-mono tracking-widest text-sm">
          Duodoro
        </span>
        <SessionStatusDot phase={phase} />
      </button>

      {/* Right: Notes, Stats, Account */}
      <div className="flex items-center gap-1.5 pl-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleNotes();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            notesOpen
              ? "bg-gray-600 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-700"
          }`}
        >
          {"📝"} <span className="hidden sm:inline">Notes</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStats();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            statsOpen
              ? "bg-gray-600 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-700"
          }`}
        >
          {"📊"} <span className="hidden sm:inline">Stats</span>
        </button>
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleProfileMenu();
            }}
            className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
          >
            {initial}
          </button>
          {profileMenuOpen && (
            <div
              className="absolute top-9 right-0 z-50 bg-gray-800 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-44"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-white font-bold text-sm mb-0.5">
                {displayName}
              </p>
              <p className="text-gray-500 text-xs font-mono mb-3">
                @{username}
              </p>
              <button
                onClick={onEditAvatar}
                className="w-full text-left text-xs font-mono text-gray-400 hover:text-white py-1.5 transition-colors"
              >
                {"✏️"} Edit character
              </button>
              {!isPremium && (
                <button
                  onClick={onOpenPremium}
                  className="w-full text-left text-xs font-mono text-yellow-400 hover:text-yellow-300 py-1.5 transition-colors"
                >
                  {"⭐"} Upgrade to Premium
                </button>
              )}
              <button
                onClick={onSignOut}
                className="w-full text-left text-xs font-mono text-gray-400 hover:text-red-400 py-1.5 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
