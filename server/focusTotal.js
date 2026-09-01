// ─────────────────────────────────────────────────────────────────────────────
// Total completed focus seconds for one user — the input to petStageAt().
//
// One RPC, one integer (`total_focus_seconds`, migration 021). It is
// service_role-only on purpose: it takes a user id, so anything that could
// call it with an argument could read anyone's history. The server is the
// only caller because the server is what derives `petStage` — for *both*
// players, so two people never see the same animal at two sizes.
//
// This used to select one row per completed session and add them up here,
// because PostgREST cannot sum over an embedded table. That is ~1,500 rows a
// year for a daily user, fetched on every create_session and every
// join_session, to compute one number — and silently capped by the project's
// API "Max rows" setting, which reports no error when it truncates.
//
// **Zero and "couldn't tell" are different answers.** A failed read returns
// `null`, not 0: the caller turns that into `grown` (the size every pet was
// before growth existed) rather than shrinking a veteran's companion to a
// hatchling because a query timed out. Same rule the client's stats hooks
// follow — an empty result and a failed request must never render the same
// way. That is why an absent or unparseable `data` is also `null` here: the
// function is declared `RETURNS BIGINT` and coalesces to 0, so a non-number
// coming back means the answer did not arrive, not that it was zero.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Completed focus seconds for `userId`, or `null` if the total is unknowable.
 *
 * Returns 0 — genuinely no history — only in dev mode, where there is no
 * Supabase client at all and every pet is young, and for an anonymous socket,
 * which has no history to read.
 */
async function fetchTotalFocusSeconds(
  supabase,
  userId,
  { now = Date.now, observe = () => {} } = {},
) {
  if (!supabase || !userId) return 0;

  const startedAt = now();
  const { data, error } = await supabase.rpc('total_focus_seconds', {
    target: userId,
  });

  if (error) {
    observe({
      operation: 'total_focus_seconds',
      outcome: 'database_error',
      durationMs: now() - startedAt,
      attempt: 1,
      error,
    });
    return null;
  }

  // PostgREST hands a bigint back as a JSON number, but a scalar RPC can also
  // arrive as a one-element array or a string depending on the client version,
  // so this parses rather than trusts. Note what is *not* used here: plain
  // Number(), which reads null and '' as 0 and would turn a missing answer
  // into "this user has never focused".
  const raw = Array.isArray(data) ? data[0] : data;
  const seconds =
    typeof raw === 'number' ? raw
    : typeof raw === 'string' && raw.trim() !== '' ? Number(raw)
    : NaN;

  if (!Number.isFinite(seconds) || seconds < 0) {
    observe({
      operation: 'total_focus_seconds',
      outcome: 'invalid_response',
      durationMs: now() - startedAt,
      attempt: 1,
    });
    return null;
  }
  observe({
    operation: 'total_focus_seconds',
    outcome: 'success',
    durationMs: now() - startedAt,
    attempt: 1,
  });
  return seconds;
}

module.exports = { fetchTotalFocusSeconds };
