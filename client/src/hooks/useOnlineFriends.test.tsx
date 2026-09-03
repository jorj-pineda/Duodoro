import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

function createFakeSupabase() {
  let result: Result = { data: [], error: null };
  const realtimeHandlers: Array<() => void> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.then = (
    resolve: (value: Result) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);

  const channel = {
    on: (_event: string, _filter: unknown, handler: () => void) => {
      realtimeHandlers.push(handler);
      return channel;
    },
    subscribe: () => channel,
  };

  return {
    sb: {
      from: () => builder,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
    setResult(next: Result) {
      result = next;
    },
    realtimeHandlers,
  };
}

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/lib/supabase", () => ({ getSupabase: () => fake.sb }));

import { useOnlineFriends } from "./useOnlineFriends";
import type { ConnectionState } from "./useSessionConnection";
import type { DuodoroSocket } from "@/lib/socketContract";

const socketRef: { current: DuodoroSocket | null } = { current: null };

function createFakeSocket() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const emitted: { event: string; payload: unknown }[] = [];
  return {
    emitted,
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    }),
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, (handlers.get(event) ?? []).filter((item) => item !== handler));
    },
  } as unknown as DuodoroSocket & {
    emitted: { event: string; payload: unknown }[];
  };
}

let socket: ReturnType<typeof createFakeSocket>;

describe("useOnlineFriends read integrity", () => {
  beforeEach(() => {
    fake = createFakeSupabase();
    socket = createFakeSocket();
    socketRef.current = null;
  });

  it("surfaces a failed presence read instead of reporting nobody online", async () => {
    fake.setResult({ data: null, error: new Error("offline") });
    const { result } = renderHook(() =>
      useOnlineFriends("me", socketRef),
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.loaded).toBe(false);
    expect(result.current.friends).toEqual([]);
  });

  it("distinguishes a successful empty friend list", async () => {
    const { result } = renderHook(() =>
      useOnlineFriends("me", socketRef),
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.error).toBeNull();
    expect(result.current.friends).toEqual([]);
  });

  it("recovers from an outage when realtime prompts another read", async () => {
    fake.setResult({ data: null, error: new Error("offline") });
    const { result } = renderHook(() =>
      useOnlineFriends("me", socketRef),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());

    fake.setResult({ data: [], error: null });
    await act(async () => {
      await fake.realtimeHandlers[0]();
    });

    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("asks who is online only after the socket exists", async () => {
    fake.setResult({
      data: [
        {
          requester_id: "me",
          addressee_id: "friend-1",
          requester: { id: "me" },
          addressee: { id: "friend-1" },
        },
      ],
      error: null,
    });

    const { rerender, result } = renderHook(
      ({ state }: { state: ConnectionState }) =>
        useOnlineFriends("me", socketRef, state),
      { initialProps: { state: "connecting" as ConnectionState } },
    );

    await waitFor(() => expect(result.current.friends).toHaveLength(1));
    expect(socket.emitted).toEqual([]);

    socketRef.current = socket;
    rerender({ state: "connected" });

    await waitFor(() =>
      expect(socket.emitted.some((entry) => entry.event === "get_online_friends")).toBe(true),
    );
  });
});
