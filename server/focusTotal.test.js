import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchTotalFocusSeconds } from "./focusTotal.js";

/**
 * A Supabase double that records what it was asked for.
 *
 * The chain is thenable rather than promise-returning at the end, because
 * that is how supabase-js behaves: every builder method returns the builder
 * and the request only fires when it is awaited.
 */
function fakeSupabase(result) {
  const calls = { from: [], select: [], eq: [] };
  const builder = {
    from(table) { calls.from.push(table); return builder; },
    select(cols) { calls.select.push(cols); return builder; },
    eq(col, val) { calls.eq.push([col, val]); return builder; },
    then(resolve) { resolve(result); },
  };
  return { client: builder, calls };
}

const rows = (...focus) => ({
  data: focus.map((actual_focus) => ({ sessions: { actual_focus } })),
  error: null,
});

describe('fetchTotalFocusSeconds', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('is 0 in dev mode, where there is no Supabase at all', async () => {
    expect(await fetchTotalFocusSeconds(null, 'user-1')).toBe(0);
  });

  it('is 0 for an anonymous socket, which has no history to read', async () => {
    const { client } = fakeSupabase(rows(600));
    expect(await fetchTotalFocusSeconds(client, null)).toBe(0);
  });

  it('totals the completed focus it is given', async () => {
    const { client } = fakeSupabase(rows(1500, 1500, 600));
    expect(await fetchTotalFocusSeconds(client, 'user-1')).toBe(3600);
  });

  it('is 0, not null, for a user with no completed sessions yet', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await fetchTotalFocusSeconds(client, 'user-1')).toBe(0);
  });

  /**
   * The guard that matters most here. A read that fails must not read as a
   * beginner: `null` is what the caller turns into `grown`, and returning 0
   * would shrink someone's pet every time the database hiccuped.
   */
  it('is null — not 0 — when the read fails', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    expect(await fetchTotalFocusSeconds(client, 'user-1')).toBe(null);
  });

  it('asks only about this user', async () => {
    const { client, calls } = fakeSupabase(rows(600));
    await fetchTotalFocusSeconds(client, 'user-1');
    expect(calls.eq).toContainEqual(['user_id', 'user-1']);
  });
});
