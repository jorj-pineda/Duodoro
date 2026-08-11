import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Fake Supabase ────────────────────────────────────────────────────────────
// Just enough of postgrest-js to record what the hook asked for. Every builder
// method returns `this` and the builder itself is thenable, so the hook's
// `await sb.from(...).update(...).eq(...).select(...)` chains resolve to
// whatever the test configured for that operation.
type Result = { data: unknown; error: unknown };

const ROOM = "55555555-5555-5555-5555-555555555555";
const ME = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PARTNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// One shared goal, owned by the partner — the case that never worked.
const partnersGoal = {
  id: "task-1",
  owner_id: PARTNER,
  room_code: ROOM,
  content: "ship the deck together",
  is_done: false,
  is_shared: true,
  created_at: "2026-01-01T00:00:00Z",
  completed_by: null,
};

const myPersonalNote = {
  id: "task-2",
  owner_id: ME,
  room_code: null,
  content: "my own todo",
  is_done: false,
  is_shared: false,
  created_at: "2026-01-01T00:00:00Z",
  completed_by: null,
};

function createFakeSupabase() {
  const ops: { kind: string; table?: string; rpc?: string; args?: unknown }[] =
    [];
  const results: Record<string, Result> = {
    // fetchMine reads room_code IS NULL, fetchShared reads room_code = ROOM.
    // Both go through `select`, so the fake keys them apart by call order.
    selectMine: { data: [myPersonalNote], error: null },
    selectShared: { data: [partnersGoal], error: null },
    update: { data: [{ id: "task-2" }], error: null },
    delete: { data: [{ id: "task-2" }], error: null },
    insert: { data: null, error: null },
    rpc: { data: null, error: null },
  };

  let selectCount = 0;

  const makeBuilder = (kind: string, table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    const chain =
      (name: string) =>
      (...args: unknown[]) => {
        if (name === "is" && args[0] === "room_code") b._which = "selectMine";
        if (name === "eq" && args[0] === "room_code") b._which = "selectShared";
        return b;
      };
    for (const m of ["select", "eq", "is", "order", "in", "single", "neq"]) {
      b[m] = chain(m);
    }
    b.then = (
      resolve: (v: Result) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      let key = kind;
      if (kind === "select") {
        // First mount fetches mine then shared; after that, trust the filter.
        key = b._which ?? (selectCount++ === 0 ? "selectMine" : "selectShared");
      }
      ops.push({ kind: key, table });
      return Promise.resolve(
        results[key] ?? { data: null, error: null },
      ).then(resolve, reject);
    };
    return b;
  };

  const sb = {
    from(table: string) {
      return {
        select: (...a: unknown[]) => {
          const b = makeBuilder("select", table);
          return b.select(...a);
        },
        insert: () => makeBuilder("insert", table),
        update: () => makeBuilder("update", table),
        delete: () => makeBuilder("delete", table),
      };
    },
    rpc(fn: string, args: unknown) {
      ops.push({ kind: "rpc", rpc: fn, args });
      return Promise.resolve(results.rpc);
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  };

  return { sb, ops, results };
}

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/lib/supabase", () => ({ getSupabase: () => fake.sb }));

import { useStickyNotes } from "./useStickyNotes";

const mountShared = async () => {
  const hook = renderHook(() => useStickyNotes(true, ME, ROOM));
  // Wait for the initial fetches, then switch to the shared board.
  await waitFor(() =>
    expect(fake.ops.some((o) => o.kind === "selectShared")).toBe(true),
  );
  await act(async () => hook.result.current.setTab("shared"));
  await waitFor(() =>
    expect(hook.result.current.activeTasks).toHaveLength(1),
  );
  return hook;
};

describe("useStickyNotes shared-goal writes", () => {
  beforeEach(() => {
    fake = createFakeSupabase();
  });

  // The whole point of the branch. tasks_update is owner-only, so a plain
  // UPDATE on the partner's goal matched zero rows and reverted.
  it("ticks a partner's shared goal through the RPC, not a table update", async () => {
    fake.results.rpc = {
      data: { ...partnersGoal, is_done: true, completed_by: ME },
      error: null,
    };
    const hook = await mountShared();

    await act(async () => {
      await hook.result.current.toggleTask("task-1", true);
    });

    const rpc = fake.ops.find((o) => o.kind === "rpc");
    expect(rpc?.rpc).toBe("toggle_shared_task");
    expect(rpc?.args).toEqual({ p_task_id: "task-1", p_done: true });
    // …and it did NOT fall back to the update that can't work.
    expect(fake.ops.some((o) => o.kind === "update")).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it("takes completed_by from the returned row so the UI can attribute it", async () => {
    fake.results.rpc = {
      data: { ...partnersGoal, is_done: true, completed_by: ME },
      error: null,
    };
    const hook = await mountShared();

    await act(async () => {
      await hook.result.current.toggleTask("task-1", true);
    });

    const goal = hook.result.current.activeTasks[0];
    expect(goal.is_done).toBe(true);
    expect(goal.completed_by).toBe(ME);
  });

  it("keeps the goal unticked and explains why when the RPC refuses", async () => {
    fake.results.rpc = {
      data: null,
      error: { message: "no shared goal with that id in your current session" },
    };
    const hook = await mountShared();

    await act(async () => {
      await hook.result.current.toggleTask("task-1", true);
    });

    expect(hook.result.current.activeTasks[0].is_done).toBe(false);
    expect(hook.result.current.error).toMatch(/shared goal/i);
  });

  it("still uses a plain update for personal notes, which have one writer", async () => {
    const hook = renderHook(() => useStickyNotes(true, ME, ROOM));
    await waitFor(() =>
      expect(hook.result.current.activeTasks).toHaveLength(1),
    );

    await act(async () => {
      await hook.result.current.toggleTask("task-2", true);
    });

    expect(fake.ops.some((o) => o.kind === "update")).toBe(true);
    expect(fake.ops.some((o) => o.kind === "rpc")).toBe(false);
  });

  // A failed read used to leave the list untouched and render the empty state,
  // which is how migration 018's 42P17 recursion stayed invisible.
  it("reports a failed shared read instead of showing an empty board", async () => {
    fake.results.selectShared = {
      data: null,
      error: { message: "infinite recursion detected in policy" },
    };
    const hook = renderHook(() => useStickyNotes(true, ME, ROOM));

    await waitFor(() => expect(hook.result.current.error).toBeTruthy());
    expect(hook.result.current.error).toMatch(/shared goals/i);
  });
});
