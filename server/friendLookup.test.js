import { describe, expect, it } from "vitest";
import { fetchFriendIds, normalizeFriendIds } from "./friendLookup.js";

/**
 * A Supabase double that records RPC (and optional table) calls. The previous
 * lookup used `.from()` equality filters; a fake that only implements `.rpc()`
 * fails that path and proves the RPC is what ran.
 */
function fakeSupabase({ rpcResult, tableRows = null } = {}) {
  const calls = [];
  const fromCalls = [];
  return {
    calls,
    fromCalls,
    client: {
      rpc(fn, args) {
        calls.push([fn, args]);
        return Promise.resolve(rpcResult);
      },
      from(table) {
        const filters = {};
        const builder = {
          select() {
            return builder;
          },
          eq(column, value) {
            filters[column] = value;
            return builder;
          },
          then(resolve, reject) {
            fromCalls.push({ table, filters });
            const rows = tableRows ? tableRows(filters) : [];
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    },
  };
}

describe("normalizeFriendIds", () => {
  it("accepts a JSON array, a Postgres array literal, and row objects", () => {
    expect(normalizeFriendIds(["a", "b"])).toEqual(["a", "b"]);
    expect(normalizeFriendIds("{a,b}")).toEqual(["a", "b"]);
    expect(normalizeFriendIds([{ friend_id: "a" }, { friend_id: "b" }])).toEqual([
      "a",
      "b",
    ]);
    expect(normalizeFriendIds(null)).toEqual([]);
  });

  it("unwraps a PostgREST-wrapped UUID[] scalar", () => {
    expect(normalizeFriendIds([["friend-a", "friend-b"]])).toEqual([
      "friend-a",
      "friend-b",
    ]);
    expect(normalizeFriendIds('["friend-a","friend-b"]')).toEqual([
      "friend-a",
      "friend-b",
    ]);
  });
});

describe("fetchFriendIds", () => {
  it("is empty without Supabase or a user", async () => {
    expect(await fetchFriendIds(null, "user-1")).toEqual([]);
    expect(await fetchFriendIds(fakeSupabase({
      rpcResult: { data: ["x"], error: null },
    }).client, null)).toEqual([]);
  });

  it("asks Postgres for the accepted-friend id list", async () => {
    const { client, calls, fromCalls } = fakeSupabase({
      rpcResult: { data: ["friend-a", "friend-b"], error: null },
    });

    await expect(fetchFriendIds(client, "me")).resolves.toEqual([
      "friend-a",
      "friend-b",
    ]);
    expect(calls).toEqual([["list_accepted_friend_ids", { target: "me" }]]);
    expect(fromCalls).toEqual([]);
  });

  it("confirms via table filters when the RPC succeeds with an empty parse", async () => {
    const { client, fromCalls } = fakeSupabase({
      rpcResult: { data: [[]], error: null },
      tableRows(filters) {
        if (filters.requester_id === "me") return [{ addressee_id: "Friend-A" }];
        return [];
      },
    });

    await expect(fetchFriendIds(client, "me")).resolves.toEqual(["friend-a"]);
    expect(fromCalls).toHaveLength(2);
  });

  it("falls back to bound table filters when the RPC fails", async () => {
    const { client, calls, fromCalls } = fakeSupabase({
      rpcResult: { data: null, error: { code: "PGRST202" } },
      tableRows(filters) {
        if (filters.requester_id === "me") return [{ addressee_id: "friend-a" }];
        if (filters.addressee_id === "me") return [{ requester_id: "friend-b" }];
        return [];
      },
    });

    await expect(fetchFriendIds(client, "me")).resolves.toEqual([
      "friend-a",
      "friend-b",
    ]);
    expect(calls).toEqual([["list_accepted_friend_ids", { target: "me" }]]);
    expect(fromCalls).toHaveLength(2);
  });

  it("falls back to table filters for any RPC error, not only a missing function", async () => {
    const { client, fromCalls } = fakeSupabase({
      rpcResult: { data: null, error: { code: "PGRST301" } },
      tableRows(filters) {
        if (filters.requester_id === "me") return [{ addressee_id: "friend-a" }];
        return [];
      },
    });

    await expect(fetchFriendIds(client, "me")).resolves.toEqual(["friend-a"]);
    expect(fromCalls).toHaveLength(2);
  });

  it("throws only when both the RPC and table reads fail", async () => {
    const { client } = fakeSupabase({
      rpcResult: { data: null, error: { code: "PGRST301" } },
      tableRows() {
        throw new Error("table read failed");
      },
    });
    await expect(fetchFriendIds(client, "me")).rejects.toMatchObject({
      code: "PGRST301",
    });
  });
});
