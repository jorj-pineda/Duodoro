// ─────────────────────────────────────────────────────────────────────────────
// Total completed focus seconds for one user — the input to petStageAt().
//
// Separate from index.js because it is the one part of the pet-growth path
// that talks to the database, and so the one part worth faking in a test.
//
// **Zero and "couldn't tell" are different answers.** A failed read returns
// `null`, not 0: the caller turns that into `grown` (the size every pet was
// before growth existed) rather than shrinking a veteran's companion to a
// hatchling because a query timed out. This is the same rule the client's
// stats hooks follow — an empty result and a failed request must never render
// the same way.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Completed focus seconds for `userId`, or `null` if the total is unknowable.
 *
 * Returns 0 — genuinely no history — only in dev mode, where there is no
 * Supabase client at all and every pet is young.
 */
async function fetchTotalFocusSeconds(supabase, userId) {
  if (!supabase || !userId) return 0;

  const { data, error } = await supabase
    .from('session_participants')
    .select('sessions!inner(actual_focus, completed)')
    .eq('user_id', userId)
    .eq('sessions.completed', true);

  if (error) {
    console.error('Failed to load focus total:', error.message);
    return null;
  }

  return (data ?? []).reduce((sum, row) => {
    const focus = row.sessions?.actual_focus;
    return sum + (typeof focus === 'number' ? focus : 0);
  }, 0);
}

module.exports = { fetchTotalFocusSeconds };
