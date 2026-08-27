import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { io as connect } from "socket.io-client";

const AVATAR = {
  skinColor: "#F1C27D",
  hairStyle: "bob",
  hairColor: "#3B2314",
  eyeStyle: "normal",
  outfitColor: "#4A6FA5",
};

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

function connectClient(sub) {
  return new Promise((resolve, reject) => {
    const socket = connect(url, {
      auth: { token: fakeToken(sub) },
      transports: ["websocket"],
    });
    const timer = setTimeout(() => reject(new Error("socket did not connect")), 10_000);
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function createRoom(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("room was not created")), 10_000);
    socket.once("sync_state", (state) => {
      clearTimeout(timer);
      resolve(state);
    });
    socket.emit("create_session", { avatar: AVATAR, displayName: "Host" });
  });
}

function joinRoom(socket, sessionId, displayName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("join did not settle"));
    }, 10_000);
    const onSync = (state) => {
      cleanup();
      resolve({ ok: true, state });
    };
    const onError = ({ message }) => {
      cleanup();
      resolve({ ok: false, message });
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("sync_state", onSync);
      socket.off("session_error", onError);
    };
    socket.on("sync_state", onSync);
    socket.on("session_error", onError);
    socket.emit("join_session", { sessionId, avatar: AVATAR, displayName });
  });
}

function nextEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), 10_000);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe("two-person session capacity", () => {
  it("rejects a third distinct user without changing the room", async () => {
    const host = await connectClient("11111111-1111-4111-8111-111111111111");
    const partner = await connectClient("22222222-2222-4222-8222-222222222222");
    const third = await connectClient("33333333-3333-4333-8333-333333333333");
    try {
      const created = await createRoom(host);
      expect((await joinRoom(partner, created.sessionId, "Partner")).ok).toBe(true);

      expect(await joinRoom(third, created.sessionId, "Third")).toEqual({
        ok: false,
        message: "Session is full",
      });

      const synced = nextEvent(host, "sync_state");
      host.emit("request_sync");
      expect((await synced).playerCount).toBe(2);
    } finally {
      host.close();
      partner.close();
      third.close();
    }
  });

  it("lets an existing participant reconnect to a full room", async () => {
    const host = await connectClient("44444444-4444-4444-8444-444444444444");
    const partner = await connectClient("55555555-5555-4555-8555-555555555555");
    let replacement;
    try {
      const created = await createRoom(host);
      expect((await joinRoom(partner, created.sessionId, "Partner")).ok).toBe(true);

      const disconnected = nextEvent(host, "player_disconnected");
      partner.close();
      await disconnected;

      replacement = await connectClient("55555555-5555-4555-8555-555555555555");
      const result = await joinRoom(replacement, created.sessionId, "Partner back");
      expect(result.ok).toBe(true);
      expect(result.state.playerCount).toBe(2);
    } finally {
      host.close();
      partner.close();
      replacement?.close();
    }
  });

  it("allows only one of two concurrent joins to claim the final seat", async () => {
    const host = await connectClient("66666666-6666-4666-8666-666666666666");
    const a = await connectClient("77777777-7777-4777-8777-777777777777");
    const b = await connectClient("88888888-8888-4888-8888-888888888888");
    try {
      const created = await createRoom(host);
      const results = await Promise.all([
        joinRoom(a, created.sessionId, "A"),
        joinRoom(b, created.sessionId, "B"),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, message: "Session is full" },
      ]);
    } finally {
      host.close();
      a.close();
      b.close();
    }
  });

  it("stops issuing invitations after both seats are occupied", async () => {
    const host = await connectClient("99999999-9999-4999-8999-999999999999");
    const partner = await connectClient("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    try {
      const created = await createRoom(host);
      expect((await joinRoom(partner, created.sessionId, "Partner")).ok).toBe(true);

      const inviteError = nextEvent(host, "invite_error");
      host.emit("send_invite", {
        targetUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sessionId: created.sessionId,
        fromName: "Host",
      });
      expect(await inviteError).toEqual({ message: "Session is full" });
    } finally {
      host.close();
      partner.close();
    }
  });
});
