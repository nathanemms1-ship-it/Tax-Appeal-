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

const norm = (s) => String(s || '').trim().toUpperCase();
const email = (s) => String(s || '').trim().toLowerCase();

/**
 * Decide a single order.
 *
 * @param order    row from `orders` — needs id, ref_code, customer_email, payment_status
 * @param partner  matching row from `referrals`, or undefined
 * @param settled  Set of order ids already present in `referral_payouts`
 * @param opts     { requirePayoutAccount } — the cron sets this true because it is
 *                 about to move money; the dashboard and payout sheet leave it
 *                 false, so a partner who has not connected a bank still SEES what
 *                 they have earned rather than being told they earned nothing.
 */
export function eligibility(order, partner, settled, opts = {}) {
  const code = norm(order.ref_code);

  if (!partner) return { ok: false, reason: 'unknown_referral_code', code };
  if (partner.active === false) return { ok: false, reason: 'partner_inactive', code };

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
export function settle({ orders = [], partners = [], settledOrderIds = new Set(), requirePayoutAccount = false }) {
  const byCode = {};
  for (const p of partners) byCode[norm(p.code)] = p;

  const groups = {};
  const excluded = [];

  for (const order of orders) {
    const code = norm(order.ref_code);
    if (!code) continue;

    const partner = byCode[code];
    const verdict = eligibility(order, partner, settledOrderIds, { requirePayoutAccount });

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

  const payable = Object.values(groups).sort((a, b) => b.amountCents - a.amountCents);

  return {
    payable,
    excluded,
    totalCents: payable.reduce((s, g) => s + g.amountCents, 0),
    totalOrders: payable.reduce((s, g) => s + g.orderCount, 0),
  };
}

export default settle;
