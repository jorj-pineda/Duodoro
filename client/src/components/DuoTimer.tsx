"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import AvatarCreator from "./AvatarCreator";
import GameWorld, { type GamePhase } from "./GameWorld";
import LandingPage from "./LandingPage";
import FriendsPanel from "./FriendsPanel";
import StickyNote from "./StickyNote";
import PremiumModal from "./PremiumModal";
import { playSound } from "@/lib/sounds";
import { DEFAULT_AVATAR, WORLDS, type AvatarConfig, type WorldId } from "@/lib/avatarData";
import { getSupabase } from "@/lib/supabase";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { Profile, PetType } from "@/lib/types";
import { PET_OPTIONS } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppStep = "loading" | "landing" | "avatar" | "room" | "game";

interface PlayerData {
  avatar: AvatarConfig;
  displayName?: string;
}

interface SyncPayload {
  phase: GamePhase;
  focusDuration: number;   // seconds
  breakDuration: number;   // seconds
  phaseStartTime: number | null;
  world: string;
  players: Record<string, PlayerData>;
  playerCount: number;
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

function generateRoomCode(): string {
  const words = ["MOON", "STAR", "ROSE", "WAVE", "LEAF", "FIRE", "SNOW", "TIDE"];
  const nums = Math.floor(Math.random() * 900 + 100);
  return words[Math.floor(Math.random() * words.length)] + nums;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <div
      className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-emerald-400" : "bg-red-400"}`}
      style={{ boxShadow: connected ? "0 0 6px #34d399" : "0 0 6px #f87171" }}
      title={connected ? "Connected" : "Disconnected"}
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
      <span className="text-gray-500 text-xs font-mono w-14 text-right shrink-0">{label}</span>
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
        {value}{unit}
      </span>
    </div>
  );
}

function PhaseDots({ filled = 0, total = 7 }: { filled?: number; total?: number }) {
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
        onClick={() => isPremium ? onSelect(null) : onPremiumClick()}
        className={`w-7 h-7 rounded-full border text-xs flex items-center justify-center transition-all ${
          selected === null
            ? "border-gray-500 bg-gray-700 text-gray-300"
            : "border-gray-700 bg-gray-800 text-gray-600 hover:border-gray-600"
        }`}
        title="No pet"
      >
        ✕
      </button>
      {PET_OPTIONS.map(({ type, emoji, label }) => (
        <button
          key={type}
          onClick={() => isPremium ? onSelect(type) : onPremiumClick()}
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

  // ── Room ──────────────────────────────────────────────────────────────────
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");

  // ── Session config ────────────────────────────────────────────────────────
  const [focusDuration, setFocusDuration] = useState(25); // minutes
  const [breakDuration, setBreakDuration] = useState(5);  // minutes

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [phaseStartTime, setPhaseStartTime] = useState<number | null>(null);
  const [serverFocusDuration, setServerFocusDuration] = useState(25 * 60);
  const [serverBreakDuration, setServerBreakDuration] = useState(5 * 60);
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [sessionStarted, setSessionStarted] = useState(false);

  // ── Connection ────────────────────────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);
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

  // ── Sound tracking ────────────────────────────────────────────────────────
  const prevPhaseRef = useRef<GamePhase>("waiting");

  const sb = getSupabase();

  // ─────────────────────────────────────────────────────────────────────────
  // Auth init
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    let sessionHandled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Fallback: if nothing resolves within the window, go to landing
    const hasOAuthCode = window.location.search.includes("code=");
    timeoutId = setTimeout(() => {
      if (mounted) setAppStep("landing");
    }, hasOAuthCode ? 20000 : 8000);

    // Build a provisional profile from OAuth metadata immediately — no DB query needed
    const profileFromSession = (session: Session): Profile => {
      const { id, user_metadata, email } = session.user;
      const raw = (
        user_metadata?.preferred_username ||
        user_metadata?.user_name ||
        (email ?? "").split("@")[0] ||
        "user"
      ).replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "user";
      return {
        id,
        username: raw,
        display_name: user_metadata?.full_name ?? user_metadata?.name ?? raw,
        avatar_config: null,
        is_premium: false,
        current_room: null,
        updated_at: new Date().toISOString(),
      };
    };

    // Called as soon as we have a confirmed session.
    // Waits up to 4s for the DB profile so returning users skip the avatar creator.
    // Falls back to the avatar creator if DB is unavailable.
    const handleSession = async (session: Session) => {
      if (sessionHandled) return; // prevent duplicate calls from loadUser + onAuthStateChange
      sessionHandled = true;
      clearTimeout(timeoutId);
      if (!mounted) return;

      try {
        // Wait for DB (4s timeout) before navigating so returning users don't see a flash
        const result = await Promise.race([
          sb.from("profiles").select("*").eq("id", session.user.id).single(),
          new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 4000)
          ),
        ]);
        if (!mounted) return;

        if (result.data) {
          const dbProf = result.data as Profile;
          if (window.location.search.includes("code=")) {
            window.history.replaceState({}, "", window.location.pathname);
          }
          setProfile(dbProf);
          if (dbProf.avatar_config) {
            setMyAvatar(dbProf.avatar_config);
            setAppStep("room");
          } else {
            setAppStep("avatar");
          }
        } else {
          // DB timeout — use provisional and send to avatar creator
          const provisional = profileFromSession(session);
          if (window.location.search.includes("code=")) {
            window.history.replaceState({}, "", window.location.pathname);
          }
          setProfile(provisional);
          setAppStep("avatar");
          // Fire-and-forget upsert so the row exists for next login
          sb.from("profiles").upsert({
            id: provisional.id,
            username: provisional.username + "_" + provisional.id.slice(0, 4),
            display_name: provisional.display_name,
          }).then(() => {});
        }
      } catch {
        const provisional = profileFromSession(session);
        if (window.location.search.includes("code=")) {
          window.history.replaceState({}, "", window.location.pathname);
        }
        setProfile(provisional);
        setAppStep("avatar");
      }
    };

    const loadUser = async () => {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!mounted) return;
        if (!session) {
          // PKCE exchange still in progress if code= is in URL; wait for onAuthStateChange
          if (!window.location.search.includes("code=")) setAppStep("landing");
          return;
        }
        await handleSession(session);
      } catch {
        if (mounted) setAppStep("landing");
      }
    };

    loadUser();

    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        // Handle both SIGNED_IN (normal) and INITIAL_SESSION (already signed in on subscribe)
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
          await handleSession(session);
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          setAppStep("landing");
        }
      }
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
      setIsConnected(true);
      setMyId(socket.id ?? "");
      if (roomCode) {
        socket.emit("join_room", { roomCode, avatar: myAvatar, world: myWorld, displayName: profile?.display_name ?? profile?.username ?? "Player" });
      }
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("sync_state", (data: SyncPayload) => {
      setPhase(data.phase);
      setPhaseStartTime(data.phaseStartTime);
      setServerFocusDuration(data.focusDuration);
      setServerBreakDuration(data.breakDuration);
      setPlayers(data.players || {});
      if (data.world) setMyWorld(data.world as WorldId);
      if (data.phase !== "waiting") setSessionStarted(true);
    });

    socket.on("phase_change", (data: PhaseChangePayload) => {
      setPhase(data.phase);
      setPhaseStartTime(data.phaseStartTime);
      setServerFocusDuration(data.focusDuration);
      setServerBreakDuration(data.breakDuration);
      if (data.phase !== "waiting") setSessionStarted(true);
    });

    socket.on("player_joined", ({ playerId, avatar, displayName }: { playerId: string; avatar: AvatarConfig; displayName?: string }) => {
      setPlayers((prev) => ({ ...prev, [playerId]: { avatar, displayName } }));
    });

    socket.on("player_left", ({ playerId }: { playerId: string }) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    await sb.from("profiles").update({ avatar_config: config }).eq("id", profile.id);
    setMyAvatar(config);
    setProfile((p) => p ? { ...p, avatar_config: config } : p);
  };

  const writeCurrentRoom = async (code: string) => {
    if (!profile) return;
    await sb.from("profiles").update({ current_room: code }).eq("id", profile.id);
    setProfile((p) => p ? { ...p, current_room: code } : p);
  };

  const clearCurrentRoom = async () => {
    if (!profile) return;
    await sb.from("profiles").update({ current_room: null }).eq("id", profile.id);
    setProfile((p) => p ? { ...p, current_room: null } : p);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Room actions
  // ─────────────────────────────────────────────────────────────────────────

  const joinRoom = useCallback(
    async (code: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      setRoomCode(code);
      setAppStep("game");
      socket.emit("join_room", {
        roomCode: code,
        avatar: myAvatar,
        world: myWorld,
        displayName: profile?.display_name ?? profile?.username ?? "Player",
      });
      await writeCurrentRoom(code);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myAvatar, myWorld, profile]
  );

  const leaveRoom = useCallback(async () => {
    socketRef.current?.emit("stop_session", roomCode);
    await clearCurrentRoom();
    setAppStep("room");
    setSessionStarted(false);
    setPhase("waiting");
    setPlayers({});
    setRoomCode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, profile]);

  const startSession = useCallback(() => {
    socketRef.current?.emit("start_session", {
      roomCode,
      focusDuration: focusDuration * 60,
      breakDuration: breakDuration * 60,
    });
    playSound("click");
  }, [roomCode, focusDuration, breakDuration]);

  const stopSession = useCallback(() => {
    socketRef.current?.emit("stop_session", roomCode);
    setSessionStarted(false);
    playSound("click");
  }, [roomCode]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Loading
  // ─────────────────────────────────────────────────────────────────────────

  if (appStep === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="text-4xl font-black font-mono text-white tracking-widest">Duodoro</div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-gray-600 text-xs font-mono">signing you in...</span>
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
          onBack={isEditing ? () => setAppStep("room") : undefined}
          onSave={async (config, name) => {
            await saveAvatar(config);
            if (name && profile) {
              await sb.from("profiles").update({ display_name: name }).eq("id", profile.id);
              setProfile((p) => p ? { ...p, display_name: name } : p);
            }
            setAppStep("room");
          }}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Room screen
  // ─────────────────────────────────────────────────────────────────────────

  const isPremium = profile?.is_premium ?? false;
  const displayName = profile?.display_name ?? profile?.username ?? "You";
  const initial = displayName.charAt(0).toUpperCase();

  // Stable room code that only changes when the room screen mounts fresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generated = useMemo(() => generateRoomCode(), [appStep === "room"]);

  if (appStep === "room") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col" onClick={() => setProfileMenuOpen(false)}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 border-b border-gray-700">
          <span className="text-white font-black font-mono tracking-widest text-lg">Duodoro</span>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); setFriendsOpen(true); }}
              className="text-gray-400 hover:text-white text-sm font-mono transition-colors flex items-center gap-1.5"
            >
              👥 <span className="hidden sm:inline text-xs">Friends</span>
            </button>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setProfileMenuOpen((o) => !o); }}
                className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-sm font-bold hover:bg-emerald-500/30 transition-colors"
              >
                {initial}
              </button>
              {profileMenuOpen && (
                <div className="absolute top-10 right-0 z-50 bg-gray-800 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-44" onClick={(e) => e.stopPropagation()}>
                  <p className="text-white font-bold text-sm mb-0.5">{displayName}</p>
                  <p className="text-gray-500 text-xs font-mono mb-3">@{profile?.username}</p>
                  <button
                    onClick={() => { setAppStep("avatar"); setProfileMenuOpen(false); }}
                    className="w-full text-left text-xs font-mono text-gray-400 hover:text-white py-1.5 transition-colors"
                  >
                    ✏️ Edit character
                  </button>
                  {!isPremium && (
                    <button
                      onClick={() => { setPremiumOpen(true); setProfileMenuOpen(false); }}
                      className="w-full text-left text-xs font-mono text-yellow-400 hover:text-yellow-300 py-1.5 transition-colors"
                    >
                      ⭐ Upgrade to Premium
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

        {/* Room content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-8 w-full max-w-md">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white font-mono tracking-widest">Duodoro</h1>
              <p className="text-gray-400 text-sm mt-1">
                Welcome back, {displayName}! Ready to focus together?
              </p>
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl border border-gray-700 w-full space-y-6">
              {/* World picker */}
              <div>
                <p className="text-gray-400 text-xs font-mono mb-2">CHOOSE WORLD</p>
                <div className="flex gap-2">
                  {WORLDS.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setMyWorld(w.id as WorldId)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-mono transition-all ${
                        myWorld === w.id
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : "border-gray-600 bg-gray-900 text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      {w.emoji} {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Create room */}
              <div>
                <p className="text-gray-400 text-xs font-mono mb-2">CREATE A ROOM</p>
                <div className="bg-gray-900 rounded-xl px-4 py-3 flex items-center justify-between border border-gray-600">
                  <span className="font-mono text-xl font-bold text-emerald-400 tracking-widest">
                    {generated}
                  </span>
                  <button
                    onClick={() => joinRoom(generated)}
                    className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold px-4 py-2 rounded-lg font-mono text-sm transition-all"
                  >
                    CREATE
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-gray-500 text-xs font-mono">OR JOIN</span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>

              {/* Join room */}
              <div>
                <p className="text-gray-400 text-xs font-mono mb-2">JOIN A ROOM</p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-4 py-2 bg-gray-900 border border-gray-600 rounded-xl text-white font-mono uppercase placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                    placeholder="Enter code..."
                    maxLength={8}
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && roomInput && joinRoom(roomInput)}
                  />
                  <button
                    onClick={() => roomInput && joinRoom(roomInput)}
                    disabled={!roomInput}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 active:scale-95 text-white font-bold px-4 py-2 rounded-xl font-mono transition-all"
                  >
                    JOIN
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setAppStep("avatar")}
              className="text-gray-400 hover:text-white text-sm font-mono transition-colors"
            >
              ← Edit avatar
            </button>
          </div>
        </div>

        {/* Panels */}
        {profile && (
          <>
            <FriendsPanel
              open={friendsOpen}
              onClose={() => setFriendsOpen(false)}
              myProfile={profile}
              onJoinRoom={joinRoom}
              onInviteFriend={(_friendId) => {
                const code = generateRoomCode();
                sb.from("profiles").update({ current_room: code }).eq("id", profile.id);
                return code;
              }}
            />
            <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} />
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Game Screen
  // ─────────────────────────────────────────────────────────────────────────

  const phaseLabel: Record<GamePhase, string> = {
    waiting:     "WAITING FOR PARTNER",
    focus:       "FOCUS TIME ⏰",
    celebration: "YOU MET! ❤️",
    break:       "BREAK TIME 🎮",
    returning:   "HEADING BACK...",
  };

  const showTimer = phase === "focus" || phase === "break";
  const canStart = playerCount >= 2 && !sessionStarted && phase === "waiting";
  const canStop = sessionStarted && phase !== "waiting";

  return (
    <div
      className="min-h-screen bg-gray-900 text-white flex flex-col"
      onClick={() => setProfileMenuOpen(false)}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/90 backdrop-blur border-b border-gray-700 z-10">
        <div className="flex items-center gap-2.5">
          <span className="text-white font-black font-mono tracking-widest text-sm">Duodoro</span>
          <ConnectionDot connected={isConnected} />
        </div>
        <div className="flex items-center gap-1.5">
          {/* Friends */}
          <button
            onClick={(e) => { e.stopPropagation(); setFriendsOpen((o) => !o); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              friendsOpen ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            👥 <span className="hidden sm:inline">Friends</span>
          </button>
          {/* Notes */}
          <button
            onClick={(e) => { e.stopPropagation(); setNotesOpen((o) => !o); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              notesOpen ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            📝 <span className="hidden sm:inline">Notes</span>
          </button>
          {/* Profile */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setProfileMenuOpen((o) => !o); }}
              className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-colors ml-1"
            >
              {initial}
            </button>
            {profileMenuOpen && (
              <div
                className="absolute top-9 right-0 z-50 bg-gray-800 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-44"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-white font-bold text-sm mb-0.5">{displayName}</p>
                <p className="text-gray-500 text-xs font-mono mb-3">@{profile?.username}</p>
                <button
                  onClick={() => { setAppStep("avatar"); setProfileMenuOpen(false); }}
                  className="w-full text-left text-xs font-mono text-gray-400 hover:text-white py-1.5 transition-colors"
                >
                  ✏️ Edit character
                </button>
                {!isPremium && (
                  <button
                    onClick={() => { setPremiumOpen(true); setProfileMenuOpen(false); }}
                    className="w-full text-left text-xs font-mono text-yellow-400 hover:text-yellow-300 py-1.5 transition-colors"
                  >
                    ⭐ Upgrade to Premium
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
        {/* Phase label */}
        <div className="text-sm font-mono font-bold tracking-widest text-gray-400 uppercase">
          {phaseLabel[phase]}
        </div>

        {/* Phase dots */}
        {(phase === "focus" || phase === "break") && (
          <PhaseDots filled={phase === "focus" ? 4 : 0} />
        )}

        {/* Timer */}
        {showTimer && (
          <div className="text-6xl font-mono font-bold tracking-widest tabular-nums drop-shadow-lg">
            <span className={phase === "break" ? "text-blue-400" : "text-emerald-400"}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}

        {/* Duration sliders — before session starts */}
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

        {/* Pet picker */}
        {phase === "waiting" && (
          <PetPicker
            selected={myPet}
            onSelect={setMyPet}
            isPremium={isPremium}
            onPremiumClick={() => setPremiumOpen(true)}
          />
        )}

        {/* Partner connection dots */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${playerCount >= 1 ? "bg-emerald-400" : "bg-gray-600"}`} />
          <span className="text-gray-600 text-xs font-mono">YOU</span>
          <div className="w-8 h-px bg-gray-700" />
          <div className={`w-2 h-2 rounded-full ${playerCount >= 2 ? "bg-emerald-400" : "bg-gray-600"}`} />
          <span className="text-gray-600 text-xs font-mono">
            {partner ? "PARTNER" : "WAITING..."}
          </span>
        </div>

        {/* Start / stop */}
        <div className="flex flex-col items-center gap-2">
          {canStart && (
            <button
              onClick={startSession}
              className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold px-10 py-3 rounded-full shadow-lg font-mono tracking-widest transition-all border-b-4 border-emerald-700 text-sm"
            >
              ▶ START SESSION
            </button>
          )}
          {playerCount < 2 && phase === "waiting" && (
            <p className="text-gray-600 text-xs font-mono text-center">
              Share <span className="text-emerald-400 font-bold">{roomCode}</span> with your partner
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

      {/* ── Leave room ── */}
      <div className="text-center pb-4">
        <button
          onClick={leaveRoom}
          className="text-gray-700 hover:text-gray-400 text-xs font-mono transition-colors"
        >
          ← leave room
        </button>
      </div>

      {/* ── Slide-in panels & modals ── */}
      {profile && (
        <>
          <FriendsPanel
            open={friendsOpen}
            onClose={() => setFriendsOpen(false)}
            myProfile={profile}
            onJoinRoom={joinRoom}
            onInviteFriend={(_friendId) => {
              const code = generateRoomCode();
              sb.from("profiles").update({ current_room: code }).eq("id", profile.id);
              return code;
            }}
          />
          <StickyNote
            open={notesOpen}
            onClose={() => setNotesOpen(false)}
            userId={profile.id}
            roomCode={roomCode}
          />
          <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} />
        </>
      )}
    </div>
  );
}
