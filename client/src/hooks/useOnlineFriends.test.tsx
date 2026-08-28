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

const socketRef = { current: null };

describe("useOnlineFriends read integrity", () => {
  beforeEach(() => {
    fake = createFakeSupabase();
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
});
