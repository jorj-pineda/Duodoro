import { describe, it, expect, vi } from "vitest";
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
