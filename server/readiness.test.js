import { describe, expect, it, vi } from 'vitest';
import { createReadinessChecker } from './readiness.js';

function fakeSupabase(result) {
  const limit = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, limit };
}

describe('database readiness', () => {
  it('reports a usable development server when persistence is disabled', async () => {
    const check = createReadinessChecker(null);
    await expect(check()).resolves.toEqual({
      ok: true,
      mode: 'development',
      dependencies: { database: 'disabled' },
    });
  });

  it('uses a minimal head query without returning profile data', async () => {
    const { client, from, select, limit } = fakeSupabase({ data: null, error: null });
    const observe = vi.fn();
    const times = [100, 100, 118, 118];
    const check = createReadinessChecker(client, {
      observe,
      now: () => times.shift() ?? 118,
    });

    await expect(check()).resolves.toEqual({
      ok: true,
      dependencies: { database: 'ready' },
    });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('id', { head: true });
    expect(limit).toHaveBeenCalledWith(1);
    expect(observe).toHaveBeenCalledWith({ outcome: 'success', durationMs: 18 });
  });

  it('fails closed without exposing the database error', async () => {
    const { client } = fakeSupabase({
      data: null,
      error: { code: 'PGRST001', message: 'private detail' },
    });
    const observe = vi.fn();
    const check = createReadinessChecker(client, { observe });

    await expect(check()).resolves.toEqual({
      ok: false,
      dependencies: { database: 'unavailable' },
    });
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failure',
        error: expect.objectContaining({ code: 'PGRST001' }),
      }),
    );
  });

  it('caches probes and deduplicates concurrent requests', async () => {
    let resolveProbe;
    const request = new Promise((resolve) => {
      resolveProbe = resolve;
    });
    const limit = vi.fn(() => request);
    const client = { from: () => ({ select: () => ({ limit }) }) };
    let now = 100;
    const check = createReadinessChecker(client, { now: () => now });

    const first = check();
    const concurrent = check();
    resolveProbe({ data: null, error: null });
    await Promise.all([first, concurrent]);
    await check();
    expect(limit).toHaveBeenCalledTimes(1);

    now = 6000;
    await check();
    expect(limit).toHaveBeenCalledTimes(2);
  });
});
