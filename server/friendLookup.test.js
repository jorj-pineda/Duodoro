import { describe, expect, it } from "vitest";
import { fetchFriendIds } from "./friendLookup.js";

/**
 * Query builder that only implements `.eq()`. The previous lookup interpolated
 * both sides into one `.or(...)` string; that cannot pass against this fake.
 */
function fakeSupabase({ requester = [], addressee = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      from(table) {
        calls.push({ table, filters: [] });
        const call = calls[calls.length - 1];
        const builder = {
          select() {
            return builder;
          },
          eq(column, value) {
            call.filters.push([column, value]);
            return builder;
          },
          then(resolve, reject) {
            const requesterId = call.filters.find(([column]) => column === "requester_id");
            const result = error
              ? { data: null, error }
              : {
                  data: requesterId ? requester : addressee,
                  error: null,
                };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
        return builder;
      },
    },
  };
}

describe("fetchFriendIds", () => {
  it("is empty without Supabase or a user", async () => {
    expect(await fetchFriendIds(null, "user-1")).toEqual([]);
    expect(await fetchFriendIds(fakeSupabase().client, null)).toEqual([]);
  });

  it("loads accepted friends from both sides with bound equality filters", async () => {
    const { client, calls } = fakeSupabase({
      requester: [{ addressee_id: "friend-a" }],
      addressee: [{ requester_id: "friend-b" }],
    });

    await expect(fetchFriendIds(client, "me")).resolves.toEqual([
      "friend-a",
      "friend-b",
    ]);
    expect(calls).toEqual([
      {
        table: "friendships",
        filters: [
          ["status", "accepted"],
          ["requester_id", "me"],
        ],
      },
      {
        table: "friendships",
        filters: [
          ["status", "accepted"],
          ["addressee_id", "me"],
        ],
      },
    ]);
  });

  it("throws when either side of the read fails", async () => {
    const { client } = fakeSupabase({ error: { code: "PGRST301" } });
    await expect(fetchFriendIds(client, "me")).rejects.toMatchObject({
      code: "PGRST301",
    });
  });
});
