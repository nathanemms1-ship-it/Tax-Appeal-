/**
 * ORDERS PLACED WITHOUT A PORTAL PASSWORD.
 *
 * ============================================================================
 * WHY THERE ARE ANY
 * ============================================================================
 * The funnel used to open with "Create your account" — name, email and a password
 * of at least six characters — before the customer had been told anything about
 * their property. The password protects the portal, and the portal's job is to
 * show the status of an appeal that does not exist yet. Nobody needs it in the
 * next five minutes; they need it in three weeks, when the Board responds.
 *
 * So it is asked for on /success, AFTER the DR-486 signature, where the sale is
 * closed and the friction costs nothing that matters. Optional there, because
 * nothing mails until the owner signs and a password field above that signature
 * gives somebody a reason to leave before the one action that lets us fulfil an
 * order we have already taken money for.
 *
 * ============================================================================
 * WHY A SENTINEL RATHER THAN NULL
 * ============================================================================
 * Nothing in this repository creates the `orders` table — it was made in the
 * Supabase console, and no .sql file here declares whether `password_hash` accepts
 * a null. save-order.js has always had a code path that writes null, but the
 * funnel enforced a six-character minimum, so /api/checkout has never once
 * exercised it. "It would probably work" is not a thing to find out during the
 * fourteen days that carry the season.
 *
 * `!` is the /etc/shadow convention for an account that exists and has no usable
 * password. No bcrypt hash ($2a$/$2b$) and no scrypt/crypto hash this codebase
 * produces can begin with it, so the value is unambiguous, the column is never
 * null under either schema, and the change needs no migration.
 *
 * ============================================================================
 * IT IS NOT A CREDENTIAL AND CANNOT BE USED AS ONE
 * ============================================================================
 * hasUsablePassword() is checked BEFORE any comparison, so `!` never reaches
 * bcrypt.compare — a caller cannot authenticate by sending the sentinel as their
 * password, because no comparison happens at all. pages/api/portal/login.js
 * answers the same way it already answered for a null: say plainly that no
 * password is set and point at "Forgot password?", which looks the customer up by
 * their ORDER and not by their hash, and therefore works for exactly these people.
 * reset-password.js then overwrites the sentinel with a real hash.
 */

export const NO_PASSWORD_SENTINEL = '!';

/**
 * True when this hash can be compared against a submitted password.
 *
 * Absent, empty and sentinel all mean the same thing to a caller — there is
 * nothing to compare — so they get one answer and one message.
 */
export function hasUsablePassword(hash) {
  return typeof hash === 'string' && hash.length > 0 && !hash.startsWith(NO_PASSWORD_SENTINEL);
}
