import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Fake socket.io ───────────────────────────────────────────────────────────
// Enough of the surface useGameSession touches: per-event listener lists, a
// manager (`io`) with its own listeners, and connect/disconnect that flip state
// and fire the right events.
function createFakeSocket() {
  const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  const managerHandlers = new Map<string, ((...a: unknown[]) => void)[]>();
  const add = (m: Map<string, ((...a: unknown[]) => void)[]>) =>
    (ev: string, fn: (...a: unknown[]) => void) => {
      m.set(ev, [...(m.get(ev) ?? []), fn]);
    };
  const remove = (m: Map<string, ((...a: unknown[]) => void)[]>) =>
    (ev: string, fn: (...a: unknown[]) => void) => {
      m.set(ev, (m.get(ev) ?? []).filter((f) => f !== fn));
    };

  const socket = {
    id: "sock-1",
    connected: false,
    auth: {} as Record<string, unknown>,
    emitted: [] as { ev: string; payload: unknown }[],
    connectCalls: 0,

    on: add(handlers),
    off: remove(handlers),
    once: add(handlers),
    emit(ev: string, payload?: unknown) {
      socket.emitted.push({ ev, payload });
    },
    disconnect() {
      socket.connected = false;
      socket.fire("disconnect");
    },
    connect() {
      socket.connectCalls++;
      socket.connected = true;
      socket.fire("connect");
    },
    io: {
      on: add(managerHandlers),
      off: remove(managerHandlers),
      fire(ev: string, ...args: unknown[]) {
        (managerHandlers.get(ev) ?? []).forEach((f) => f(...args));
      },
    },

    // test helpers
    fire(ev: string, ...args: unknown[]) {
      (handlers.get(ev) ?? []).forEach((f) => f(...args));
    },
    listenerCount(ev: string) {
      return (handlers.get(ev) ?? []).length;
    },
    emittedNames() {
      return socket.emitted.map((e) => e.ev);
    },
  };
  return socket;
}

let fakeSocket: ReturnType<typeof createFakeSocket>;

vi.mock("socket.io-client", () => ({
  io: () => fakeSocket,
  Socket: class {},
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "tok" } },
      }),
    },
  }),
}));

vi.mock("@/lib/sounds", () => ({ playSound: () => {} }));

import { useGameSession } from "./useGameSession";

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
};

describe("useGameSession connection lifecycle", () => {
  beforeEach(() => {
    fakeSocket = createFakeSocket();
    setVisibility("visible");
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  // The socket is created after an await inside connectSocket(), so any effect
  // that reads socketRef.current on mount sees null. Handlers registered that
  // way are silently never attached.
  it("wires tab-wake and reconnect handlers to the socket once it exists", async () => {
    renderHook(() => useGameSession(null));
    await waitFor(() => expect(fakeSocket.listenerCount("connect")).toBeGreaterThan(0));
    expect(fakeSocket.listenerCount("disconnect")).toBeGreaterThan(0);
  });

  it("asks the server to resync when the tab becomes visible mid-session", async () => {
    const { result } = renderHook(() => useGameSession(null));
    await waitFor(() => expect(fakeSocket.listenerCount("connect")).toBeGreaterThan(0));

    // Get into a session: connect, then let the server confirm one.
    act(() => fakeSocket.connect());
    act(() => fakeSocket.fire("session_created", { sessionId: "sess-1" }));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    fakeSocket.emitted.length = 0;
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    await waitFor(() =>
      expect(fakeSocket.emittedNames()).toContain("request_sync"),
    );
  });

  // The core bug: after reconnect_failed nothing ever called socket.connect()
  // again, so a tab backgrounded past the retry budget was stranded even
  // though the server still held the slot.
  it("reconnects when the tab returns after the retry budget is exhausted", async () => {
    const { result } = renderHook(() => useGameSession(null));
    await waitFor(() => expect(fakeSocket.listenerCount("connect")).toBeGreaterThan(0));

    act(() => fakeSocket.connect());
    act(() => fakeSocket.fire("session_created", { sessionId: "sess-1" }));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    // Drop, then exhaust socket.io's automatic retries.
    act(() => fakeSocket.disconnect());
    act(() => fakeSocket.io.fire("reconnect_failed"));
    await waitFor(() => expect(result.current.connectionState).toBe("offline"));

    const before = fakeSocket.connectCalls;
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    await waitFor(() =>
      expect(fakeSocket.connectCalls).toBeGreaterThan(before),
    );
  });

  it("reconnects when the browser reports the network is back", async () => {
    const { result } = renderHook(() => useGameSession(null));
    await waitFor(() => expect(fakeSocket.listenerCount("connect")).toBeGreaterThan(0));

    act(() => fakeSocket.connect());
    act(() => fakeSocket.fire("session_created", { sessionId: "sess-1" }));
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    act(() => fakeSocket.disconnect());
    act(() => fakeSocket.io.fire("reconnect_failed"));
    await waitFor(() => expect(result.current.connectionState).toBe("offline"));

    const before = fakeSocket.connectCalls;
    act(() => window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(fakeSocket.connectCalls).toBeGreaterThan(before));
  });

  // Manual reconnects don't emit the manager's "reconnect" event, so rejoin
  // must hang off plain "connect" or the player silently isn't in the session.
  it("rejoins the session on a manual reconnect, not just an automatic one", async () => {
    const { result } = renderHook(() => useGameSession(null));
    await waitFor(() => expect(fakeSocket.listenerCount("connect")).toBeGreaterThan(0));

    act(() => fakeSocket.connect());
    act(() =>
      fakeSocket.fire("sync_state", {
        mode: "pomodoro",
        phase: "waiting",
        focusDuration: 1500,
        breakDuration: 300,
        phaseStartTime: null,
        world: "forest",
        players: {},
        playerCount: 1,
        sessionId: "sess-1",
      }),
    );
    await waitFor(() => expect(result.current.sessionId).toBe("sess-1"));

    // joinSession caches the avatar/name the rejoin needs
    act(() =>
      result.current.joinSession("sess-1", {
        skinColor: "#e0ac69",
        hairStyle: "bob",
        hairColor: "#222222",
        eyeStyle: "normal",
        outfitColor: "#3355aa",
      }),
    );

    act(() => fakeSocket.disconnect());
    fakeSocket.emitted.length = 0;
    act(() => fakeSocket.connect());

    await waitFor(() =>
      expect(fakeSocket.emittedNames()).toContain("join_session"),
    );
  });
});
