"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { GamePhase } from "@/components/GameWorld";
import type { AvatarConfig, WorldId } from "@/lib/avatarData";
import type { Profile, PetType } from "@/lib/types";
import type {
  PlayerData,
  SyncPayload,
  PhaseChangePayload,
  InviteData,
} from "@/lib/sessionTypes";
import { playSound } from "@/lib/sounds";
import { getSupabase } from "@/lib/supabase";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export type { InviteData };

export function useGameSession(profile: Profile | null) {
  // ── Avatar & world ──────────────────────────────────────────────────────
  const [myWorld, setMyWorld] = useState<WorldId>("forest");
  const [myPet, setMyPet] = useState<PetType | null>(null);

  // ── Session ─────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string>("");

  // ── Session config ──────────────────────────────────────────────────────
  const [timerMode, setTimerMode] = useState<"pomodoro" | "flow">("pomodoro");
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);

  // ── Game state ──────────────────────────────────────────────────────────
  const [serverMode, setServerMode] = useState<"pomodoro" | "flow">("pomodoro");
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [phaseStartTime, setPhaseStartTime] = useState<number | null>(null);
  const [serverFocusDuration, setServerFocusDuration] = useState(25 * 60);
  const [serverBreakDuration, setServerBreakDuration] = useState(5 * 60);
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [sessionStarted, setSessionStarted] = useState(false);

  // ── Connection ──────────────────────────────────────────────────────────
  const [myId, setMyId] = useState<string>("");
  const socketRef = useRef<Socket | null>(null);

  // ── Timer tick ──────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // ── UI state ────────────────────────────────────────────────────────────
  const [pendingInvite, setPendingInvite] = useState<InviteData | null>(null);
  const [inviteSentName, setInviteSentName] = useState<string | null>(null);

  // Pending outbound invite
  const pendingOutboundInvite = useRef<string | null>(null);

  // ── Sound tracking ─────────────────────────────────────────────────────
  const prevPhaseRef = useRef<GamePhase>("waiting");

  const sb = getSupabase();

  // ── Socket setup ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function connectSocket() {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (cancelled) return;

      const socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: { token: session?.access_token ?? "" },
      });
      socketRef.current = socket;

      socket.on("connect_error", async (err) => {
        if (
          err.message === "Invalid or expired token" ||
          err.message === "Authentication required"
        ) {
          const {
            data: { session: fresh },
          } = await sb.auth.getSession();
          if (fresh?.access_token) {
            socket.auth = { token: fresh.access_token };
          }
        }
      });

      socket.on("connect", () => {
        setMyId(socket.id ?? "");
      });

      socket.on(
        "session_created",
        ({ sessionId: sid }: { sessionId: string }) => {
          setSessionId(sid);
          const target = pendingOutboundInvite.current;
          if (target) {
            pendingOutboundInvite.current = null;
            socket.emit("send_invite", {
              targetUserId: target,
              sessionId: sid,
              worldId: myWorld,
              fromName:
                profile?.display_name ?? profile?.username ?? "Someone",
            });
          }
        },
      );

      socket.on("session_error", ({ message }: { message: string }) => {
        console.error("Session error:", message);
      });

      socket.on("sync_state", (data: SyncPayload) => {
        if (data.mode) setServerMode(data.mode);
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
        if (data.mode) setServerMode(data.mode);
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

      socket.on("session_invite", (data: InviteData) => {
        setPendingInvite(data);
      });

      socket.on("invite_error", ({ message }: { message: string }) => {
        setInviteSentName(null);
        console.warn("Invite error:", message);
      });
    }

    connectSocket();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, []);

  // ── Register presence ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !profile?.id) return;
    if (socket.connected) {
      socket.emit("register_user", {});
    }
    const onConnect = () => {
      socket.emit("register_user", {});
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [profile?.id]);

  // ── Sound effects on phase transitions ──────────────────────────────────
  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    if (phase === "focus") playSound("session-start");
    if (phase === "celebration") playSound("victory");
    if (phase === "break") playSound("break-start");
    prevPhaseRef.current = phase;
  }, [phase]);

  // ── Derived values ──────────────────────────────────────────────────────
  const currentPhaseDuration =
    phase === "focus" ? serverFocusDuration : serverBreakDuration;

  const timeLeft = phaseStartTime
    ? Math.max(0, currentPhaseDuration - (now - phaseStartTime) / 1000)
    : currentPhaseDuration;

  const flowElapsed = phaseStartTime
    ? Math.max(0, (now - phaseStartTime) / 1000)
    : 0;

  const focusProgress =
    phase === "focus" && phaseStartTime
      ? serverMode === "flow"
        ? Math.min(1, flowElapsed / (120 * 60))
        : Math.min(1, (now - phaseStartTime) / (serverFocusDuration * 1000))
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

  // ── Session actions ─────────────────────────────────────────────────────
  const createSession = useCallback(
    (world: WorldId, avatar: AvatarConfig) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (sessionId) {
        socket.emit("leave_session", { sessionId });
        setSessionStarted(false);
        setPhase("waiting");
        setPlayers({});
        setSessionId("");
      }
      setMyWorld(world);
      socket.emit("create_session", {
        avatar,
        world,
        displayName: profile?.display_name ?? profile?.username ?? "Player",
      });
    },
    [profile, sessionId],
  );

  const joinSession = useCallback(
    (sid: string, avatar: AvatarConfig) => {
      const socket = socketRef.current;
      if (!socket) return;
      setSessionId(sid);
      socket.emit("join_session", {
        sessionId: sid,
        avatar,
        displayName: profile?.display_name ?? profile?.username ?? "Player",
      });
    },
    [profile],
  );

  const leaveSession = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("leave_session", { sessionId });
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
      mode: timerMode,
    });
    playSound("click");
  }, [sessionId, focusDuration, breakDuration, timerMode]);

  const finishFlowFocus = useCallback(() => {
    socketRef.current?.emit("finish_flow_focus", { sessionId });
    playSound("click");
  }, [sessionId]);

  const stopSession = useCallback(() => {
    socketRef.current?.emit("stop_session", { sessionId });
    setSessionStarted(false);
    playSound("click");
  }, [sessionId]);

  const sendInvite = useCallback(
    (targetUserId: string, avatar: AvatarConfig) => {
      const socket = socketRef.current;
      if (!socket) return;

      setInviteSentName(targetUserId);
      setTimeout(() => setInviteSentName(null), 2500);

      if (sessionId) {
        socket.emit("send_invite", {
          targetUserId,
          sessionId,
          worldId: myWorld,
          fromName: profile?.display_name ?? profile?.username ?? "Someone",
        });
      } else {
        pendingOutboundInvite.current = targetUserId;
        socket.emit("create_session", {
          avatar,
          world: myWorld,
          displayName: profile?.display_name ?? profile?.username ?? "Player",
        });
      }
    },
    [sessionId, myWorld, profile],
  );

  const dismissInvite = useCallback(() => setPendingInvite(null), []);

  return {
    // World & pet
    myWorld,
    setMyWorld,
    myPet,
    setMyPet,
    // Session config
    timerMode,
    setTimerMode,
    focusDuration,
    setFocusDuration,
    breakDuration,
    setBreakDuration,
    // Game state
    serverMode,
    phase,
    sessionStarted,
    myId,
    socketRef,
    // Derived
    timeLeft,
    flowElapsed,
    focusProgress,
    returningProgress,
    partner,
    partnerName,
    playerCount,
    // Session actions
    sessionId,
    createSession,
    joinSession,
    leaveSession,
    startSession,
    finishFlowFocus,
    stopSession,
    sendInvite,
    // Invite state
    pendingInvite,
    dismissInvite,
    inviteSentName,
  };
}
