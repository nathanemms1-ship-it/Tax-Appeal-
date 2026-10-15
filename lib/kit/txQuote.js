/**
 * lib/kit/txQuote.js — whether a Texas protest kit may be sold. 15 Oct 2026.
 *
 * NATHAN, 15 Oct 2026: Texas follows Georgia. "A failed appeal will just cost
 * us a free filing the following year." The 7 Sept rule ("nothing refuses,
 * cautions shown, the owner decides") is retired for the kit: we check whether
 * a protest will actually lower the tax bill before the owner pays, and if it
 * won't, we say so and do not sell one.
 *
 * The protest itself is unchanged: lib/tx/protest.js buildProtest() still
 * builds every packet from the district's own roll and still raises its
 * cautions. Under the kit, EVERY caution is a no-sale, because each one is a
 * reason the bill will not drop or there is nothing to argue:
 *
 *   no_value_on_roll         nothing to protest against
 *   capped_beyond_reach      the § 23.23 cap already holds the taxed value down
 *   saving_below_fee         the bill drops by less than the price
 *   insufficient_comparables no evidence
 *   not_over_appraised       appraised at or below the neighbours
 *   cap_artifact_only        the "case" is the neighbours' caps, not this house
 *   nothing_to_ask_for       no value to ask for
 *
 * and a clean packet must still show a yearly saving of at least the price.
 * The saving is buildProtest's own estimatedSaving (billing gap x the default
 * rate, an upper bound, exemptions not subtracted), the same figure the funnel
 * shows the owner.
 *
 * txSellability() is the gate the quote route and checkout both run: the same
 * rules the kit builder enforces at mailing time (confirmed district address,
 * complete order), run before a card is charged.
 */
import { getAppealAddress, isMailable } from '../appealAddresses';
import { SERVICE_PRICE_DOLLARS } from '../pricing';
import { KitError } from './assembleKit';
import { validateTxOrder } from './txKit';

export const TX_QUOTE = Object.freeze({ CASE: 'case', NO_CASE: 'no_case' });

/** The protest's own verdict, before anything about the county or the order. */
export function txKitDecision(packet) {
  if (!packet || !packet.form50132) return { decision: TX_QUOTE.NO_CASE, reason: 'no_packet', cautions: [] };
  const cautions = (packet.cautions || []).map((c) => c && c.code).filter(Boolean);
  if (cautions.length) return { decision: TX_QUOTE.NO_CASE, reason: cautions[0], cautions };
  if (!(Number(packet.form50132.opinionOfValue) > 0)) return { decision: TX_QUOTE.NO_CASE, reason: 'nothing_to_ask_for', cautions };
  if (!(Number(packet.estimatedSaving) >= SERVICE_PRICE_DOLLARS)) return { decision: TX_QUOTE.NO_CASE, reason: 'bill_wont_drop_enough', cautions };
  return { decision: TX_QUOTE.CASE, reason: null, cautions };
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string, noCase?: true }}
 */
export function txSellability(kitOrder, { now = new Date() } = {}) {
  const d = txKitDecision(kitOrder?.packet);
  if (d.decision !== TX_QUOTE.CASE) return { ok: false, reason: d.reason, noCase: true };
  const row = getAppealAddress('TX', kitOrder?.property?.county);
  if (!row || !isMailable(row, now)) return { ok: false, reason: 'address_not_confirmed' };
  try {
    validateTxOrder({ ...kitOrder, countyAddress: row }, { now });
    return { ok: true };
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    return { ok: false, reason: e.code };
  }
}
