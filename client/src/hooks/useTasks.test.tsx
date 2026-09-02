import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const task = (id: string, isDone: boolean) => ({
  id,
  owner_id: OWNER,
  room_code: null,
  content: id,
  is_done: isDone,
  is_shared: false,
  created_at: "2026-01-01T00:00:00Z",
  completed_by: null,
});

function createFakeSupabase() {
  const results: Record<string, Result> = {
    select: {
      data: [task("pending", false), task("deleted", true), task("refused", true)],
      error: null,
    },
    delete: { data: [{ id: "deleted" }], error: null },
  };

  const builder = (kind: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const method of ["select", "eq", "is", "order", "in"]) {
      chain[method] = () => chain;
    }
    chain.then = (
      resolve: (value: Result) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(results[kind]).then(resolve, reject);
    return chain;
  };

  return {
    results,
    sb: {
      from: () => ({
        select: () => builder("select"),
        delete: () => builder("delete"),
      }),
    },
  };
}

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/lib/supabase", () => ({ getSupabase: () => fake.sb }));

import { useTasks } from "./useTasks";

describe("useTasks bulk deletion", () => {
  beforeEach(() => {
    fake = createFakeSupabase();
  });

  it("removes only completed task ids returned by the database", async () => {
    const hook = renderHook(() => useTasks(OWNER));
    await waitFor(() => expect(hook.result.current.tasks).toHaveLength(3));

    await act(async () => {
      await hook.result.current.clearCompleted();
    });

    expect(hook.result.current.tasks.map(({ id }) => id)).toEqual([
      "pending",
      "refused",
    ]);
    expect(hook.result.current.error).toMatch(/clear all completed tasks/i);
  });
});
