import { describe, expect, it, vi } from "vitest";
import { recordFocusSession } from "./focusRecorder.js";

const payload = {
  p_recording_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  p_room_code: "ROOM",
  p_world: "forest",
  p_focus_duration: 1500,
  p_break_duration: 300,
  p_actual_focus: 1500,
  p_completed: true,
  p_started_at: "2026-08-27T20:00:00.000Z",
  p_user_ids: ["user-1", "user-2"],
};

function clientWith(...responses) {
  const rpc = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) rpc.mockRejectedValueOnce(response);
    else rpc.mockResolvedValueOnce(response);
  }
  return { client: { rpc }, rpc };
}

const success = (inserted = true) => ({
  data: [{ session_id: "session-row-id", inserted }],
  error: null,
});

describe("recordFocusSession", () => {
  it("records the whole round through one RPC", async () => {
    const { client, rpc } = clientWith(success());

    await expect(recordFocusSession(client, payload)).resolves.toEqual({
      sessionId: "session-row-id",
      inserted: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_focus_session", payload);
  });

  it("accepts the idempotent result from an already-recorded round", async () => {
    const { client } = clientWith(success(false));

    await expect(recordFocusSession(client, payload)).resolves.toEqual({
      sessionId: "session-row-id",
      inserted: false,
    });
  });

  it("retries transient API errors with the exact same payload", async () => {
    const { client, rpc } = clientWith(
      { data: null, error: { status: 503, message: "unavailable" } },
      { data: null, error: { code: "40001", message: "try again" } },
      success(false),
    );
    const wait = vi.fn().mockResolvedValue(undefined);
    const observe = vi.fn();

    await expect(
      recordFocusSession(client, payload, {
        retryDelays: [10, 20],
        wait,
        observe,
      }),
    ).resolves.toEqual({ sessionId: "session-row-id", inserted: false });
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.every(([, args]) => args === payload)).toBe(true);
    expect(wait.mock.calls).toEqual([[10], [20]]);
    expect(observe.mock.calls.map(([event]) => ({
      outcome: event.outcome,
      attempt: event.attempt,
      retrying: event.retrying,
    }))).toEqual([
      { outcome: "database_error", attempt: 1, retrying: true },
      { outcome: "database_error", attempt: 2, retrying: true },
      { outcome: "idempotent", attempt: 3, retrying: undefined },
    ]);
  });

  it("retries a thrown network error because the first write may have committed", async () => {
    const { client, rpc } = clientWith(new TypeError("fetch failed"), success(false));

    await expect(
      recordFocusSession(client, payload, {
        retryDelays: [10],
        wait: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toEqual({ sessionId: "session-row-id", inserted: false });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does not retry validation or permission failures", async () => {
    const { client, rpc } = clientWith({
      data: null,
      error: { code: "22023", status: 400, message: "bad recording" },
    });

    await expect(
      recordFocusSession(client, payload, {
        retryDelays: [10, 20],
        wait: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toMatchObject({ message: "bad recording", code: "22023" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("stops after the configured retry budget", async () => {
    const unavailable = {
      data: null,
      error: { status: 503, message: "still unavailable" },
    };
    const { client, rpc } = clientWith(unavailable, unavailable, unavailable);

    await expect(
      recordFocusSession(client, payload, {
        retryDelays: [10, 20],
        wait: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow("still unavailable");
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("rejects a malformed success response instead of claiming persistence", async () => {
    const { client, rpc } = clientWith({ data: null, error: null });
    const observe = vi.fn();

    await expect(recordFocusSession(client, payload, { observe })).rejects.toThrow(
      "returned an unusable result",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "record_focus_session",
        outcome: "invalid_response",
        attempt: 1,
      }),
    );
  });
});
