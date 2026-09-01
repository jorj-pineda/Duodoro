const { createHash } = require('node:crypto');

const SERVICE = 'duodoro-realtime';
const FORBIDDEN_FIELD = /(?:authorization|display_?name|email|payload|session_?id|socket_?id|token|user_?id)/i;

function correlationRef(kind, value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `${kind}_${digest}`;
}

function safeErrorFields(error) {
  if (!error || typeof error !== 'object') return {};
  const fields = {};
  if (typeof error.name === 'string') fields.error_type = error.name;
  if (typeof error.code === 'string') fields.error_code = error.code;
  const status = Number(error.status ?? error.statusCode);
  if (Number.isInteger(status)) fields.error_status = status;
  return fields;
}

function sanitizeFields(value) {
  if (Array.isArray(value)) return value.map(sanitizeFields);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_FIELD.test(key))
      .map(([key, nested]) => [key, sanitizeFields(nested)]),
  );
}

function createLogger({ sink = console, now = () => new Date() } = {}) {
  function write(level, event, fields = {}) {
    const record = {
      timestamp: now().toISOString(),
      level,
      service: SERVICE,
      event,
      ...sanitizeFields(fields),
    };
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    sink[method](JSON.stringify(record));
    return record;
  }

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

function createMetrics({ logger, now = Date.now } = {}) {
  const startedAt = now();
  const counters = new Map();
  const gauges = new Map();
  const durations = new Map();

  function increment(name, amount = 1) {
    counters.set(name, (counters.get(name) || 0) + amount);
  }

  function setGauge(name, value) {
    gauges.set(name, value);
  }

  function observeDuration(name, durationMs) {
    const value = Math.max(0, Math.round(durationMs));
    const current = durations.get(name) || { count: 0, total_ms: 0, max_ms: 0 };
    current.count += 1;
    current.total_ms += value;
    current.max_ms = Math.max(current.max_ms, value);
    durations.set(name, current);
  }

  function snapshot() {
    return {
      uptime_seconds: Math.max(0, Math.floor((now() - startedAt) / 1000)),
      counters: Object.fromEntries(counters),
      gauges: Object.fromEntries(gauges),
      durations: Object.fromEntries(durations),
    };
  }

  function logSnapshot(fields = {}) {
    return logger?.info('runtime_snapshot', { ...fields, metrics: snapshot() });
  }

  return { increment, setGauge, observeDuration, snapshot, logSnapshot };
}

function createRpcObserver({ logger, metrics } = {}) {
  return ({ operation, outcome, durationMs, attempt, retrying = false, error }) => {
    const roundedDuration = Math.max(0, Math.round(durationMs));
    metrics?.increment(`rpc_${operation}_attempts_total`);
    metrics?.increment(`rpc_${operation}_${outcome}_total`);
    if (retrying) metrics?.increment(`rpc_${operation}_retries_total`);
    metrics?.observeDuration(`rpc_${operation}_duration_ms`, roundedDuration);

    const fields = {
      operation,
      outcome,
      duration_ms: roundedDuration,
      attempt,
      retrying,
      ...safeErrorFields(error),
    };
    const level = outcome === 'success' || outcome === 'idempotent'
      ? 'info'
      : retrying ? 'warn' : 'error';
    logger?.[level]('supabase_rpc_attempt', fields);
  };
}

module.exports = {
  SERVICE,
  correlationRef,
  createLogger,
  createMetrics,
  createRpcObserver,
  safeErrorFields,
  sanitizeFields,
};
