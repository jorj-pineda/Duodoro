/**
 * Remove the two roots of a Duodoro account.
 *
 * `auth.admin.deleteUser()` deletes auth.users and lets the schema's ON DELETE
 * cascades remove profiles, friendships, owned tasks, participant links, and
 * premium_grants. The legacy waitlist predates accounts and is keyed only by
 * email, so it has to be removed explicitly first.
 */
async function deleteAccountData(supabase, { userId, email }) {
  if (!supabase || !userId) {
    throw new Error("Authenticated account deletion is unavailable");
  }

  if (email) {
    const { error: waitlistError } = await supabase
      .from("waitlist")
      .delete()
      .eq("email", email.toLowerCase());

    if (waitlistError) {
      throw new Error(`Could not remove waitlist data: ${waitlistError.message}`);
    }
  }

  // Hard delete is intentional. Supabase's soft-delete option retains a
  // hashed user identifier and is not reversible, which does not match a user
  // asking Duodoro to remove their account and linked application data.
  const { error: authError } = await supabase.auth.admin.deleteUser(
    userId,
    false,
  );
  if (authError) {
    throw new Error(`Could not delete auth account: ${authError.message}`);
  }
}

module.exports = { deleteAccountData };
