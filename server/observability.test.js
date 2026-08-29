import { describe, expect, it, vi } from 'vitest';
import {
  correlationRef,
  createLogger,
  createMetrics,
  safeErrorFields,
} from './observability.js';

function fakeSink() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('structured observability', () => {
  it('writes one parseable JSON record with stable service fields', () => {
    const sink = fakeSink();
    const logger = createLogger({
      sink,
      now: () => new Date('2026-08-29T12:00:00.000Z'),
    });

    logger.info('server_started', { port: 3001 });

    expect(JSON.parse(sink.log.mock.calls[0][0])).toEqual({
      timestamp: '2026-08-29T12:00:00.000Z',
      level: 'info',
      service: 'duodoro-realtime',
      event: 'server_started',
      port: 3001,
    });
  });

  it('redacts identifiers, tokens, payloads, and emails at every depth', () => {
    const sink = fakeSink();
    const logger = createLogger({ sink });

    logger.warn('request_rejected', {
      userId: 'user-1',
      socket_id: 'socket-1',
      sessionId: 'session-1',
      payload: { token: 'secret' },
      nested: { email: 'person@example.com', outcome: 'rejected' },
      room_ref: 'room_abc123',
    });

    const record = JSON.parse(sink.warn.mock.calls[0][0]);
    expect(record).not.toHaveProperty('userId');
    expect(record).not.toHaveProperty('socket_id');
    expect(record).not.toHaveProperty('sessionId');
    expect(record).not.toHaveProperty('payload');
    expect(record.nested).toEqual({ outcome: 'rejected' });
    expect(record.room_ref).toBe('room_abc123');
  });

  it('creates stable opaque correlation references', () => {
    expect(correlationRef('room', 'session-1')).toBe(
      correlationRef('room', 'session-1'),
    );
    expect(correlationRef('room', 'session-1')).not.toContain('session-1');
    expect(correlationRef('room', 'session-1')).not.toBe(
      correlationRef('room', 'session-2'),
    );
    expect(correlationRef('room', null)).toBeNull();
  });

  it('keeps useful error classifications without logging messages', () => {
    expect(
      safeErrorFields({
        name: 'PostgrestError',
        code: 'PGRST001',
        status: 503,
        message: 'private database detail',
      }),
    ).toEqual({
      error_type: 'PostgrestError',
      error_code: 'PGRST001',
      error_status: 503,
    });
  });

  it('tracks counters, gauges, and bounded duration aggregates', () => {
    let now = 1000;
    const logger = { info: vi.fn() };
    const metrics = createMetrics({ logger, now: () => now });

    metrics.increment('connections_total');
    metrics.increment('connections_total', 2);
    metrics.setGauge('active_sessions', 4);
    metrics.observeDuration('rpc_record_focus_session_ms', 12.4);
    metrics.observeDuration('rpc_record_focus_session_ms', 20.6);
    now = 4500;

    expect(metrics.snapshot()).toEqual({
      uptime_seconds: 3,
      counters: { connections_total: 3 },
      gauges: { active_sessions: 4 },
      durations: {
        rpc_record_focus_session_ms: { count: 2, total_ms: 33, max_ms: 21 },
      },
    });

    metrics.logSnapshot({ active_rooms: 4 });
    expect(logger.info).toHaveBeenCalledWith('runtime_snapshot', {
      active_rooms: 4,
      metrics: metrics.snapshot(),
    });
  });
});
