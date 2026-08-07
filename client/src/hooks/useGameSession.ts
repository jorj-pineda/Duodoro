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

// sessionStorage key mirroring the active session id, so a full page reload
// can silently rejoin within the server's reconnect grace window.
const RESUME_KEY = "duodoro:session";

export type { InviteData };

export function useGameSession(profile: Profile | null) {
  // ── Avatar & world ──────────────────────────────────────────────────────
  const [myWorld, setMyWorld] = useState<WorldId>("forest");
  const [myPet, setMyPetState] = useState<PetType | null>(null);
  // Ref mirror so reconnect/rejoin (registered once) sees the current pet
  const myPetRef = useRef<PetType | null>(null);

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
  // "reconnecting" = socket.io is retrying and the server is likely still
  // holding our slot; "offline" = retries exhausted, the session is gone.
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "reconnecting" | "offline"
  >("connecting");

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

  // ── Resume-sync snapshot ────────────────────────────────────────────────
  // Mirrors the current session membership so we can re-join after a mobile
  // tab resume closes the WebSocket. The server removes the player on
  // disconnect, so without these we can't re-enter silently.
  const sessionIdRef = useRef<string>("");
  const lastAvatarRef = useRef<AvatarConfig | null>(null);
  const lastDisplayNameRef = useRef<string>("Player");
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // ── Refresh resume ──────────────────────────────────────────────────────
  // A reload wipes React state but the server holds the player's spot during
  // its reconnect grace window; the stored id lets DuoTimer rejoin silently.
  // sessionStorage scopes this to the tab — a fresh tab starts clean.
  // Lazy init: only rendered on the client after hydration effects, and no
  // DOM output depends on it, so reading storage here is hydration-safe.
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sessionStorage.getItem(RESUME_KEY),
  );
  useEffect(() => {
    if (sessionId) sessionStorage.setItem(RESUME_KEY, sessionId);
  }, [sessionId]);
  const consumeResumeSession = useCallback(
    () => setResumeSessionId(null),
    [],
  );

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
        setConnectionState("connected");
      });

      // socket.io retries automatically; the server holds our player slot for
      // its grace window, so this is recoverable until retries run out.
      socket.on("disconnect", () => setConnectionState("reconnecting"));
      socket.io.on("reconnect_failed", () => setConnectionState("offline"));

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
        if (message === "Session not found") {
          // Stale resume attempt or expired invite — the server has already
          // removed us from any previous session, so mirror that here
          sessionStorage.removeItem(RESUME_KEY);
          setResumeSessionId(null);
          setSessionId("");
          setSessionStarted(false);
          setPlayers({});
        }
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
        // Mirror the phase in both directions. Only ever setting this to true
        // left the *other* player stuck after someone pressed end-session:
        // phase went back to "waiting" but sessionStarted stayed true, which
        // makes both canStart and canStop false in SessionHUD — no Start
        // button, no mode toggle, no sliders, only "leave session".
        setSessionStarted(data.phase !== "waiting");
      });

      socket.on("phase_change", (data: PhaseChangePayload) => {
        if (data.mode) setServerMode(data.mode);
        setPhase(data.phase);
        setPhaseStartTime(data.phaseStartTime);
        setServerFocusDuration(data.focusDuration);
        setServerBreakDuration(data.breakDuration);
        setSessionStarted(data.phase !== "waiting");
      });

      socket.on(
        "player_joined",
        ({
          playerId,
          avatar,
          displayName,
          pet,
        }: {
          playerId: string;
          avatar: AvatarConfig;
          displayName?: string;
          pet?: PetType | null;
        }) => {
          setPlayers((prev) => ({
            ...prev,
            [playerId]: { avatar, displayName, pet: pet ?? null },
          }));
        },
      );

      socket.on(
        "pet_changed",
        ({ playerId, pet }: { playerId: string; pet: PetType | null }) => {
          setPlayers((prev) =>
            prev[playerId]
              ? { ...prev, [playerId]: { ...prev[playerId], pet } }
              : prev,
          );
        },
      );

      // Partner's socket dropped; the server is holding their spot during
      // the reconnect grace window (player_joined or player_left follows).
      socket.on(
        "player_disconnected",
        ({ playerId }: { playerId: string }) => {
          setPlayers((prev) =>
            prev[playerId]
              ? {
                  ...prev,
                  [playerId]: { ...prev[playerId], disconnected: true },
                }
              : prev,
          );
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

  // ── Resume sync: rejoin on reconnect, request sync on tab wake ──────────
  // Mobile browsers (esp. iOS Safari) close backgrounded WebSockets after
  // ~30s. The server removes the player on disconnect, so on reconnect we
  // re-emit join_session with the cached avatar so the new socket lands
  // back inside the same session. When the tab just loses focus without
  // disconnecting, request_sync refreshes phase/state in case we drifted.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const rejoinIfNeeded = () => {
      const sid = sessionIdRef.current;
      const avatar = lastAvatarRef.current;
      if (!sid || !avatar) return;
      socket.emit("join_session", {
        sessionId: sid,
        avatar,
        displayName: lastDisplayNameRef.current,
        pet: myPetRef.current,
      });
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!sessionIdRef.current) return;
      if (socket.connected) {
        socket.emit("request_sync");
      }
    };

    socket.io.on("reconnect", rejoinIfNeeded);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      socket.io.off("reconnect", rejoinIfNeeded);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

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

  // 0–1 through the current focus/break phase (meaningless for flow focus,
  // where the "duration" is just the server's safety cap — HUD hides it)
  const phaseProgress =
    (phase === "focus" || phase === "break") && phaseStartTime
      ? Math.min(1, (now - phaseStartTime) / (currentPhaseDuration * 1000))
      : 0;

  const partnerEntry = Object.entries(players).find(([id]) => id !== myId);
  const partner = partnerEntry
    ? { id: partnerEntry[0], avatar: partnerEntry[1].avatar }
    : null;
  const partnerName = partnerEntry?.[1].displayName;
  const partnerPet = partnerEntry?.[1].pet ?? null;
  const partnerDisconnected = partnerEntry?.[1].disconnected ?? false;

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
      const displayName = profile?.display_name ?? profile?.username ?? "Player";
      lastAvatarRef.current = avatar;
      lastDisplayNameRef.current = displayName;
      socket.emit("create_session", {
        avatar,
        world,
        displayName,
        pet: myPetRef.current,
      });
    },
    [profile, sessionId],
  );

  const joinSession = useCallback(
    (sid: string, avatar: AvatarConfig) => {
      const socket = socketRef.current;
      if (!socket) return;
      setSessionId(sid);
      const displayName = profile?.display_name ?? profile?.username ?? "Player";
      lastAvatarRef.current = avatar;
      lastDisplayNameRef.current = displayName;
      socket.emit("join_session", {
        sessionId: sid,
        avatar,
        displayName,
        pet: myPetRef.current,
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
    lastAvatarRef.current = null;
    sessionStorage.removeItem(RESUME_KEY);
    setResumeSessionId(null);
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

  // Set/change pet — keeps the ref mirror in sync and relays mid-session
  const setMyPet = useCallback((pet: PetType | null) => {
    setMyPetState(pet);
    myPetRef.current = pet;
    const sid = sessionIdRef.current;
    if (sid) socketRef.current?.emit("set_pet", { sessionId: sid, pet });
  }, []);

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
          pet: myPetRef.current,
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
    connectionState,
    // Derived
    timeLeft,
    flowElapsed,
    focusProgress,
    returningProgress,
    phaseProgress,
    partner,
    partnerName,
    partnerPet,
    partnerDisconnected,
    playerCount,
    // Session actions
    sessionId,
    resumeSessionId,
    consumeResumeSession,
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
