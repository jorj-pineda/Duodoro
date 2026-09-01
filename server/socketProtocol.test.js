import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isPayloadObject, safeSocketHandler } from "./socketProtocol.js";

describe("isPayloadObject", () => {
  it.each([null, undefined, true, 3, "payload", [], ["id"]])(
    "rejects non-object payload %#",
    (value) => {
      expect(isPayloadObject(value)).toBe(false);
    },
  );

  it.each([{}, { sessionId: "room" }, Object.create(null)])(
    "accepts record payload %#",
    (value) => {
      expect(isPayloadObject(value)).toBe(true);
    },
  );
});

describe("safeSocketHandler", () => {
  it("contains a synchronous handler exception", () => {
    const error = new Error("bad payload");
    const onError = vi.fn();
    const listener = safeSocketHandler(() => {
      throw error;
    }, onError);

    expect(() => listener(null)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("contains an asynchronous handler rejection", async () => {
    const error = new Error("database unavailable");
    const onError = vi.fn();
    const listener = safeSocketHandler(async () => {
      throw error;
    }, onError);

    listener({});
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
  });

  it("forwards every event argument to a successful handler", () => {
    const handler = vi.fn();
    const onError = vi.fn();
    const listener = safeSocketHandler(handler, onError);

    listener({ friendIds: [] }, "callback");

    expect(handler).toHaveBeenCalledWith({ friendIds: [] }, "callback");
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("payload-bearing event registration", () => {
  it("keeps every payload-bearing event behind onPayload", () => {
    const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
    const payloadEvents = [
      "get_online_friends",
      "send_invite",
      "create_session",
      "create_share_invite",
      "join_session",
      "start_session",
      "finish_flow_focus",
      "stop_session",
      "set_pet",
      "delete_account",
    ];

    for (const event of payloadEvents) {
      expect(source).toContain(`onPayload(socket, '${event}'`);
      expect(source).not.toContain(`socket.on('${event}'`);
    }
  });
});
