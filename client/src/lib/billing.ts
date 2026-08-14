// ─────────────────────────────────────────────────────────────────────────────
// Billing — where Stripe will go, and what happens until it does.
//
// There is no payment in Duodoro. Premium is granted free, in exchange for a
// confirmed email address, by the `claim_premium` RPC (migration 020). The
// owner's plan is to add Stripe once there are enough users to justify it.
//
// This module exists so that "add Stripe" is a change to one file rather than
// an archaeology exercise. It is deliberately not a mock: `startCheckout`
// throws rather than resolving, because a checkout that silently succeeds is
// the single worst thing to leave lying around in a codebase that will later
// have real money in it. Nothing calls it yet, and nothing should until there
// is something behind it.
//
// What Stripe will need when it arrives:
//   - a price id and a publishable key as NEXT_PUBLIC_* env vars (baked at
//     build time on Vercel — see the deploy notes in CLAUDE.md)
//   - a webhook endpoint. The Socket.IO server on Render is the only place in
//     this project holding the Supabase service key, so it is the natural
//     home; it is also the only half that can write `is_premium` outside of a
//     SECURITY DEFINER RPC.
//   - a new `source` value in `premium_grants` for paid grants, so the free
//     ones stay distinguishable from the paid ones. The column is already
//     there for exactly this.
// ─────────────────────────────────────────────────────────────────────────────

/** How premium was obtained. Mirrors `premium_grants.source` in the database. */
export type GrantSource = "free_email_unlock" | "stripe";

/**
 * True while premium is given away for an email address.
 *
 * Read this rather than hardcoding the assumption in components: when Stripe
 * lands, the copy that says "free while we're small" has to stop saying that,
 * and this is the flag that finds every place it needs to change.
 */
export const PREMIUM_IS_FREE = true;

/**
 * Start a Stripe Checkout session.
 *
 * Not wired. Throws on purpose — see the note at the top of this file.
 */
export async function startCheckout(): Promise<never> {
  throw new Error(
    "Stripe checkout is not wired up. Premium is currently granted free via claim_premium().",
  );
}
