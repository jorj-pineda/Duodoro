"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import AvatarCreator from "./AvatarCreator";
import GameWorld, { type GamePhase } from "./GameWorld";
import LandingPage from "./LandingPage";
import FriendsPanel from "./FriendsPanel";
import StickyNote from "./StickyNote";
import PremiumModal from "./PremiumModal";
import StatsPanel from "./StatsPanel";
import StatsScreen from "./StatsScreen";
import HomeDashboard from "./HomeDashboard";
import { playSound } from "@/lib/sounds";
import {
  DEFAULT_AVATAR,
  type AvatarConfig,
  type WorldId,
} from "@/lib/avatarData";
import { getSupabase } from "@/lib/supabase";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { Profile, PetType } from "@/lib/types";
import { PET_OPTIONS } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppStep = "loading" | "landing" | "avatar" | "home" | "game";

interface PlayerData {
  avatar: AvatarConfig;
  displayName?: string;
}

interface SyncPayload {
  phase: GamePhase;
  focusDuration: number;
  breakDuration: number;
  phaseStartTime: number | null;
  world: string;
  players: Record<string, PlayerData>;
  playerCount: number;
  sessionId: string;
}

interface PhaseChangePayload {
  phase: GamePhase;
  phaseStartTime: number | null;
  focusDuration: number;
  breakDuration: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

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

function DurationSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-gray-500 text-xs font-mono w-14 text-right shrink-0">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-emerald-500 h-1.5"
      />
      <span className="text-emerald-400 text-xs font-mono font-bold w-12 shrink-0">
        {value}
        {unit}
      </span>
    </div>
  );
}

function PhaseDots({
  filled = 0,
  total = 7,
}: {
  filled?: number;
  total?: number;
}) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full border transition-all ${
            i < filled
              ? "bg-emerald-500 border-emerald-500"
              : "bg-transparent border-gray-600"
          }`}
        />
      ))}
    </div>
  );
}

function PetPicker({
  selected,
  onSelect,
  isPremium,
  onPremiumClick,
}: {
  selected: PetType | null;
  onSelect: (pet: PetType | null) => void;
  isPremium: boolean;
  onPremiumClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      <span className="text-gray-600 text-xs font-mono">PET:</span>
      <button
        onClick={() => (isPremium ? onSelect(null) : onPremiumClick())}
        className={`w-7 h-7 rounded-full border text-xs flex items-center justify-center transition-all ${
          selected === null
            ? "border-gray-500 bg-gray-700 text-gray-300"
            : "border-gray-700 bg-gray-800 text-gray-600 hover:border-gray-600"
        }`}
        title="No pet"
      >
        {"✕"}
      </button>
      {PET_OPTIONS.map(({ type, emoji, label }) => (
        <button
          key={type}
          onClick={() => (isPremium ? onSelect(type) : onPremiumClick())}
          className={`w-7 h-7 rounded-full border text-sm flex items-center justify-center transition-all ${
            selected === type
              ? "border-emerald-500 bg-emerald-500/20"
              : "border-gray-700 bg-gray-800 hover:border-gray-500"
          } ${!isPremium ? "opacity-50" : ""}`}
          title={isPremium ? label : `${label} (Premium)`}
        >
          {isPremium ? emoji : "🔒"}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DuoTimer() {
  // ── Auth & profile ────────────────────────────────────────────────────────
  const [appStep, setAppStep] = useState<AppStep>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

  // ── Avatar & world ────────────────────────────────────────────────────────
  const [myAvatar, setMyAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [myWorld, setMyWorld] = useState<WorldId>("forest");
  const [myPet, setMyPet] = useState<PetType | null>(null);

  // ── Session ───────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string>("");

  // ── Session config ────────────────────────────────────────────────────────
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [phaseStartTime, setPhaseStartTime] = useState<number | null>(null);
  const [serverFocusDuration, setServerFocusDuration] = useState(25 * 60);
  const [serverBreakDuration, setServerBreakDuration] = useState(5 * 60);
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [sessionStarted, setSessionStarted] = useState(false);

  // ── Connection ────────────────────────────────────────────────────────────
  const [myId, setMyId] = useState<string>("");
  const socketRef = useRef<Socket | null>(null);

  // ── Timer tick ────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // ── UI panels ─────────────────────────────────────────────────────────────
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [fullStatsOpen, setFullStatsOpen] = useState(false);

  // ── Sound tracking ────────────────────────────────────────────────────────
  const prevPhaseRef = useRef<GamePhase>("waiting");

  const sb = getSupabase();

  // ─────────────────────────────────────────────────────────────────────────
  // localStorage helpers — fast path for returning users
  // ─────────────────────────────────────────────────────────────────────────

  const PROFILE_CACHE_KEY = "duodoro_profile";

  const cacheProfile = (p: Profile) => {
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    } catch {}
  };

  const getCachedProfile = (): Profile | null => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      return raw ? (JSON.parse(raw) as Profile) : null;
    } catch {
      return null;
    }
  };

  const clearCachedProfile = () => {
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {}
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Auth init — returning users with avatar skip to home
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    let sessionHandled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const hasOAuthCode = window.location.search.includes("code=");
    timeoutId = setTimeout(
      () => {
        if (mounted) setAppStep("landing");
      },
      hasOAuthCode ? 20000 : 8000,
    );

    const profileFromSession = (session: Session): Profile => {
      const { id, user_metadata, email } = session.user;
      const raw =
        (
          user_metadata?.preferred_username ||
          user_metadata?.user_name ||
          (email ?? "").split("@")[0] ||
          "user"
        )
          .replace(/[^a-zA-Z0-9_]/g, "")
          .toLowerCase() || "user";
      return {
        id,
        username: raw,
        display_name: user_metadata?.full_name ?? user_metadata?.name ?? raw,
        avatar_config: null,
        is_premium: false,
        current_room: null,
        current_session_id: null,
        current_world_id: null,
        updated_at: new Date().toISOString(),
      };
    };

    const applyProfile = (prof: Profile) => {
      if (!mounted) return;
      if (window.location.search.includes("code=")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      setProfile(prof);
      cacheProfile(prof);
      if (prof.avatar_config) {
        setMyAvatar(prof.avatar_config);
        setAppStep("home");
      } else {
        setAppStep("avatar");
      }
    };

    const handleSession = async (session: Session) => {
      if (sessionHandled) return;
      sessionHandled = true;
      clearTimeout(timeoutId);
      if (!mounted) return;

      // Fast path: use localStorage cache immediately so user never sees avatar creator flash
      const cached = getCachedProfile();
      if (cached && cached.id === session.user.id && cached.avatar_config) {
        applyProfile(cached);
        // Still fetch from DB in background to keep cache fresh
        sb.from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            if (data && mounted) {
              const fresh = data as Profile;
              setProfile(fresh);
              cacheProfile(fresh);
              if (fresh.avatar_config) setMyAvatar(fresh.avatar_config);
            }
          });
        return;
      }

      // Slow path: query DB with timeout
      try {
        const result = await Promise.race([
          sb.from("profiles").select("*").eq("id", session.user.id).single(),
          new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 4000),
          ),
        ]);
        if (!mounted) return;

        if (result.data) {
          applyProfile(result.data as Profile);
        } else {
          const provisional = profileFromSession(session);
          applyProfile(provisional);
          sb.from("profiles")
            .upsert({
              id: provisional.id,
              username: provisional.username + "_" + provisional.id.slice(0, 4),
              display_name: provisional.display_name,
            })
            .then(() => {});
        }
      } catch {
        const provisional = profileFromSession(session);
        applyProfile(provisional);
      }
    };

    const loadUser = async () => {
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!mounted) return;
        if (!session) {
          if (!window.location.search.includes("code=")) setAppStep("landing");
          return;
        }
        await handleSession(session);
      } catch {
        if (mounted) setAppStep("landing");
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
          await handleSession(session);
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          clearCachedProfile();
          setAppStep("landing");
        }
      },
    );

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Socket setup
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setMyId(socket.id ?? "");
    });

    socket.on("session_created", ({ sessionId: sid }: { sessionId: string }) => {
      setSessionId(sid);
    });

    socket.on("session_error", ({ message }: { message: string }) => {
      console.error("Session error:", message);
    });

    socket.on("sync_state", (data: SyncPayload) => {
      setPhase(data.phase);
      setPhaseStartTime(data.phaseStartTime);
      setServerFocusDuration(data.focusDuration);
      setServerBreakDuration(data.breakDuration);
      setPlayers(data.players || {});
      if (data.world) setMyWorld(data.world as WorldId);
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.phase !== "waiting") setSessionStarted(true);
    });

    socket.on("phase_change", (data: PhaseChangePayload) => {
      setPhase(data.phase);
      setPhaseStartTime(data.phaseStartTime);
      setServerFocusDuration(data.focusDuration);
      setServerBreakDuration(data.breakDuration);
      if (data.phase !== "waiting") setSessionStarted(true);
    });

    socket.on(
      "player_joined",
      ({
        playerId,
        avatar,
        displayName,
      }: {
        playerId: string;
        avatar: AvatarConfig;
        displayName?: string;
      }) => {
        setPlayers((prev) => ({
          ...prev,
          [playerId]: { avatar, displayName },
        }));
      },
    );

    socket.on("player_left", ({ playerId }: { playerId: string }) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ── Play sounds on phase transitions ──────────────────────────────────────
  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    if (phase === "focus") playSound("session-start");
    if (phase === "celebration") playSound("victory");
    if (phase === "break") playSound("break-start");
    prevPhaseRef.current = phase;
  }, [phase]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────────────────

  const currentPhaseDuration =
    phase === "focus" ? serverFocusDuration : serverBreakDuration;

  const timeLeft = phaseStartTime
    ? Math.max(0, currentPhaseDuration - (now - phaseStartTime) / 1000)
    : currentPhaseDuration;

  const focusProgress =
    phase === "focus" && phaseStartTime
      ? Math.min(1, (now - phaseStartTime) / (serverFocusDuration * 1000))
      : 0;

  const returningProgress =
    phase === "returning" && phaseStartTime
      ? Math.min(1, (now - phaseStartTime) / 3500)
      : 0;

  const partnerEntry = Object.entries(players).find(([id]) => id !== myId);
  const partner = partnerEntry
    ? { id: partnerEntry[0], avatar: partnerEntry[1].avatar }
    : null;
  const partnerName = partnerEntry?.[1].displayName;

  const playerCount = Object.keys(players).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Supabase actions
  // ─────────────────────────────────────────────────────────────────────────

  const saveAvatar = async (config: AvatarConfig) => {
    if (!profile) return;
    await sb
      .from("profiles")
      .update({ avatar_config: config })
      .eq("id", profile.id);
    setMyAvatar(config);
    const updated = { ...profile, avatar_config: config };
    setProfile(updated);
    cacheProfile(updated);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Session actions (replaces old room-code flow)
  // ─────────────────────────────────────────────────────────────────────────

  const createSession = useCallback(
    (world: WorldId) => {
      const socket = socketRef.current;
      if (!socket) return;
      // If already in a session, leave it first
      if (sessionId) {
        socket.emit("leave_session", { sessionId });
        setSessionStarted(false);
        setPhase("waiting");
        setPlayers({});
        setSessionId("");
      }
      setMyWorld(world);
      setAppStep("game");
      socket.emit("create_session", {
        avatar: myAvatar,
        world,
        displayName: profile?.display_name ?? profile?.username ?? "Player",
        userId: profile?.id,
      });
    },
    [myAvatar, profile, sessionId],
  );

  const joinSession = useCallback(
    (sid: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      setSessionId(sid);
      setAppStep("game");
      socket.emit("join_session", {
        sessionId: sid,
        avatar: myAvatar,
        displayName: profile?.display_name ?? profile?.username ?? "Player",
        userId: profile?.id,
      });
    },
    [myAvatar, profile],
  );

  const leaveSession = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("leave_session", { sessionId });
    setAppStep("home");
    setSessionStarted(false);
    setPhase("waiting");
    setPlayers({});
    setSessionId("");
  }, [sessionId]);

  const startSession = useCallback(() => {
    socketRef.current?.emit("start_session", {
      sessionId,
      focusDuration: focusDuration * 60,
      breakDuration: breakDuration * 60,
    });
    playSound("click");
  }, [sessionId, focusDuration, breakDuration]);

  const stopSession = useCallback(() => {
    socketRef.current?.emit("stop_session", { sessionId });
    setSessionStarted(false);
    playSound("click");
  }, [sessionId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Loading
  // ─────────────────────────────────────────────────────────────────────────

  if (appStep === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="text-4xl font-black font-mono text-white tracking-widest">
            Duodoro
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <span className="text-gray-600 text-xs font-mono">
            signing you in...
          </span>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Landing
  // ─────────────────────────────────────────────────────────────────────────

  if (appStep === "landing") {
    return <LandingPage />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Avatar creator
  // ─────────────────────────────────────────────────────────────────────────

  if (appStep === "avatar") {
    const isEditing = !!profile?.avatar_config;
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <AvatarCreator
          initialConfig={myAvatar}
          initialDisplayName={profile?.display_name ?? ""}
          onBack={isEditing ? () => setAppStep("home") : undefined}
          onSave={async (config, name) => {
            await saveAvatar(config);
            if (name && profile) {
              await sb
                .from("profiles")
                .update({ display_name: name })
                .eq("id", profile.id);
              const updated = { ...profile, display_name: name, avatar_config: config };
              setProfile(updated);
              cacheProfile(updated);
            }
            setAppStep("home");
          }}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Home Dashboard
  // ─────────────────────────────────────────────────────────────────────────

  const isPremium = profile?.is_premium ?? false;
  const displayName = profile?.display_name ?? profile?.username ?? "You";
  const initial = displayName.charAt(0).toUpperCase();

  if (appStep === "home") {
    return (
      <>
        <HomeDashboard
          profile={profile!}
          activeSessionId={sessionId || undefined}
          onFocus={createSession}
          onRejoinSession={() => setAppStep("game")}
          onJoinSession={joinSession}
          onEditAvatar={() => setAppStep("avatar")}
          onSignOut={async () => {
            const { signOut } = await import("@/lib/supabase");
            await signOut();
          }}
          onOpenFriends={() => {
            setFriendsOpen(true);
            setNotesOpen(false);
            setStatsOpen(false);
          }}
          onOpenNotes={() => {
            setNotesOpen(true);
            setFriendsOpen(false);
            setStatsOpen(false);
          }}
          onOpenStats={() => {
            setStatsOpen((o) => !o);
            setFriendsOpen(false);
            setNotesOpen(false);
          }}
        />
        {/* Panels available from home */}
        {profile && (
          <>
            <FriendsPanel
              open={friendsOpen}
              onClose={() => setFriendsOpen(false)}
              myProfile={profile}
              onJoinSession={joinSession}
              onInviteFriend={() => {}}
            />
            <StickyNote
              open={notesOpen}
              onClose={() => setNotesOpen(false)}
              userId={profile.id}
              roomCode={sessionId || null}
            />
            <StatsPanel
              open={statsOpen}
              onClose={() => setStatsOpen(false)}
              userId={profile.id}
              onViewFullStats={() => {
                setStatsOpen(false);
                setFullStatsOpen(true);
              }}
            />
            <StatsScreen
              open={fullStatsOpen}
              onClose={() => setFullStatsOpen(false)}
              userId={profile.id}
            />
            <PremiumModal
              open={premiumOpen}
              onClose={() => setPremiumOpen(false)}
            />
          </>
        )}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Game Screen
  // ─────────────────────────────────────────────────────────────────────────

  const phaseLabel: Record<GamePhase, string> = {
    waiting: playerCount < 1 ? "SETTING UP..." : "READY TO FOCUS",
    focus: "FOCUS TIME",
    celebration: "YOU MET!",
    break: "BREAK TIME",
    returning: "HEADING BACK...",
  };

  const showTimer = phase === "focus" || phase === "break";
  const canStart = playerCount >= 1 && !sessionStarted && phase === "waiting";
  const canStop = sessionStarted && phase !== "waiting";

  return (
    <div
      className="min-h-screen bg-gray-900 text-white flex flex-col"
      onClick={() => setProfileMenuOpen(false)}
    >
      {/* ── Top bar ── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 bg-gray-800/90 backdrop-blur border-b border-gray-700 z-10">
        {/* Left: Friends — right-aligned toward Duodoro */}
        <div className="flex items-center justify-end pr-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFriendsOpen((o) => !o);
              setNotesOpen(false);
              setStatsOpen(false);
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

        {/* Center: Duodoro + status dot — always dead center */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAppStep("home");
          }}
          className="flex flex-col items-center px-3 py-0.5 rounded-lg hover:bg-gray-700/50 transition-colors"
        >
          <span className="text-white font-black font-mono tracking-widest text-sm">
            Duodoro
          </span>
          <SessionStatusDot phase={phase} />
        </button>

        {/* Right: Notes, Stats, Account — left-aligned from Duodoro, Account pushed far right */}
        <div className="flex items-center gap-1.5 pl-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setNotesOpen((o) => !o);
              setFriendsOpen(false);
              setStatsOpen(false);
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
              setStatsOpen((o) => !o);
              setNotesOpen(false);
              setFriendsOpen(false);
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
                setProfileMenuOpen((o) => !o);
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
                  @{profile?.username}
                </p>
                <button
                  onClick={() => {
                    setAppStep("avatar");
                    setProfileMenuOpen(false);
                  }}
                  className="w-full text-left text-xs font-mono text-gray-400 hover:text-white py-1.5 transition-colors"
                >
                  {"✏️"} Edit character
                </button>
                {!isPremium && (
                  <button
                    onClick={() => {
                      setPremiumOpen(true);
                      setProfileMenuOpen(false);
                    }}
                    className="w-full text-left text-xs font-mono text-yellow-400 hover:text-yellow-300 py-1.5 transition-colors"
                  >
                    {"⭐"} Upgrade to Premium
                  </button>
                )}
                <button
                  onClick={async () => {
                    const { signOut } = await import("@/lib/supabase");
                    await signOut();
                    setProfileMenuOpen(false);
                  }}
                  className="w-full text-left text-xs font-mono text-gray-400 hover:text-red-400 py-1.5 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Game World (contained card) ── */}
      <div className="w-full max-w-3xl mx-auto px-3 pt-3">
        <div className="rounded-2xl overflow-hidden border border-gray-700/60 shadow-2xl">
          <GameWorld
            worldId={myWorld}
            phase={phase}
            focusProgress={focusProgress}
            returningProgress={returningProgress}
            me={{ id: myId, avatar: myAvatar }}
            partner={partner}
            myPet={myPet}
            partnerPet={null}
            myName={profile?.display_name ?? profile?.username}
            partnerName={partnerName}
          />
        </div>
      </div>

      {/* ── HUD ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-4">
        <div className="text-sm font-mono font-bold tracking-widest text-gray-400 uppercase">
          {phaseLabel[phase]}
        </div>

        {(phase === "focus" || phase === "break") && (
          <PhaseDots filled={phase === "focus" ? 4 : 0} />
        )}

        {showTimer && (
          <div className="text-6xl font-mono font-bold tracking-widest tabular-nums drop-shadow-lg">
            <span
              className={
                phase === "break" ? "text-blue-400" : "text-emerald-400"
              }
            >
              {formatTime(timeLeft)}
            </span>
          </div>
        )}

        {!sessionStarted && phase === "waiting" && (
          <div className="w-full max-w-xs space-y-2 mt-1">
            <DurationSlider
              label="FOCUS"
              value={focusDuration}
              onChange={setFocusDuration}
              min={5}
              max={120}
              step={5}
              unit="m"
            />
            <DurationSlider
              label="BREAK"
              value={breakDuration}
              onChange={setBreakDuration}
              min={1}
              max={30}
              step={1}
              unit="m"
            />
          </div>
        )}

        {phase === "waiting" && (
          <PetPicker
            selected={myPet}
            onSelect={setMyPet}
            isPremium={isPremium}
            onPremiumClick={() => setPremiumOpen(true)}
          />
        )}

        {/* Player indicators */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${playerCount >= 1 ? "bg-emerald-400" : "bg-gray-600"}`}
          />
          <span className="text-gray-600 text-xs font-mono">YOU</span>
          {playerCount >= 2 && (
            <>
              <div className="w-8 h-px bg-gray-700" />
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-gray-600 text-xs font-mono">PARTNER</span>
            </>
          )}
          {playerCount < 2 && phase === "waiting" && (
            <>
              <div className="w-8 h-px bg-gray-700" />
              <div className="w-2 h-2 rounded-full bg-gray-600" />
              <span className="text-gray-600 text-xs font-mono">
                WAITING...
              </span>
            </>
          )}
        </div>

        {/* Start / stop */}
        <div className="flex flex-col items-center gap-2">
          {canStart && (
            <button
              onClick={startSession}
              className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold px-10 py-3 rounded-full shadow-lg font-mono tracking-widest transition-all border-b-4 border-emerald-700 text-sm"
            >
              {"▶"} START{playerCount < 2 ? " SOLO" : " SESSION"}
            </button>
          )}
          {playerCount < 2 && phase === "waiting" && (
            <p className="text-gray-600 text-xs font-mono text-center">
              Friends can join from their dashboard
            </p>
          )}
          {canStop && (
            <button
              onClick={stopSession}
              className="text-gray-600 hover:text-red-400 text-xs font-mono transition-colors"
            >
              end session
            </button>
          )}
        </div>
      </div>

      {/* ── Leave session ── */}
      <div className="text-center pb-4">
        <button
          onClick={leaveSession}
          className="text-gray-700 hover:text-gray-400 text-xs font-mono transition-colors"
        >
          {"←"} leave session
        </button>
      </div>

      {/* ── Slide-in panels & modals ── */}
      {profile && (
        <>
          <FriendsPanel
            open={friendsOpen}
            onClose={() => setFriendsOpen(false)}
            myProfile={profile}
            onJoinSession={joinSession}
            onInviteFriend={() => {}}
          />
          <StickyNote
            open={notesOpen}
            onClose={() => setNotesOpen(false)}
            userId={profile.id}
            roomCode={sessionId || null}
          />
          <StatsPanel
            open={statsOpen}
            onClose={() => setStatsOpen(false)}
            userId={profile.id}
            onViewFullStats={() => {
              setStatsOpen(false);
              setFullStatsOpen(true);
            }}
          />
          <StatsScreen
            open={fullStatsOpen}
            onClose={() => setFullStatsOpen(false)}
            userId={profile.id}
          />
          <PremiumModal
            open={premiumOpen}
            onClose={() => setPremiumOpen(false)}
          />
        </>
      )}
    </div>
  );
}
