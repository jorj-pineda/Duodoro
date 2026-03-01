import { describe, it, expect } from "vitest";
import {
  createSessionState,
  addPlayer,
  removePlayer,
  buildSyncPayload,
} from "./session.js";

describe("createSessionState", () => {
  it("creates a session with default values", () => {
    const s = createSessionState("forest", "socket-1");
    expect(s.id).toBeTruthy();
    expect(s.phase).toBe("waiting");
    expect(s.focusDuration).toBe(25 * 60);
    expect(s.breakDuration).toBe(5 * 60);
    expect(s.world).toBe("forest");
    expect(s.hostId).toBe("socket-1");
    expect(Object.keys(s.players)).toHaveLength(0);
  });

  it("defaults world to forest when not provided", () => {
    const s = createSessionState(null, "socket-1");
    expect(s.world).toBe("forest");
  });

  it("generates unique session IDs", () => {
    const a = createSessionState("space", "s1");
    const b = createSessionState("space", "s2");
    expect(a.id).not.toBe(b.id);
  });
});

describe("addPlayer / removePlayer", () => {
  it("adds a player and returns the count", () => {
    const s = createSessionState("forest", "host");
    const count = addPlayer(s, "player-1", {
      avatar: { skin: "#fff" },
      displayName: "Alice",
      userId: "uid-1",
    });
    expect(count).toBe(1);
    expect(s.players["player-1"].displayName).toBe("Alice");
    expect(s.players["player-1"].userId).toBe("uid-1");
  });

  it("defaults displayName to Player", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "", userId: null });
    expect(s.players["p1"].displayName).toBe("Player");
  });

  it("removes a player and returns the count", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    addPlayer(s, "p2", { avatar: {}, displayName: "B", userId: "u2" });
    expect(Object.keys(s.players)).toHaveLength(2);

    const remaining = removePlayer(s, "p1");
    expect(remaining).toBe(1);
    expect(s.players["p1"]).toBeUndefined();
    expect(s.players["p2"]).toBeDefined();
  });
});

describe("buildSyncPayload", () => {
  it("builds correct sync payload", () => {
    const s = createSessionState("beach", "host");
    addPlayer(s, "p1", { avatar: { skin: "#aaa" }, displayName: "Test", userId: "u1" });

    const payload = buildSyncPayload(s);
    expect(payload.phase).toBe("waiting");
    expect(payload.world).toBe("beach");
    expect(payload.playerCount).toBe(1);
    expect(payload.sessionId).toBe(s.id);
    expect(payload.players["p1"].displayName).toBe("Test");
  });
});

describe("presence maps", () => {
  it("tracks online users correctly", () => {
    const userSockets = new Map();
    const socketToUser = new Map();

    userSockets.set("user-1", "socket-a");
    socketToUser.set("socket-a", "user-1");

    userSockets.set("user-2", "socket-b");
    socketToUser.set("socket-b", "user-2");

    expect(userSockets.has("user-1")).toBe(true);
    expect(userSockets.has("user-3")).toBe(false);

    const friendIds = ["user-1", "user-3", "user-2"];
    const online = friendIds.filter((id) => userSockets.has(id));
    expect(online).toEqual(["user-1", "user-2"]);

    userSockets.delete("user-1");
    socketToUser.delete("socket-a");
    expect(userSockets.has("user-1")).toBe(false);
  });
});
