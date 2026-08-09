import { describe, it, expect } from "vitest";
import {
  createSessionState,
  addPlayer,
  removePlayer,
  setPlayerPet,
  findPlayerByUserId,
  markPlayerDisconnected,
  inviteUser,
  isInvited,
  sessionParticipantIds,
  findUserSessions,
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

describe("sessionParticipantIds", () => {
  it("collects the authenticated userIds in the session", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    addPlayer(s, "p2", { avatar: {}, displayName: "B", userId: "u2" });
    expect(sessionParticipantIds(s).sort()).toEqual(["u1", "u2"]);
  });

  it("skips anonymous players", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    addPlayer(s, "p2", { avatar: {}, displayName: "B", userId: null });
    expect(sessionParticipantIds(s)).toEqual(["u1"]);
  });

  // session_participants has a unique (session_id, user_id) index, so a
  // repeated id would fail the batch insert and lose the whole record
  it("dedupes a userId holding two slots", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    addPlayer(s, "p2", { avatar: {}, displayName: "A", userId: "u1" });
    expect(sessionParticipantIds(s)).toEqual(["u1"]);
  });

  it("returns an empty array for an empty session", () => {
    expect(sessionParticipantIds(createSessionState("forest", "host"))).toEqual([]);
  });

  // The abandoned-focus bug: the last player is removed before recording, so
  // the live map is empty by then and a snapshot is the only source of truth.
  it("snapshot survives removal of the last player", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    const snapshot = sessionParticipantIds(s);
    expect(removePlayer(s, "p1")).toBe(0);
    expect(sessionParticipantIds(s)).toEqual([]);
    expect(snapshot).toEqual(["u1"]);
  });
});

describe("invite allowlist", () => {
  it("a new session has nobody invited", () => {
    const s = createSessionState("forest", "host");
    expect(s.invitedUserIds.size).toBe(0);
    expect(isInvited(s, "u1")).toBe(false);
  });

  it("records an invited user", () => {
    const s = createSessionState("forest", "host");
    expect(inviteUser(s, "u1")).toBe(true);
    expect(isInvited(s, "u1")).toBe(true);
    expect(isInvited(s, "u2")).toBe(false);
  });

  it("is idempotent", () => {
    const s = createSessionState("forest", "host");
    inviteUser(s, "u1");
    inviteUser(s, "u1");
    expect(s.invitedUserIds.size).toBe(1);
  });

  it("ignores a null userId rather than allowlisting everyone", () => {
    const s = createSessionState("forest", "host");
    expect(inviteUser(s, null)).toBe(false);
    expect(isInvited(s, null)).toBe(false);
    expect(isInvited(s, undefined)).toBe(false);
  });

  it("stays out of the sync payload", () => {
    const s = createSessionState("forest", "host");
    inviteUser(s, "u1");
    expect(buildSyncPayload(s)).not.toHaveProperty("invitedUserIds");
  });
});

describe("findPlayerByUserId", () => {
  it("finds the socket id for a user in the session", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "sock-a", { avatar: {}, displayName: "A", userId: "u1" });
    addPlayer(s, "sock-b", { avatar: {}, displayName: "B", userId: "u2" });
    expect(findPlayerByUserId(s, "u2")).toBe("sock-b");
  });

  it("returns null when the user is not in the session", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "sock-a", { avatar: {}, displayName: "A", userId: "u1" });
    expect(findPlayerByUserId(s, "u9")).toBe(null);
  });

  it("returns null for a null userId even if anonymous players exist", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "sock-a", { avatar: {}, displayName: "A", userId: null });
    expect(findPlayerByUserId(s, null)).toBe(null);
  });
});

describe("markPlayerDisconnected", () => {
  it("players start connected and can be marked disconnected and back", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    expect(s.players["p1"].disconnected).toBe(false);
    expect(markPlayerDisconnected(s, "p1", true)).toBe(true);
    expect(s.players["p1"].disconnected).toBe(true);
    expect(markPlayerDisconnected(s, "p1", false)).toBe(true);
    expect(s.players["p1"].disconnected).toBe(false);
  });

  it("returns false for a socket that is not a player", () => {
    const s = createSessionState("forest", "host");
    expect(markPlayerDisconnected(s, "ghost", true)).toBe(false);
  });

  it("disconnected flag survives into the sync payload", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    markPlayerDisconnected(s, "p1", true);
    expect(buildSyncPayload(s).players["p1"].disconnected).toBe(true);
  });
});

describe("setPlayerPet", () => {
  it("stores a pet on join and defaults to null", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1", pet: "cat" });
    addPlayer(s, "p2", { avatar: {}, displayName: "B", userId: "u2" });
    expect(s.players["p1"].pet).toBe("cat");
    expect(s.players["p2"].pet).toBe(null);
  });

  it("updates an existing player's pet", () => {
    const s = createSessionState("forest", "host");
    addPlayer(s, "p1", { avatar: {}, displayName: "A", userId: "u1" });
    expect(setPlayerPet(s, "p1", "dragon")).toBe(true);
    expect(s.players["p1"].pet).toBe("dragon");
    expect(setPlayerPet(s, "p1", null)).toBe(true);
    expect(s.players["p1"].pet).toBe(null);
  });

  it("returns false for a socket that is not a player", () => {
    const s = createSessionState("forest", "host");
    expect(setPlayerPet(s, "ghost", "cat")).toBe(false);
  });
});

describe("findUserSessions", () => {
  const withPlayers = (...users) => {
    const s = createSessionState("forest", "host");
    users.forEach((u, i) =>
      addPlayer(s, `sock-${u}-${i}`, { avatar: {}, displayName: u, userId: u }),
    );
    return s;
  };

  it("finds the one session a user is in", () => {
    const sessions = { a: withPlayers("u1"), b: withPlayers("u2") };
    expect(findUserSessions(sessions, "u1")).toEqual(["a"]);
  });

  // The multi-tab case: presence must not be cleared while another tab is
  // still in a live session.
  it("finds every session a user holds a slot in", () => {
    const sessions = { a: withPlayers("u1"), b: withPlayers("u1", "u2") };
    expect(findUserSessions(sessions, "u1").sort()).toEqual(["a", "b"]);
  });

  it("returns empty for a user who is in none", () => {
    expect(findUserSessions({ a: withPlayers("u1") }, "u9")).toEqual([]);
  });

  it("returns empty for a null userId", () => {
    expect(findUserSessions({ a: withPlayers("u1") }, null)).toEqual([]);
  });

  it("handles no sessions at all", () => {
    expect(findUserSessions({}, "u1")).toEqual([]);
  });
});
