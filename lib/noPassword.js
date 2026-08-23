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

/**
 * THE ONE PLACE A CUSTOMER-CHOSEN PASSWORD IS HASHED.
 *
 * pbkdf2, `salt:hash`, matching what pages/api/portal/reset-password.js has always
 * produced — pages/api/portal/login.js sniffs the format and verifies pbkdf2 and
 * bcrypt both, so the two must stay in the shape it recognises.
 *
 * It lives here because there are now TWO routes where somebody sets a password
 * for the first time: the reset link, and /success after they sign. Two copies of
 * a hashing recipe is how one of them ends up with a different iteration count and
 * silently stops matching, which presents as "my password does not work" and is
 * indistinguishable from the customer misremembering it.
 *
 * MINIMUM LENGTH IS DELIBERATELY THE SAME SIX AS THE RESET ROUTE. Raising it only
 * here would mean a password that can be set by one route and rejected by the
 * other, and a customer cannot see which route they are on.
 */
export const MIN_PASSWORD_LENGTH = 6;

export function hashPassword(password, crypto) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}
