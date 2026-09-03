"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getSupabase } from "@/lib/supabase";
import type { AvatarConfig } from "@/lib/avatarData";
import type { PetType } from "@/lib/types";
import type { DuodoroSocket } from "@/lib/socketContract";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

interface ConnectionOptions {
  getResumeSnapshot: () => {
    sessionId: string;
    avatar: AvatarConfig | null;
    displayName: string;
    pet: PetType | null;
  } | null;
  registerSocketHandlers: (socket: DuodoroSocket) => void;
}

export function useSessionConnection({
  getResumeSnapshot,
  registerSocketHandlers,
}: ConnectionOptions) {
  const [myId, setMyId] = useState("");
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const socketRef = useRef<DuodoroSocket | null>(null);
  const reconnectRef = useRef<() => void>(() => {});
  const [sb] = useState(getSupabase);

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
        // Twenty attempts outlast the server's 60-second slot grace even with
        // Socket.IO's capped backoff. Visibility and online events recover a
        // longer outage after the automatic retry budget is exhausted.
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        auth: { token: session?.access_token ?? "" },
      }) as DuodoroSocket;
      socketRef.current = socket;

      socket.on("connect_error", async (error) => {
        if (
          error.message !== "Invalid or expired token" &&
          error.message !== "Authentication required"
        ) return;
        const {
          data: { session: fresh },
        } = await sb.auth.refreshSession();
        if (!cancelled && fresh?.access_token) {
          socket.auth = { token: fresh.access_token };
        }
      });

      socket.on("connect", () => {
        setMyId(socket.id ?? "");
        setConnectionState("connected");
      });
      socket.on("disconnect", () => setConnectionState("reconnecting"));
      socket.io.on("reconnect_failed", () => setConnectionState("offline"));

      registerSocketHandlers(socket);

      const rejoinIfNeeded = () => {
        const snapshot = getResumeSnapshot();
        if (!snapshot?.avatar) return;
        socket.emit("join_session", { ...snapshot, avatar: snapshot.avatar });
      };

      const reconnectNow = async () => {
        if (socket.connected) return;
        setConnectionState("reconnecting");
        const {
          data: { session: fresh },
        } = await sb.auth.refreshSession();
        if (cancelled) return;
        if (fresh?.access_token) socket.auth = { token: fresh.access_token };
        socket.connect();
      };

      reconnectRef.current = () => void reconnectNow();

      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        if (!socket.connected) {
          void reconnectNow();
          return;
        }
        if (getResumeSnapshot()) socket.emit("request_sync");
      };
      const onOnline = () => {
        if (!socket.connected) void reconnectNow();
      };

      // Plain connect covers automatic and manually-triggered reconnects.
      socket.on("connect", rejoinIfNeeded);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", onOnline);
      detachResume = () => {
        socket.off("connect", rejoinIfNeeded);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("online", onOnline);
      };
    }

    void connectSocket();
    return () => {
      cancelled = true;
      detachResume();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [getResumeSnapshot, registerSocketHandlers, sb]);

  const reconnect = useCallback(() => reconnectRef.current(), []);
  return { socketRef, myId, connectionState, reconnect };
}
