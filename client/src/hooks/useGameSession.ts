"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { GamePhase } from "@/components/GameWorld";
import type { AvatarConfig, WorldId } from "@/lib/avatarData";
import type { Profile, PetType } from "@/lib/types";
import type { PetStage } from "@/lib/petLevel";
import type {
  PlayerData,
  SyncPayload,
  PhaseChangePayload,
  InviteData,
} from "@/lib/sessionTypes";
import { playSound } from "@/lib/sounds";
import { worldAt } from "@/lib/rotation";
import { getSupabase } from "@/lib/supabase";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

// sessionStorage key mirroring the active session id, so a full page reload
// can silently rejoin within the server's reconnect grace window.
const RESUME_KEY = "duodoro:session";

export type { InviteData };

export function useGameSession(profile: Profile | null) {
  // ── Avatar & world ──────────────────────────────────────────────────────
  // myWorld is a mirror of the server's answer, not a choice: createSession
  // seeds it from the rotation so the scene doesn't flash forest, and
  // sync_state overwrites it with the authoritative value. Kept as a plain
  // literal rather than worldAt() so nothing reads the clock during render —
  // Next renders this component on the server too, where "now" is a different
  // number.
  const [myWorld, setMyWorld] = useState<WorldId>("forest");
  const [myPet, setMyPetState] = useState<PetType | null>(null);
  const [myPetStage, setMyPetStage] = useState<PetStage | null>(null);
  // Ref mirrors so the socket handlers — registered once with [] deps — read
  // current values instead of whatever was captured at mount. Without this, an
  // invite sent before a session exists is relayed by the session_created
  // handler using profile=null, i.e. from "Someone".
  const myPetRef = useRef<PetType | null>(null);
  const profileRef = useRef<Profile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const inviterName = () =>
    profileRef.current?.display_name ??
    profileRef.current?.username ??
    "Someone";

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
  // Populated once the socket exists, so the UI can ask for a reconnect
  // without reaching into the socket itself.
  const reconnectRef = useRef<() => void>(() => {});
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
  // Surfaced as a toast by DuoTimer — these used to be console-only, which left
  // a refused join sitting on an empty game screen with no explanation.
  const [sessionError, setSessionError] = useState<string | null>(null);
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
    let detachResume = () => {};

    async function connectSocket() {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (cancelled) return;

      const socket = io(SOCKET_URL, {
        reconnection: true,
        // Ten attempts against socket.io's 5s backoff cap is ~40s, which
        // expires *inside* the server's 60s reconnect grace — the automatic
        // retries gave up while the slot was still being held. 20 covers it
        // with margin. Beyond that the tab-wake / online handlers take over,
        // so a longer outage still recovers without a reload.
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
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
              fromName: inviterName(),
            });
          }
        },
      );

      socket.on("session_error", ({ message }: { message: string }) => {
        console.error("Session error:", message);
        setSessionError(message);
        // These mean "you are not in a session" — drop any local state that
        // says otherwise, so we don't sit on a screen for a session we
        // aren't actually in.
        if (
          message === "Session not found" ||
          message === "This session is private" ||
          message === "Session is full"
        ) {
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
        // Own stage comes from the slot, not a local guess: useStats is stale
        // during a session, and a client-sent stage is ignored by the server.
        const self = socket.id ? data.players?.[socket.id] : undefined;
        if (self) {
          setMyPetStage(self.pet ? (self.petStage ?? "grown") : null);
        }
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
          petStage,
        }: {
          playerId: string;
          avatar: AvatarConfig;
          displayName?: string;
          pet?: PetType | null;
          petStage?: PetStage | null;
        }) => {
          setPlayers((prev) => ({
            ...prev,
            [playerId]: {
              avatar,
              displayName,
              pet: pet ?? null,
              petStage: pet ? (petStage ?? "grown") : null,
            },
          }));
        },
      );

      socket.on(
        "pet_changed",
        ({
          playerId,
          pet,
          petStage,
        }: {
          playerId: string;
          pet: PetType | null;
          petStage?: PetStage | null;
        }) => {
          setPlayers((prev) =>
            prev[playerId]
              ? {
                  ...prev,
                  [playerId]: {
                    ...prev[playerId],
                    pet,
                    petStage: pet ? (petStage ?? "grown") : null,
                  },
                }
              : prev,
          );
          // The server emits to the whole room, including the picker, so the
          // originator sees the derived size rather than guessing from stats.
          if (playerId === socket.id) {
            setMyPetStage(pet ? (petStage ?? "grown") : null);
          }
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
        setSessionError(message);
      });

      // ── Resume handlers ───────────────────────────────────────────────
      // These used to live in a separate mount effect that read
      // socketRef.current — but the socket is created after an await here, so
      // that ref was still null and the listeners were never attached at all.
      // Mobile browsers close backgrounded WebSockets aggressively, so this is
      // the path that gets a player back into their session.
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

      // socket.io stops for good once reconnectionAttempts is exhausted, and
      // nothing else ever calls connect(). A phone backgrounded for a minute
      // therefore landed on "connection lost" permanently — while the server
      // was still holding the player's slot for RECONNECT_GRACE_MS. These are
      // the two moments worth retrying on: the user looked at the tab again,
      // or the OS says the network is back.
      const reconnectNow = async () => {
        if (socket.connected) return;
        setConnectionState("reconnecting");
        // The access token may well have expired while we were away.
        const {
          data: { session: fresh },
        } = await sb.auth.getSession();
        if (fresh?.access_token) socket.auth = { token: fresh.access_token };
        socket.connect();
      };

      reconnectRef.current = () => void reconnectNow();

      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        if (!socket.connected) {
          reconnectNow();
          return;
        }
        if (sessionIdRef.current) socket.emit("request_sync");
      };

      const onOnline = () => {
        if (!socket.connected) reconnectNow();
      };

      // Hangs off plain "connect", not the manager's "reconnect": that event
      // only fires for socket.io's own automatic retries, so a reconnect we
      // triggered ourselves would land the socket back online without ever
      // rejoining the session. Safe to run on every connect — join_session
      // re-keys an existing slot, and this no-ops before there is a session.
      socket.on("connect", rejoinIfNeeded);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", onOnline);
      detachResume = () => {
        socket.off("connect", rejoinIfNeeded);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("online", onOnline);
      };
    }

    connectSocket();

    return () => {
      cancelled = true;
      detachResume();
      socketRef.current?.disconnect();
    };
    // Deliberately mount-only: this owns the single socket connection for the
    // session's lifetime. sb is a module-level singleton, so sb.auth is stable
    // and listing it would not change when this runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const partnerUserId = partnerEntry?.[1].userId ?? null;
  const partnerPet = partnerEntry?.[1].pet ?? null;
  const partnerPetStage = partnerEntry?.[1].petStage ?? null;
  const partnerDisconnected = partnerEntry?.[1].disconnected ?? false;

  const playerCount = Object.keys(players).length;

  // ── Session actions ─────────────────────────────────────────────────────
  const createSession = useCallback(
    (avatar: AvatarConfig) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (sessionId) {
        socket.emit("leave_session", { sessionId });
        setSessionStarted(false);
        setPhase("waiting");
        setPlayers({});
        setSessionId("");
      }
      // Optimistic, so the scene doesn't flash forest while sync_state is in
      // flight. The server assigns the real one from the same clock and it
      // arrives moments later; the only way the two disagree is a create that
      // straddles a rotation boundary, and then the server's answer wins.
      setMyWorld(worldAt());
      const displayName = profile?.display_name ?? profile?.username ?? "Player";
      lastAvatarRef.current = avatar;
      lastDisplayNameRef.current = displayName;
      socket.emit("create_session", {
        avatar,
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
        // No worldId: the server reads it off the session it's inviting to.
        socket.emit("send_invite", {
          targetUserId,
          sessionId,
          fromName: profile?.display_name ?? profile?.username ?? "Someone",
        });
      } else {
        pendingOutboundInvite.current = targetUserId;
        setMyWorld(worldAt());
        socket.emit("create_session", {
          avatar,
          displayName: profile?.display_name ?? profile?.username ?? "Player",
          pet: myPetRef.current,
        });
      }
    },
    [sessionId, profile],
  );

  const dismissInvite = useCallback(() => setPendingInvite(null), []);

  return {
    // World & pet. myWorld is read-only to callers: the world is the server's,
    // and a setter here is a way to put the client back in charge of it.
    myWorld,
    myPet,
    myPetStage,
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
    reconnect: useCallback(() => reconnectRef.current(), []),
    // Derived
    timeLeft,
    flowElapsed,
    focusProgress,
    returningProgress,
    phaseProgress,
    partner,
    partnerName,
    partnerUserId,
    partnerPet,
    partnerPetStage,
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
    sessionError,
    clearSessionError: useCallback(() => setSessionError(null), []),
    inviteSentName,
  };
}
