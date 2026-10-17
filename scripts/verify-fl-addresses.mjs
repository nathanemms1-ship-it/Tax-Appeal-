#!/usr/bin/env node
/**
 * THE FLORIDA VAB ADDRESS TABLE, AND THE ENVELOPE LINES BUILT FROM IT.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Moved here on 17 Oct 2026 from verify-fl-dispatch.mjs, when the letter
 * pipeline it was written for (pages/api/send-letter.js mailing the petition and
 * a Lob cheque to the Value Adjustment Board) was deleted. Most of that file
 * tested send-letter and went with it. These blocks did not: they test
 * lib/flVabAddresses.js and lib/flCountyFees.js directly — the table, Lob's
 * 50-character address-line budget and flVabMailingLines — and the Florida kit
 * still uses all three (lib/kit/flKit.js prints the VAB address on the
 * customer's return envelope via flVabMailingLines, and checkout sells only
 * counties with a confirmed fee and address).
 *
 * A VAB address that cannot be addressed, or a sellable county with a blank
 * payee, fails the BUILD here rather than an order after the card is charged.
 */

import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} (got: ${JSON.stringify(got)})`));

const { getFlVabFee } = await import('../lib/flCountyFees.js');
const { getFlVabAddress } = await import('../lib/flVabAddresses.js');

// ── 1. Every sellable county resolves to a complete, mailable payload ─────────
// Not a sample — all of them. A missing zip or a blank payee in one county is a
// deadline lost for whoever lives there, and it would surface on the day. The
// payee is printed in the FL kit's instructions (the customer writes the cheque)
// and the address goes on the return envelope lib/kit/flKit.js builds.
{
  const { FL_COUNTY_NAMES } = await import('../lib/flVabAddresses.js');
  const names = Array.isArray(FL_COUNTY_NAMES) ? FL_COUNTY_NAMES : [];
  t('the 67-county list is available', names.length === 67, names.length);

  let sellable = 0;
  const broken = [];
  for (const county of names) {
    const addr = getFlVabAddress(county);
    const fee = getFlVabFee(county);
    if (!addr || !fee || fee.confidence !== 'confirmed') continue;
    sellable++;
    if (!fee.payableTo || !addr.street || !addr.city || !addr.state || !/^\d{5}(-\d{4})?$/.test(String(addr.zip))) {
      broken.push(county);
    }
    if (!(fee.vabFee > 0 && fee.vabFee <= 10000)) broken.push(`${county} (fee ${fee.vabFee})`);
  }
  t('every sellable county has a complete, plausible mailing target', broken.length === 0, broken);
  // Informational, and a tripwire: if this number moves, someone changed a
  // confidence flag, and that should be a deliberate act with a phone call behind it.
  console.log(`  ${sellable} of 67 counties currently sellable (confirmed fee AND confirmed address)`);
  t('at least 50 counties are sellable', sellable >= 50, sellable);
  t('the sellable count has not gone BACKWARDS since 6 Aug', sellable >= 56, sellable);
}

/**
 * ============================================================================
 * EVERY SELLABLE COUNTY MUST FIT LOB'S 50-CHARACTER LINE BUDGET. 25 Aug 2026.
 * ============================================================================
 * Order db86d957, the first paying customer, Hillsborough:
 *
 *   The sum (51) of to.address_line1 (601 E KENNEDY BLVD FL 12) and
 *   to.address_line2 (ATTN VALUE ADJUSTMENT BOARD) cannot surpass 50 characters
 *
 * Card charged, fulfilment threw, order to needs_review, petition not mailed,
 * thirteen days to a receipt-not-postmark deadline.
 *
 * 23 of the 61 confirmed counties were over. It was not a bad record — it was
 * every county nobody had happened to buy in yet. This block is what makes that
 * impossible to repeat: a new or edited VAB address that cannot be addressed now
 * fails the BUILD, rather than an order after the card is charged.
 *
 * Lob measures AFTER its own USPS normalisation, so this cannot be checked by
 * reading lib/flVabAddresses.js — Hillsborough is 58 characters as stored and 51
 * as Lob counts it.
 */
{
  const { flVabMailingLines, lobLineLength, LOB_ADDRESS_LINE_BUDGET, FL_COUNTY_NAMES } =
    await import('../lib/flVabAddresses.js');

  const unaddressable = [];
  const overBudget = [];
  let shedCount = 0;

  for (const county of FL_COUNTY_NAMES) {
    if (!getFlVabAddress(county)) continue;      // unconfirmed — not sellable anyway
    const m = flVabMailingLines(county);
    if (!m) { unaddressable.push(county); continue; }
    const len = lobLineLength(m.line1, m.line2);
    if (len > LOB_ADDRESS_LINE_BUDGET) overBudget.push(`${county} (${len})`);
    if (m.shed) shedCount++;
  }

  t('every sellable county produces mailable recipient lines', unaddressable.length === 0, unaddressable);
  t("no sellable county exceeds Lob's combined line budget", overBudget.length === 0, overBudget);

  /**
   * AND EVERY COUNTY KEEPS THE SAFETY MARGIN.
   *
   * lobNormalizeLine infers Lob's normalisation and is validated against exactly
   * one real sample — the Hillsborough failure, which it reproduces character for
   * character. Aiming at exactly 50 left Collier, Pasco and Pinellas on 50 with
   * no headroom, so one mis-guessed token would have reproduced this incident in
   * another county, after another card was charged.
   */
  const { LOB_LINE_TARGET } = await import('../lib/flVabAddresses.js');
  const tight = [];
  for (const county of FL_COUNTY_NAMES) {
    if (!getFlVabAddress(county)) continue;
    const m = flVabMailingLines(county);
    if (!m) continue;
    const len = lobLineLength(m.line1, m.line2);
    if (len > LOB_LINE_TARGET) tight.push(`${county} (${len} > ${LOB_LINE_TARGET})`);
  }
  t('every sellable county keeps the safety margin under the hard cap', tight.length === 0, tight);

  // No county may fall all the way through to a bare line 1. The "c/o <desk>"
  // clause is what gets a petition to the right desk inside a large clerk's office.
  const noLine2 = FL_COUNTY_NAMES.filter((c) => {
    if (!getFlVabAddress(c)) return false;
    const m = flVabMailingLines(c);
    return m && !m.line2;
  });
  t('no sellable county loses its attention line entirely', noLine2.length === 0, noLine2);
  console.log(`  ${shedCount} counties shed attention-line text to fit Lob's ${LOB_ADDRESS_LINE_BUDGET}-char budget`);

  // THE LIVE ONE. It must fit, and it must fit by dropping "Attn:" rather than by
  // cutting the street — a truncated street line names a real address that is the
  // wrong one, and this is the return envelope the customer posts their signed petition and cheque in.
  const hills = flVabMailingLines('Hillsborough');
  t('Hillsborough now fits', lobLineLength(hills.line1, hills.line2) <= LOB_ADDRESS_LINE_BUDGET,
    lobLineLength(hills.line1, hills.line2));
  t('and it fits by dropping "Attn:", not by cutting the street',
    hills.line1 === getFlVabAddress('Hillsborough').street && hills.line2 === 'Value Adjustment Board',
    JSON.stringify(hills));

  // Pinellas is the worst case — a 67-character attention line — and the one where
  // dropping line 2 outright would cost real routing ("c/o Board Records Department").
  const pin = flVabMailingLines('Pinellas');
  t('Pinellas keeps its c/o routing rather than losing line 2',
    /Board Records/i.test(pin.line2 || ''), JSON.stringify(pin));

  // No county's street line may be altered by the ladder, ever.
  const altered = FL_COUNTY_NAMES.filter((c) => {
    const a = getFlVabAddress(c);
    if (!a) return false;
    const m = flVabMailingLines(c);
    return m && m.line1 !== a.street;
  });
  t('the ladder never alters line 1', altered.length === 0, altered);
}

if (failures.length) {
  console.error(`verify-fl-addresses: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-fl-addresses: ${pass} passed — every sellable Florida county has a complete, Lob-addressable VAB target`);
