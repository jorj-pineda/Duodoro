const RETRY_DELAYS_MS = [250, 1000];

// PostgREST/API statuses and PostgreSQL codes that can succeed unchanged on a
// later attempt. Validation, permission, and constraint errors are deliberately
// absent: retrying those only adds load and hides the real problem.
const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_DATABASE_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53P00", // insufficient_resources
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "PGRST000",
  "PGRST001",
  "PGRST002",
]);

function isTransientResponseError(error) {
  const status = Number(error?.status ?? error?.statusCode);
  if (TRANSIENT_HTTP_STATUSES.has(status)) return true;

  const code = typeof error?.code === "string" ? error.code : "";
  return code.startsWith("08") || TRANSIENT_DATABASE_CODES.has(code);
}

function rpcRow(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row.session_id !== "string" ||
    row.session_id.length === 0 ||
    typeof row.inserted !== "boolean"
  ) {
    throw new Error("record_focus_session returned an unusable result");
  }
  return { sessionId: row.session_id, inserted: row.inserted };
}

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Persist one focus round through the transaction in migration 022.
 *
 * Every attempt sends the exact same recording key and payload. PostgreSQL's
 * unique key makes a retry after a lost response return the original record,
 * while conflicting reuse is rejected by the function.
 */
async function recordFocusSession(
  supabase,
  payload,
  { retryDelays = RETRY_DELAYS_MS, wait = defaultWait } = {},
) {
  if (!supabase) return null;

  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await supabase.rpc("record_focus_session", payload);
    } catch (error) {
      // A thrown request error means no PostgREST response arrived. The write
      // may still have committed, which is exactly why the key is idempotent.
      if (attempt >= retryDelays.length) throw error;
      await wait(retryDelays[attempt]);
      continue;
    }

    if (!response?.error) return rpcRow(response?.data);

    if (
      attempt >= retryDelays.length ||
      !isTransientResponseError(response.error)
    ) {
      const error = new Error(
        response.error.message || "record_focus_session failed",
      );
      error.code = response.error.code;
      error.status = response.error.status ?? response.error.statusCode;
      throw error;
    }

    await wait(retryDelays[attempt]);
  }
}

module.exports = {
  RETRY_DELAYS_MS,
  isTransientResponseError,
  recordFocusSession,
};
