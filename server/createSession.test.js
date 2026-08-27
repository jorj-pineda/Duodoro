import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { io as connect } from "socket.io-client";
import { ROTATION_WORLDS, worldAt } from "./rotation.js";

// ─────────────────────────────────────────────────────────────────────────────
// The world is the server's to decide.
//
// Every other socket test in this package covers the pure helpers in
// session.js, which is enough for state transitions but cannot show what a
// *handler* does with a payload. The claim here — "a client-sent world is
// ignored" — is only true at the handler, so this boots the real server and
// talks to it over a real socket.
//
// Run against the previous commit, `world: <injected>` comes back as the
// session's world and these fail.
// ─────────────────────────────────────────────────────────────────────────────

const AVATAR = {
  skinColor: "#F1C27D",
  hairStyle: "bob",
  hairColor: "#3B2314",
  eyeStyle: "normal",
  outfitColor: "#4A6FA5",
};

// The auth middleware needs *a* token. Without SUPABASE_URL the server skips
// verification but still decodes the sub claim, so this is a syntactically
// real JWT with a fixed subject and nothing else.
function fakeToken(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub })}.`;
}

let child;
let url;

beforeAll(async () => {
  child = spawn("node", ["index.js"], {
    cwd: import.meta.dirname,
    env: {
      ...process.env,
      PORT: "0",
      // Empty rather than deleted: dotenv only fills keys that are absent, so
      // a developer's own .env would otherwise point this at real Supabase.
      SUPABASE_URL: "",
      SUPABASE_SERVICE_KEY: "",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 15_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const match = /Server running on port (\d+)/.exec(chunk);
      if (match) {
        clearTimeout(timer);
        resolve(`http://localhost:${match[1]}`);
      }
    });
    child.on("exit", (code) => reject(new Error(`server exited early (${code})`)));
  });
}, 20_000);

afterAll(() => {
  child?.kill("SIGKILL");
});

/** Create a session with the given payload; resolve with the sync_state world. */
function createSession(payload, sub) {
  return new Promise((resolve, reject) => {
    const socket = connect(url, {
      auth: { token: fakeToken(sub) },
      transports: ["websocket"],
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("no sync_state"));
    }, 10_000);
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.on("sync_state", (state) => {
      clearTimeout(timer);
      socket.close();
      resolve(state.world);
    });
    socket.on("connect", () => {
      socket.emit("create_session", { avatar: AVATAR, displayName: "Tester", ...payload });
    });
  });
}

describe("create_session assigns the rotating world", () => {
  it("ignores a world sent by the client", async () => {
    const before = Date.now();
    // Bracket the round trip so a rotation landing mid-test can't decide the
    // result: the answer must be one of the two worlds in play, and the
    // injected value is chosen to be neither.
    const plausible = new Set([worldAt(before), worldAt(before + 60_000)]);
    const injected = ROTATION_WORLDS.find((w) => !plausible.has(w));

    const world = await createSession({ world: injected }, "11111111-1111-4111-8111-111111111111");

    expect(world).not.toBe(injected);
    expect([...plausible, worldAt(Date.now())]).toContain(world);
  });

  it("assigns the same world regardless of what two clients ask for", async () => {
    const [a, b] = await Promise.all([
      createSession({ world: "space" }, "22222222-2222-4222-8222-222222222222"),
      createSession({ world: "beach" }, "33333333-3333-4333-8333-333333333333"),
    ]);
    expect(a).toBe(b);
  });

  it("still creates a session when no world is sent at all", async () => {
    // Guard, not an A/B: this passed before the change too, because the old
    // handler fell back to 'forest'. It is here so "ignored, not required"
    // stays true — an older client must not start getting errors.
    const world = await createSession({}, "44444444-4444-4444-8444-444444444444");
    expect(ROTATION_WORLDS).toContain(world);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pet stage is the server's to decide, same shape as the world.
//
// Dev mode has no Supabase, so totalFocusSeconds is 0 and a pet is young.
// Run against the previous commit and `petStage` is missing from the slot,
// so these fail — that's the A/B.
// ─────────────────────────────────────────────────────────────────────────────

function createAndSlot(payload, sub) {
  return new Promise((resolve, reject) => {
    const socket = connect(url, {
      auth: { token: fakeToken(sub) },
      transports: ["websocket"],
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("no sync_state"));
    }, 10_000);
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.on("sync_state", (state) => {
      clearTimeout(timer);
      const me = state.players[socket.id];
      socket.close();
      resolve(me);
    });
    socket.on("connect", () => {
      socket.emit("create_session", { avatar: AVATAR, displayName: "Tester", ...payload });
    });
  });
}

describe("create_session assigns pet stage from focus, not the payload", () => {
  it("ignores a petStage sent by the client", async () => {
    const me = await createAndSlot(
      { pet: "cat", petStage: "full" },
      "55555555-5555-4555-8555-555555555555",
    );
    expect(me.pet).toBe("cat");
    expect(me.petStage).toBe("young");
  });

  it("does not put focusSeconds on the wire", async () => {
    const me = await createAndSlot(
      { pet: "dog" },
      "66666666-6666-4666-8666-666666666666",
    );
    expect(me).not.toHaveProperty("focusSeconds");
  });

  it("leaves stage empty when there is no pet", async () => {
    const me = await createAndSlot({}, "77777777-7777-4777-8777-777777777777");
    expect(me.pet).toBe(null);
    expect(me.petStage).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The event boundary has to protect the real process, not only pure parsers.
// A custom Socket.IO client can send any JSON value regardless of the shapes
// used by Duodoro's TypeScript client.
// ─────────────────────────────────────────────────────────────────────────────

function connectedSocket(sub) {
  return new Promise((resolve, reject) => {
    const socket = connect(url, {
      auth: { token: fakeToken(sub) },
      transports: ["websocket"],
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("socket did not connect"));
    }, 10_000);
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function onlineFriends(socket, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("no friends acknowledgement")),
      5_000,
    );
    socket.emit("get_online_friends", payload, (ids) => {
      clearTimeout(timer);
      resolve(ids);
    });
  });
}

function validCreateOn(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server stopped responding")),
      5_000,
    );
    socket.once("sync_state", (state) => {
      clearTimeout(timer);
      resolve(state);
    });
    socket.emit("create_session", { avatar: AVATAR, displayName: "Still here" });
  });
}

describe("client event payload boundary", () => {
  it("rejects non-object payloads and keeps serving the socket", async () => {
    const socket = await connectedSocket("88888888-8888-4888-8888-888888888888");
    try {
      expect(await onlineFriends(socket, null)).toEqual([]);

      for (const event of [
        "send_invite",
        "create_session",
        "join_session",
        "start_session",
        "finish_flow_focus",
        "stop_session",
        "set_pet",
      ]) {
        socket.emit(event, null);
        socket.emit(event, []);
      }

      const state = await validCreateOn(socket);
      expect(state.players[socket.id].displayName).toBe("Still here");
    } finally {
      socket.close();
    }
  });

  it("bounds and type-checks friend id lists", async () => {
    const socket = await connectedSocket("99999999-9999-4999-8999-999999999999");
    try {
      expect(await onlineFriends(socket, { friendIds: "not-an-array" })).toEqual([]);
      expect(await onlineFriends(socket, { friendIds: [null] })).toEqual([]);
      expect(
        await onlineFriends(socket, {
          friendIds: Array.from({ length: 101 }, (_, i) => `${i}`),
        }),
      ).toEqual([]);

      const state = await validCreateOn(socket);
      expect(state.sessionId).toBeTruthy();
    } finally {
      socket.close();
    }
  });
});
