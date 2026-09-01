import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealtimeApp } from './app.js';
import { createLogger } from './observability.js';

const runningApps = new Set();

function quietLogger() {
  return createLogger({
    sink: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
}

afterEach(async () => {
  await Promise.all([...runningApps].map((realtime) => realtime.stop('test')));
  runningApps.clear();
});

describe('realtime app factory', () => {
  it('does not bind a port until start is called', () => {
    const realtime = createRealtimeApp({ logger: quietLogger() });
    runningApps.add(realtime);

    expect(realtime.server.listening).toBe(false);
    expect(realtime.server.address()).toBeNull();
  });

  it('serves probes on an ephemeral port and tears down explicitly', async () => {
    const realtime = createRealtimeApp({ logger: quietLogger() });
    runningApps.add(realtime);

    const address = await realtime.start(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await expect(fetch(`${baseUrl}/health`).then((response) => response.json()))
      .resolves.toEqual({ ok: true });
    await expect(fetch(`${baseUrl}/ready`).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }))).resolves.toEqual({
      status: 200,
      body: {
        ok: true,
        mode: 'development',
        dependencies: { database: 'disabled' },
      },
    });

    await realtime.stop('test');
    expect(realtime.server.listening).toBe(false);
  });
});
