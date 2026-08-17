/**
 * WHO GETS PAID, AND WHY SOMEONE DOESN'T — IN ONE PLACE.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * Eligibility was implemented TWICE, differently, and the two disagreed:
 *
 *   pages/api/referral-stats.js  (the payout sheet the operator works from)
 *     excluded unknown codes, deactivated partners, self-referrals, refunded or
 *     unpaid orders, and orders already settled.
 *
 *   pages/api/partner-stats.js   (the dashboard the PARTNER looks at)
 *     did `totalReferrals * 20` over every order carrying the code. No filtering
 *     of any kind.
 *
 * So a partner watched a number that counted refunded orders and their own
 * self-referrals, then received a payment that excluded both, with no explanation
 * of the gap. Every disagreement between those two files is a support ticket in
 * which the partner is right to be annoyed and we have nothing to show them.
 *
 * There is now one implementation. The dashboard, the payout sheet and the
 * settlement cron all call `settle()`. If a rule changes it changes for all three
 * at once, which is the only way this stays honest.
 *
 * ============================================================================
 * WHAT COUNTS AS PAYABLE
 * ============================================================================
 * Each rule below exists because its absence was exploitable or wrong:
 *
 *   unknown_referral_code — ?ref= accepts any string a stranger types. A code that
 *     matches no partner must never reach a payout sheet.
 *   partner_inactive     — `active` was written at signup and never read, so
 *     suspending a partner you caught defrauding you did nothing.
 *   self_referral        — nothing compared buyer to partner, so anyone could
 *     register, buy through their own link and take $20 off their own order, at
 *     scale, with disposable email addresses.
 *   payment_*            — refunds and chargebacks had no effect on payouts.
 *   already_settled      — the same order must never be paid in two runs.
 *   no_payout_account    — the partner has not connected a bank account. NOT a
 *     forfeit: the order stays unsettled and the next run picks it up once they
 *     connect. We owe them the money either way.
 */

/** $20.00, flat, per completed referred order. The number on /partners. */
export const REFERRAL_PAYOUT_CENTS = 2000;

/**
 * How old an order must be before we will pay a partner for it.
 *
 * ============================================================================
 * WHY A HOLDBACK EXISTS
 * ============================================================================
 * A refund that lands BEFORE the settlement run costs us nothing: the webhook sets
 * payment_status to 'refunded' and eligibility() below never pays it. A refund that
 * lands AFTER is a different problem — the $20 is in the partner's Stripe account
 * and getting it back is somewhere between awkward and impossible.
 *
 * The run settles the previous calendar month, so most orders are two to four weeks
 * old when they are paid, long past any refund window. But an order placed at 11pm
 * on the 31st is paid at 10am on the 1st — ELEVEN HOURS old, still inside its own
 * 24-hour refund window. Orders from the tail of the month are the entire exposure.
 *
 * Seven days covers the 24-hour service-fee window seven times over, and also covers
 * the county filing fee, which stays refundable until the petition is mailed. Held
 * orders roll into the next run; the partner dashboard shows them as pending
 * throughout, so nothing looks lost.
 *
 * This does NOT cover chargebacks, which card networks allow for roughly 120 days.
 * Nothing that pays monthly can. That is what the clawback in the settlement run is
 * for — see pages/api/cron/settle-referrals.js.
 */
export const MIN_ORDER_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

const norm = (s) => String(s || '').trim().toUpperCase();
const email = (s) => String(s || '').trim().toLowerCase();

/**
 * Decide a single order.
 *
 * @param order    row from `orders` — needs id, ref_code, customer_email, payment_status
 * @param partner  matching row from `referrals`, or undefined
 * @param settled  Set of order ids already present in `referral_payouts`
 * @param opts     { requirePayoutAccount, minAgeDays, now }
 *
 *                 requirePayoutAccount — the cron sets this true because it is about
 *                 to move money; the dashboard and payout sheet leave it false, so a
 *                 partner who has not connected a bank still SEES what they have
 *                 earned rather than being told they earned nothing.
 *
 *                 minAgeDays — the refund holdback. The CRON sets this; the dashboard
 *                 and payout sheet leave it 0 so a partner sees an order the moment
 *                 it lands rather than a week later. Both are honest: the dashboard
 *                 labels it pending, and pending is exactly what it is.
 *
 *                 now — injectable for tests. Defaults to the current time.
 */
export function eligibility(order, partner, settled, opts = {}) {
  const code = norm(order.ref_code);

  if (!partner) return { ok: false, reason: 'unknown_referral_code', code };
  if (partner.active === false) return { ok: false, reason: 'partner_inactive', code };

  /**
   * A REDEEMED PARTNER COUPON CANCELS THE COMMISSION ON THIS ORDER.
   *
   * Nathan, 17 Aug 2026: "The coupon code also has to disable any partner payout
   * as well."
   *
   * Without this, a partner using their own coupon on their own property takes
   * $20 off the price AND $20 in commission — $40 out on an $89 fee, against
   * roughly $8 of cost. Same arithmetic when a partner gives the coupon away to
   * someone who then arrives through their referral link.
   *
   * DELIBERATELY UNCONDITIONAL ON WHOSE COUPON IT WAS. Partner A's coupon on an
   * order carrying Partner B's ref_code still pays nobody. Checking that the
   * coupon and the referral belong to the same partner would mean two partners
   * could split $40 out of one $89 order — the same leak wearing a disguise, and
   * harder to see.
   *
   * CHECKED BEFORE self_referral so the reported reason is the true one. A
   * partner filing on their own home with their own coupon trips both rules, and
   * `perk_redeemed` is the accurate explanation to give them: they already
   * received the $20, as a discount.
   *
   * Reads the ORDER's own column, written by the same webhook that redeems the
   * coupon (lib/partnerPerk.js SQL.stampOrder). Not a lookup against `referrals`
   * — a lookup can fail, and a failed lookup here would pay a commission that was
   * not owed, silently.
   */
  if (order.perk_code) {
    return { ok: false, reason: 'perk_redeemed', code, perkCode: order.perk_code };
  }

  /**
   * The naive back door, kept.
   *
   * This is a weak check — a partner ordering under a second email address
   * defeats it — and before the coupon existed it was also BACKWARDS: it denied
   * the $20 to the honest partner who used their signup address and paid it to
   * anyone who used a different one, catching only the people who were not trying
   * to evade it.
   *
   * The coupon is now the sanctioned way for a partner to get their $20, so this
   * no longer denies anyone anything they are owed. It just closes the obvious
   * door. The residual gap — a partner using a second address AND not redeeming
   * their coupon — is worth $20 once, and Nathan's standing view is that a
   * partner who files on their own property is a partner who refers better.
   */
  if (partner.email && order.customer_email &&
      email(partner.email) === email(order.customer_email)) {
    return { ok: false, reason: 'self_referral', code };
  }

  // An order with no payment_status at all predates the column; treat the absence
  // as unknown rather than as paid. Being conservative here costs a support email;
  // being permissive pays out on refunded orders.
  if (order.payment_status !== 'paid') {
    return { ok: false, reason: `payment_${order.payment_status || 'unknown'}`, code };
  }

  if (settled && settled.has(order.id)) return { ok: false, reason: 'already_settled', code };

  // The refund holdback. Checked AFTER already_settled so a paid order is never
  // re-described as "too recent", and BEFORE no_payout_account so a partner without
  // a bank sees the more actionable of the two reasons.
  //
  // A missing created_at is treated as too recent rather than as old enough. An
  // order whose age we cannot establish is exactly the one not to pay early.
  if (opts.minAgeDays > 0) {
    const createdAt = order.created_at ? new Date(order.created_at).getTime() : NaN;
    const now = opts.now ? new Date(opts.now).getTime() : Date.now();
    if (!Number.isFinite(createdAt) || now - createdAt < opts.minAgeDays * DAY_MS) {
      return { ok: false, reason: 'too_recent', code };
    }
  }

  if (opts.requirePayoutAccount && !partner.stripe_account_id) {
    return { ok: false, reason: 'no_payout_account', code };
  }

  return { ok: true, code };
}

/**
 * Run every order through `eligibility` and group the payable ones by partner.
 *
 * Returns BOTH sides. A payout sheet that silently shrinks is worse than one that
 * explains itself, and the same is true of a partner dashboard: `excluded` is what
 * lets us tell someone why an order they can see did not pay.
 */
export function settle({
  orders = [],
  partners = [],
  settledOrderIds = new Set(),
  requirePayoutAccount = false,
  minAgeDays = 0,
  now = undefined,
}) {
  /**
   * A DUPLICATE CODE MUST NOT SILENTLY PICK A WINNER.
   *
   * This was `byCode[norm(p.code)] = p` — last writer wins. Two partners sharing a
   * code meant one of them collected every order attributed to it and the other got
   * nothing, with no error anywhere. Whose money it became depended on the order the
   * database happened to return rows in.
   *
   * Corrected 15 Aug: referrals.code DOES carry a UNIQUE index (referrals_code_key),
   * so the app cannot create an exact duplicate. But norm() here is trim + uppercase,
   * and that index is neither — 'jsmith' and 'JSMITH' are one code to this function
   * and two rows to Postgres. scripts/sql/referrals_code_unique.sql adds a second
   * index on upper(btrim(code)) to close that, and this branch stays regardless:
   * a constraint added today cannot vouch for a row inserted last month.
   *
   * Paying the wrong partner is not recoverable by a later run — the money has gone to
   * a real person's bank account. So a duplicated code pays NOBODY and says why. The
   * orders stay unsettled and are picked up the moment the collision is resolved.
   */
  const byCode = {};
  const duplicatedCodes = new Set();
  for (const p of partners) {
    const key = norm(p.code);
    if (!key) continue;
    if (byCode[key]) duplicatedCodes.add(key);
    byCode[key] = p;
  }

  const groups = {};
  const excluded = [];

  for (const order of orders) {
    const code = norm(order.ref_code);
    if (!code) continue;

    if (duplicatedCodes.has(code)) {
      excluded.push({ orderId: order.id, code, reason: 'duplicate_partner_code' });
      continue;
    }

    const partner = byCode[code];
    const verdict = eligibility(order, partner, settledOrderIds, { requirePayoutAccount, minAgeDays, now });

    if (!verdict.ok) {
      excluded.push({ orderId: order.id, code, reason: verdict.reason });
      continue;
    }

    if (!groups[code]) {
      groups[code] = { code, partner, orders: [], orderCount: 0, amountCents: 0 };
    }
    groups[code].orders.push(order);
    groups[code].orderCount += 1;
    groups[code].amountCents += REFERRAL_PAYOUT_CENTS;
  }

  // Oldest order first within each partner. The settlement run pays down this list
  // in order and withholds from the END when netting a clawback, so the order that
  // gets held back is the newest one — the one with the most refund window left, and
  // so the one it is safest to delay.
  for (const g of Object.values(groups)) {
    g.orders.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }

  const payable = Object.values(groups).sort((a, b) => b.amountCents - a.amountCents);

  return {
    payable,
    excluded,
    totalCents: payable.reduce((s, g) => s + g.amountCents, 0),
    totalOrders: payable.reduce((s, g) => s + g.orderCount, 0),
  };
}

export default settle;
