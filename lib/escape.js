/**
 * Escaping helpers for untrusted values.
 *
 * WHY THIS IS ITS OWN FILE
 * ------------------------
 * These started life inside lib/webhookAuth.js because that is where the first
 * unescaped interpolation was found. They belong here: the email templates, the
 * generated petitions, and the webhooks all need them, and none of those has
 * anything to do with webhook authentication. webhookAuth re-exports them so
 * existing imports keep working.
 *
 * WHAT AN UNESCAPED VALUE ACTUALLY COSTS US
 * -----------------------------------------
 * Our outbound mail is SPF- and DKIM-aligned on taxappealusa.com. An unescaped
 * customer-supplied value inside one of those HTML bodies means a third party can
 * put arbitrary markup — a link, a form, a fake "verify your payment" block — into
 * an email that every mail client will show as authentically from us, delivered to
 * our own customer. That is a better phishing primitive than anything an attacker
 * could build themselves, and we would be the sender of record.
 *
 * On the petition side the stake is different but not smaller: a '<' in an owner's
 * name silently corrupts a document filed under penalties of perjury.
 */

/** Escape for interpolation into HTML text or an attribute value. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape SQL LIKE/ILIKE wildcards in a value used inside a pattern.
 *
 * Supabase's .ilike('col', `%${x}%`) does NOT treat x as a literal. A value
 * containing % matches every row, which is how an inbound webhook could select a
 * victim's order without knowing anything about them.
 */
export function escapeLike(value) {
  return String(value ?? '').replace(/[\\%_]/g, (c) => `\\${c}`);
}

export default escapeHtml;
