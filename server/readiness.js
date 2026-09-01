function createReadinessChecker(
  supabase,
  {
    ttlMs = 5000,
    timeoutMs = 2000,
    now = Date.now,
    observe = () => {},
  } = {},
) {
  let cached = null;
  let expiresAt = 0;
  let pending = null;

  async function probe() {
    if (!supabase) {
      return {
        ok: true,
        mode: 'development',
        dependencies: { database: 'disabled' },
      };
    }

    const startedAt = now();
    let timeout;
    try {
      const request = supabase
        .from('profiles')
        .select('id', { head: true })
        .limit(1);
      const response = await Promise.race([
        request,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('readiness timeout')), timeoutMs);
          timeout.unref?.();
        }),
      ]);
      if (response?.error) throw response.error;
      const result = { ok: true, dependencies: { database: 'ready' } };
      observe({ outcome: 'success', durationMs: now() - startedAt });
      return result;
    } catch (error) {
      observe({ outcome: 'failure', durationMs: now() - startedAt, error });
      return { ok: false, dependencies: { database: 'unavailable' } };
    } finally {
      clearTimeout(timeout);
    }
  }

  return async function checkReadiness() {
    const currentTime = now();
    if (cached && currentTime < expiresAt) return cached;
    if (pending) return pending;

    pending = probe().then((result) => {
      cached = result;
      expiresAt = now() + ttlMs;
      return result;
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
}

module.exports = { createReadinessChecker };
