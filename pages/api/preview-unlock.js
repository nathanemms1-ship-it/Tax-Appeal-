// pages/api/preview-unlock.js
/**
 * READ THE WHOLE PETITION WITHOUT PAYING FOR IT — OPERATORS ONLY.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * /apply shows the first 30 lines of the petition and blurs the rest. That blur
 * is the paywall: the document IS the product.
 *
 * It is also the reason we could not verify our own work. On 12 Aug a live test
 * dispatch found two defects that no check in the repository could see — the
 * petition inventing the derivation of its own requested value, and every
 * comparable sale date fabricated to the day. Both were found by reading a mailed
 * PDF proof. Reading the petition should not require buying it.
 *
 * The existing escape hatch, NEXT_PUBLIC_PREVIEW_UNBLURRED, lifts the blur for
 * EVERYONE. Its own comment says it "should be removed from Vercel before there is
 * meaningful traffic" — which makes it a setting that must be remembered and
 * un-remembered around every test. Two settings of exactly that kind nearly
 * outlived their purpose on 12 Aug: the Lob test key, and LOB_BANK_ACCOUNT_ID
 * pointing at a test bank account that had never worked in live mode. A temporary
 * global flag is the wrong shape for something we now expect to do routinely, and
 * across every state rather than only Florida.
 *
 * So: an operator unlocks it for themselves, it expires on its own, and no
 * customer is affected at any point.
 *
 * ============================================================================
 * WHAT THIS IS NOT
 * ============================================================================
 * NOT a security boundary, and it must not be described as one.
 *
 * The blur is `filter: blur(4px)` applied to a div that contains the real text, so
 * the complete petition is already in the page HTML for every visitor. Anyone with
 * developer tools can read it today, gate or no gate. This cookie therefore takes
 * nothing away that currently holds — it replaces a global switch with a personal
 * one.
 *
 * The cookie is deliberately NOT httpOnly, because apply.js is a client component
 * and has to read it. That is not an oversight: a forged cookie reveals only what
 * the page already renders. If the paywall is ever meant to be real, the fix is to
 * stop sending the blurred half to the browser at all — a server-side truncation —
 * and this route should then be revisited.
 *
 *   POST   /api/preview-unlock   { "password": "..." }   -> sets the cookie
 *   DELETE /api/preview-unlock   (admin auth)            -> clears it
 */
import { requireAdmin } from '../../lib/adminAuth';

export const COOKIE_NAME = 'ta_preview_unlocked';

// Long enough for a full review sitting, short enough that a forgotten unlock on a
// shared machine lapses the same day. It expires whether or not anyone remembers
// it, which is the entire point.
export const UNLOCK_SECONDS = 8 * 60 * 60;

export default async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // requireAdmin returns TRUE when it has REJECTED and already responded. Reads
  // backwards; negating it serves unauthorised callers and starves authorised ones,
  // which is exactly how /api/waitlist-roster was first written on 12 Aug.
  // verify-security now fails the build on a negated guard.
  if (await requireAdmin(req, res, 'preview-unlock')) return;

  const clearing = req.method === 'DELETE';
  const parts = [
    `${COOKIE_NAME}=${clearing ? '' : '1'}`,
    'Path=/',
    // Lax, not None: this is only ever set and read on our own origin, and None
    // would require Secure plus third-party cookie tolerance for no benefit.
    'SameSite=Lax',
    'Secure',
    `Max-Age=${clearing ? 0 : UNLOCK_SECONDS}`,
  ];
  // Intentionally no HttpOnly — see the header. apply.js must read this in the
  // browser, and the value protects nothing that is not already in the DOM.
  res.setHeader('Set-Cookie', parts.join('; '));

  return res.status(200).json({
    unlocked: !clearing,
    expiresInSeconds: clearing ? 0 : UNLOCK_SECONDS,
    note: clearing
      ? 'Preview re-blurred for this browser.'
      : 'Full petition visible in this browser only. Customers are unaffected.',
  });
}
