"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import AvatarCreator from "./AvatarCreator";
import WorldPicker from "./WorldPicker";
import GameWorld, { type GamePhase } from "./GameWorld";
import { playSound } from "@/lib/sounds";
import { DEFAULT_AVATAR, type AvatarConfig, type WorldId } from "@/lib/avatarData";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppStep = "avatar" | "world" | "room" | "game";

interface PlayerData {
  avatar: AvatarConfig;
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
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
        style={{ boxShadow: connected ? "0 0 6px #34d399" : "0 0 6px #f87171" }}
      />
      <span className="text-xs text-gray-400 font-mono">
        {connected ? "connected" : "disconnected"}
      </span>
    </div>
  );
}

function DurationPicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: number[];
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-gray-400 text-xs font-mono">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2 py-1 rounded text-xs font-mono font-bold transition-all ${
              value === opt
                ? "bg-emerald-500 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {opt}m
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DuoTimer() {
  // ── App flow ──────────────────────────────────────────────────────────────
  const [appStep, setAppStep] = useState<AppStep>("avatar");
  const [myAvatar, setMyAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [myWorld, setMyWorld] = useState<WorldId>("forest");
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");

  // ── Session config ────────────────────────────────────────────────────────
  const [focusDuration, setFocusDuration] = useState(25); // minutes
  const [breakDuration, setBreakDuration] = useState(5);  // minutes

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [phaseStartTime, setPhaseStartTime] = useState<number | null>(null);
  const [serverFocusDuration, setServerFocusDuration] = useState(25 * 60); // seconds
  const [serverBreakDuration, setServerBreakDuration] = useState(5 * 60);  // seconds
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [sessionStarted, setSessionStarted] = useState(false);

  // ── Connection ────────────────────────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);
  const [myId, setMyId] = useState<string>("");
  const socketRef = useRef<Socket | null>(null);

  // ── Timer tick — drives Date.now() re-evaluation every 500ms ─────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // ── Sound tracking ────────────────────────────────────────────────────────
  const prevPhaseRef = useRef<GamePhase>("waiting");

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
      // If we were in a room, re-join on reconnect
      if (roomCode) {
        socket.emit("join_room", { roomCode, avatar: myAvatar, world: myWorld });
      }
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("sync_state", (data: SyncPayload) => {
      setPhase(data.phase);
      setPhaseStartTime(data.phaseStartTime);
      setServerFocusDuration(data.focusDuration);
      setServerBreakDuration(data.breakDuration);
      setPlayers(data.players || {});
      if (data.phase !== "waiting") setSessionStarted(true);
    });

    socket.on("phase_change", (data: PhaseChangePayload) => {
      setPhase(data.phase);
      setPhaseStartTime(data.phaseStartTime);
      setServerFocusDuration(data.focusDuration);
      setServerBreakDuration(data.breakDuration);
      if (data.phase !== "waiting") setSessionStarted(true);
    });

    socket.on("player_joined", ({ playerId, avatar }: { playerId: string; avatar: AvatarConfig }) => {
      setPlayers((prev) => ({ ...prev, [playerId]: { avatar } }));
    });

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

  const playerCount = Object.keys(players).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  const joinRoom = useCallback(
    (code: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      setRoomCode(code);
      setAppStep("game");
      socket.emit("join_room", { roomCode: code, avatar: myAvatar, world: myWorld });
    },
    [myAvatar, myWorld]
  );

  const startSession = useCallback(() => {
    socketRef.current?.emit("start_session", {
      roomCode,
      focusDuration,
      breakDuration,
    });
    playSound("click");
  }, [roomCode, focusDuration, breakDuration]);

  const stopSession = useCallback(() => {
    socketRef.current?.emit("stop_session", roomCode);
    setSessionStarted(false);
    playSound("click");
  }, [roomCode]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render: App Steps
  // ─────────────────────────────────────────────────────────────────────────

  if (appStep === "avatar") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <AvatarCreator
          onSave={(config) => {
            setMyAvatar(config);
            setAppStep("world");
          }}
        />
      </div>
    );
  }

  if (appStep === "world") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <WorldPicker
          onSelect={(world) => {
            setMyWorld(world);
            setAppStep("room");
          }}
          onBack={() => setAppStep("avatar")}
        />
      </div>
    );
  }

  if (appStep === "room") {
    const generated = generateRoomCode();
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-8 w-full max-w-md">
          <div>
            <h1 className="text-3xl font-bold text-center text-white font-mono tracking-widest">
              DuoFocus
            </h1>
            <p className="text-gray-400 text-center text-sm mt-1">
              Almost there — share your room code!
            </p>
          </div>

          <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl border border-gray-700 w-full space-y-6">
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
            onClick={() => setAppStep("world")}
            className="text-gray-400 hover:text-white text-sm font-mono transition-colors"
          >
            ← Back to world
          </button>
        </div>
      </div>
    );
  }

  // ── Game Screen ────────────────────────────────────────────────────────

  const phaseLabel: Record<GamePhase, string> = {
    waiting:     "WAITING FOR PARTNER",
    focus:       "FOCUS TIME",
    celebration: "YOU MET! ❤️",
    break:       "BREAK TIME",
    returning:   "HEADING BACK...",
  };

  const showTimer = phase === "focus" || phase === "break";
  const canStart = playerCount >= 2 && !sessionStarted && phase === "waiting";
  const canStop = sessionStarted && phase !== "waiting";

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 backdrop-blur border-b border-gray-700">
        <div>
          <span className="text-xs font-mono text-gray-400">ROOM </span>
          <span className="text-sm font-mono font-bold text-emerald-400">{roomCode}</span>
        </div>
        <ConnectionDot connected={isConnected} />
      </div>

      {/* ── Game World ── */}
      <GameWorld
        worldId={myWorld}
        phase={phase}
        focusProgress={focusProgress}
        returningProgress={returningProgress}
        me={{ id: myId, avatar: myAvatar }}
        partner={partner}
      />

      {/* ── HUD ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        {/* Phase label */}
        <div className="text-lg font-mono font-bold tracking-widest text-gray-300">
          {phaseLabel[phase]}
        </div>

        {/* Timer */}
        {showTimer && (
          <div className="text-6xl font-mono font-bold tracking-widest tabular-nums drop-shadow-lg">
            <span className={phase === "break" ? "text-blue-400" : "text-emerald-400"}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}

        {/* Partner count indicator */}
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-2 h-2 rounded-full ${playerCount >= 1 ? "bg-emerald-400" : "bg-gray-600"}`} />
          <span className="text-gray-400 text-xs font-mono">YOU</span>
          <div className="w-8 h-px bg-gray-700" />
          <div className={`w-2 h-2 rounded-full ${playerCount >= 2 ? "bg-emerald-400" : "bg-gray-600"}`} />
          <span className="text-gray-400 text-xs font-mono">
            {partner ? "PARTNER CONNECTED" : "WAITING FOR PARTNER"}
          </span>
        </div>

        {/* Session controls — shown before starting */}
        {!sessionStarted && phase === "waiting" && (
          <div className="flex gap-6 mt-2">
            <DurationPicker
              label="FOCUS"
              value={focusDuration}
              onChange={setFocusDuration}
              options={[15, 25, 45, 60]}
            />
            <DurationPicker
              label="BREAK"
              value={breakDuration}
              onChange={setBreakDuration}
              options={[5, 10, 15]}
            />
          </div>
        )}

        {/* Start / stop buttons */}
        <div className="flex gap-3 mt-2">
          {canStart && (
            <button
              onClick={startSession}
              className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold px-8 py-3 rounded-full shadow-lg font-mono tracking-widest transition-all border-b-4 border-emerald-700"
            >
              START SESSION
            </button>
          )}
          {playerCount < 2 && phase === "waiting" && (
            <p className="text-gray-500 text-sm font-mono text-center">
              Share code <span className="text-emerald-400 font-bold">{roomCode}</span> with your partner
            </p>
          )}
          {canStop && (
            <button
              onClick={stopSession}
              className="text-gray-500 hover:text-red-400 text-xs font-mono transition-colors mt-2"
            >
              end session
            </button>
          )}
        </div>
      </div>

      {/* ── Leave room ── */}
      <div className="text-center pb-4">
        <button
          onClick={() => {
            socketRef.current?.emit("stop_session", roomCode);
            setAppStep("room");
            setSessionStarted(false);
            setPhase("waiting");
            setPlayers({});
          }}
          className="text-gray-600 hover:text-gray-400 text-xs font-mono transition-colors"
        >
          ← leave room
        </button>
      </div>
    </div>
  );
}
