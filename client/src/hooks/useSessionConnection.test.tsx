import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionConnection } from "./useSessionConnection";

function createFakeSocket() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const managerHandlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const on = (map: typeof handlers) =>
    (event: string, handler: (...args: unknown[]) => void) => {
      map.set(event, [...(map.get(event) ?? []), handler]);
    };
  const off = (map: typeof handlers) =>
    (event: string, handler: (...args: unknown[]) => void) => {
      map.set(event, (map.get(event) ?? []).filter((item) => item !== handler));
    };
  const socket = {
    id: "socket-1",
    connected: false,
    auth: {} as Record<string, unknown>,
    emitted: [] as { event: string; payload: unknown }[],
    connect: vi.fn(() => { socket.connected = true; }),
    disconnect: vi.fn(() => { socket.connected = false; }),
    emit: vi.fn((event: string, payload?: unknown) => {
      socket.emitted.push({ event, payload });
    }),
    on: on(handlers),
    off: off(handlers),
    io: {
      on: on(managerHandlers),
      off: off(managerHandlers),
    },
    fire(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
  return socket;
}

let socket: ReturnType<typeof createFakeSocket>;
const getSession = vi.fn();

vi.mock("socket.io-client", () => ({ io: () => socket }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

const options = () => ({
  getResumeSnapshot: () => null,
  registerSocketHandlers: vi.fn(),
});

describe("useSessionConnection", () => {
  beforeEach(() => {
    socket = createFakeSocket();
    getSession.mockReset().mockResolvedValue({
      data: { session: { access_token: "initial-token" } },
    });
  });

  it("refreshes an expired authentication token for the next connection attempt", async () => {
    const config = options();
    renderHook(() => useSessionConnection(config));
    await waitFor(() => expect(config.registerSocketHandlers).toHaveBeenCalled());
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: "fresh-token" } },
    });

    await act(async () => {
      socket.fire("connect_error", new Error("Invalid or expired token"));
    });

    await waitFor(() => expect(socket.auth).toEqual({ token: "fresh-token" }));
  });

  it("disconnects its one socket when the consumer unmounts", async () => {
    const config = options();
    const hook = renderHook(() => useSessionConnection(config));
    await waitFor(() => expect(config.registerSocketHandlers).toHaveBeenCalledWith(socket));

    hook.unmount();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });
});
