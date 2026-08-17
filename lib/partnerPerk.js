/**
 * ============================================================================
 * THE PARTNER PERK — one transferable $20 code per partner
 * ============================================================================
 *
 * Nathan, 17 Aug 2026: *"I definitely want to tell them about the coupon code in
 * the welcome email, and tell them to use it for their property or give it to a
 * friend if they are not filing a petition. We just have to make it a one time
 * use."*
 *
 * So the code is TRANSFERABLE by design. A partner who is not filing this year can
 * hand it to a client, which turns a coupon that would have gone unused into a
 * customer and a first taste of the product.
 *
 * ============================================================================
 * A REDEEMED COUPON CANCELS THE REFERRAL PAYOUT ON THAT ORDER
 * ============================================================================
 * Nathan, 17 Aug 2026: *"The coupon code also has to disable any partner payout
 * as well."*
 *
 * An earlier version of this comment said the opposite — that the discount and
 * the payout were independent mechanisms and a partner could collect both. That
 * was wrong and it was expensive: a partner using their own coupon on their own
 * property would take $20 off the price AND $20 in commission. **$40 out on an
 * $89 fee**, against roughly $8 of cost, turning a profitable order into a
 * marginal one. Same arithmetic when a partner hands the coupon to someone who
 * then arrives through their referral link.
 *
 * The rule is now: ANY order carrying a redeemed perk code pays NO referral
 * commission — including to a different partner than the one who issued the
 * coupon. One order, one $20, never two.
 *
 * This is also the honest thing to tell a partner, and it should be said in the
 * welcome email rather than discovered on a payout statement: the coupon IS the
 * $20. Spending it on an order is choosing to take the benefit as a discount for
 * whoever files, instead of as a commission. It is one or the other, not a
 * penalty for using both.
 *
 * ENFORCED IN lib/referralSettlement.js, not here — the settlement decision has
 * always lived there and splitting it would create two places that can disagree
 * about whether an order pays. This file writes `orders.perk_code`; that file
 * refuses on it.
 *
 * ============================================================================
 * WHY THIS REPLACES A GUARD THAT WAS BACKWARDS
 * ============================================================================
 * lib/referralSettlement.js has always refused a payout when the ordering email
 * matches the partner's:
 *
 *     if (email(partner.email) === email(order.customer_email))
 *       return { ok: false, reason: 'self_referral', code };
 *
 * Read against what we actually want, that is inverted. A partner ordering with
 * the address they signed up with gets NOTHING; one ordering with a second
 * address gets $20. **It only catches the people who were not trying to evade
 * it** — the worst property a guard can have.
 *
 * The answer is not a stronger identity check. It is to grant the $20 through the
 * front door as a discount, and leave that guard to close the obvious back one.
 *
 * A DISCOUNT AND A PAYOUT ARE STILL DIFFERENT THINGS, even though only one of
 * them can apply to a given order. The same $20 delivered as a
 * referral payout would ride the Connect rail, count toward the partner's 1099
 * threshold, wait out the 150-day clawback horizon, and inflate `total_referrals`
 * so the number stops meaning "people I referred". As a discount it is a price
 * reduction at the till: immediate, no tax paperwork, no clawback, dashboard
 * still honest.
 *
 * ============================================================================
 * "ONE TIME USE" IS THE HARD PART, AND READ-THEN-WRITE DOES NOT DO IT
 * ============================================================================
 * The code is shareable, so several people can hold it and try it at once. The
 * obvious implementation —
 *
 *     select perk_redeemed_at ...        // null, looks free
 *     if (!redeemed) update ... set perk_redeemed_at = now()
 *
 * — is a race with a window the width of a network round trip, and two
 * simultaneous checkouts both read null and both get $20.
 *
 * REDEMPTION IS A CONDITIONAL UPDATE THAT RETURNS AFFECTED ROWS. Exactly the
 * pattern `b1475da` used for referral payout claiming, for the same reason:
 * Postgres decides, not us, and the loser of the race is told plainly.
 *
 * AND IT IS TWO PHASES, NOT ONE. A single burn at checkout-session creation kills
 * the coupon on every abandoned cart — and abandoned carts are the majority of
 * checkout sessions. A single burn at payment leaves the whole checkout window
 * open for double-spend. So:
 *
 *   RESERVE   when the Stripe session is created. Holds the code for
 *             RESERVATION_MINUTES against one session id.
 *   CONFIRM   on checkout.session.completed. The reservation becomes a redemption.
 *   RELEASE   automatically — a reservation older than the hold is simply ignored
 *             by the next reserve, so an abandoned cart needs no cleanup job and
 *             no cron that can fail silently.
 *
 * The SQL for all three is at the bottom of this file. It belongs here beside the
 * reasoning rather than inlined at three call sites where it would drift.
 *
 * ============================================================================
 * NO EXPIRY. DECIDED, NOT OVERLOOKED.
 * ============================================================================
 * Nathan, 17 Aug 2026: *"Lets just make the coupon never expire, that would be
 * easier."*
 *
 * An earlier draft expired it at season close, and that turned out to be a phrase
 * that does not resolve in a three-state business: lib/filingWindows.js closes
 * Texas 15 May, Georgia 15 July, Florida 18 Sept. Read as "the current Florida
 * season", a partner signing up today for a Texas property would receive a coupon
 * expiring 18 September that cannot be redeemed until Texas opens in April.
 * Issued dead. Resolving that correctly meant per-state expiry arithmetic, a
 * PERK_SEASON_MODE switch, and a paragraph of explanation in the welcome email.
 *
 * No expiry deletes all of it. What is given up is nearly nothing: the liability
 * is $20 per partner, once, and pages/api/checkout.js already refuses to sell
 * outside a state's filing window — so the coupon can only ever be redeemed in
 * season regardless of what this file says. Expiry was only ever stopping it
 * rolling from one year to the next, against a partner who by then has been
 * carrying an unused code for twelve months and has earned the $20 by waiting.
 *
 * If a reason to expire it ever appears, it goes back in HERE and nowhere else.
 */

export const PERK_AMOUNT_CENTS = 2000;
export const RESERVATION_MINUTES = 30;

/**
 * Code alphabet with O/0/I/1/S/5 removed.
 *
 * This code goes in a welcome email and gets read aloud, retyped from a phone,
 * and dictated to a friend. Every ambiguous glyph is a support email, and a
 * support email costs more than the $20 the code is worth.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';

/** e.g. "TAP-K7M2-QW9F". Prefixed so it is recognisable in a support inbox. */
export function generatePerkCode(randomInt) {
  const rnd = randomInt || ((n) => Math.floor(Math.random() * n));
  const chunk = () => Array.from({ length: 4 }, () => ALPHABET[rnd(ALPHABET.length)]).join('');
  return `TAP-${chunk()}-${chunk()}`;
}

/**
 * Accept what a human actually types.
 *
 * Lowercase, missing dashes, a trailing space from a paste, the TAP prefix
 * dropped. All of that normalises to one canonical form. Refusing a valid coupon
 * over a lowercase letter is the kind of thing that ends up in a review.
 *
 * AN EARLIER VERSION TRIED TO BE CLEVERER AND WAS WRONG. It folded O to 0 and I
 * to 1 and then back again, to "fix" the classic confusions. But ALPHABET
 * excludes O, I, S, 0, 1 and 5 precisely so those confusions cannot arise — so
 * the fold had nothing to correct, and it actively broke things: a user typing 0
 * had it rewritten to O, which cannot appear in any real code, turning a
 * near-miss into a guaranteed miss. The alphabet is the disambiguation. Adding a
 * second mechanism on top of it only created a way to be wrong.
 */
export function normalizePerkCode(input) {
  const raw = String(input || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!raw) return null;
  const body = raw.startsWith('TAP') ? raw.slice(3) : raw;
  // Length and alphabet, both. Rejecting a malformed code here rather than
  // sending it to the database keeps a stray paste out of the query path.
  if (body.length !== 8) return null;
  if (![...body].every((c) => ALPHABET.includes(c))) return null;
  return `TAP-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Is this perk row usable right now? PURE — no database, no Stripe.
 *
 * The caller supplies the row it already fetched. This decides. So the rule is
 * testable without a fixture server and cannot drift between checkout and the
 * verify suite.
 *
 * NOTE this is the ADVISORY check, used to show the customer a price before they
 * pay. It is NOT what enforces single use — that is the conditional UPDATE at the
 * bottom of this file, which is the only thing two simultaneous checkouts cannot
 * both win. Anything relying on this function alone for uniqueness is racy.
 *
 * Every refusal names itself, so "why didn't my code work" is answerable from a
 * log line rather than by re-running someone's checkout.
 */
export function evaluatePerk({ perk, now = new Date() }) {
  if (!perk) return { valid: false, reason: 'unknown_code' };
  if (perk.partner_active === false) return { valid: false, reason: 'partner_inactive' };
  if (perk.perk_redeemed_at) return { valid: false, reason: 'already_redeemed' };

  if (perk.perk_reserved_at) {
    const heldUntil = new Date(new Date(perk.perk_reserved_at).getTime() + RESERVATION_MINUTES * 60_000);
    if (now < heldUntil) return { valid: false, reason: 'reserved_by_another_checkout' };
  }

  // No expiry check, deliberately — see "NO EXPIRY" at the top of this file.
  // A code that has not been redeemed and is not currently reserved is good.
  return { valid: true, amountCents: PERK_AMOUNT_CENTS };
}

/**
 * Apply the perk to Stripe line items.
 *
 * ONLY THE SERVICE FEE. The Florida VAB fee is money collected on the county's
 * behalf and forwarded to it — checkout.js builds it as its own line item at
 * `unit_amount: vabFee` for exactly that reason. Discounting it would not reduce
 * our margin; it would mean paying part of a county's statutory fee out of pocket
 * while telling the customer they had paid it.
 *
 * Matched on unit_amount rather than array position, because position is the kind
 * of thing a later edit reorders without noticing.
 */
export function applyPerkToLineItems(lineItems, amountCents = PERK_AMOUNT_CENTS) {
  let applied = false;
  const out = lineItems.map((li) => {
    const unit = li?.price_data?.unit_amount;
    if (applied || unit !== 8900) return li;
    applied = true;
    return {
      ...li,
      price_data: {
        ...li.price_data,
        unit_amount: unit - amountCents,
        product_data: {
          ...li.price_data.product_data,
          name: `${li.price_data.product_data?.name || 'Filing service'} (partner coupon applied)`,
        },
      },
    };
  });
  // Never silently no-op. If the service-fee line stops being 8900 — a price
  // change, a promotion, a refactor — that must surface here rather than quietly
  // charging a customer full price after we told them the coupon applied.
  if (!applied) throw new Error('partnerPerk: no $89.00 service-fee line item found to discount');
  return out;
}

/**
 * ============================================================================
 * THE THREE STATEMENTS THAT ACTUALLY ENFORCE SINGLE USE
 * ============================================================================
 * Kept here, next to the reasoning, rather than inlined at three call sites where
 * one of them would eventually be edited alone.
 *
 * Each RETURNS the row. Zero rows back means the caller LOST — the code was
 * already taken, already reserved, or does not exist. Do not follow any of these
 * with a SELECT to "check whether it worked": the return value IS the check, and
 * a re-read reintroduces the race the UPDATE exists to remove.
 */
/**
 * The database functions that actually enforce single use.
 *
 * Installed by scripts/migrations/2026-08-17-partner-perk.sql. Named here so the
 * call sites cannot drift, and so a grep for "perk_reserve" finds both ends.
 *
 * ALL THREE RETURN ROWS. Zero rows back means the caller LOST — unknown code,
 * already redeemed, or held by another checkout. Never follow one with a SELECT
 * to "check whether it worked": the return value IS the check, and a re-read
 * reintroduces the race the function exists to remove.
 */
export const RPC = {
  reserve: 'perk_reserve',   // (p_code, p_session)
  confirm: 'perk_confirm',   // (p_code, p_session, p_order_id)
  release: 'perk_release',   // (p_code, p_session)
};

export default {
  evaluatePerk, applyPerkToLineItems, generatePerkCode, normalizePerkCode, RPC,
  PERK_AMOUNT_CENTS, RESERVATION_MINUTES,
};
