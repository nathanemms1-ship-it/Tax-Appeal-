#!/usr/bin/env node
/**
 * ============================================================================
 * VERIFY THE PARTNER COUPON
 * ============================================================================
 *   node scripts/verify-partner-perk.mjs
 *
 * Three kinds of check, and the third is the one that earns its keep.
 *
 *   1. PURE LOGIC — code generation, normalisation, validity, line items.
 *   2. THE SETTLEMENT REFUSAL — a redeemed coupon cancels the commission.
 *   3. CROSS-FILE INVARIANTS — facts that live in two files and must agree.
 *
 * (3) matters because each of these breaks EVERYTHING while every individual
 * file still looks correct in review, and none of them throws at runtime — they
 * just quietly stop working:
 *
 *   - The alphabet in the migration vs ALPHABET in lib/partnerPerk.js. If they
 *     drift, every backfilled coupon fails normalizePerkCode()'s alphabet check
 *     and no existing partner's code works. Nothing errors. They just get
 *     "invalid coupon" forever.
 *   - The RPC names in partnerPerk.RPC vs the functions the migration creates.
 *     A rename on one side makes every reservation fail, which the checkout path
 *     deliberately swallows — so the customer silently pays full price.
 *   - `orders.perk_code`, written by lib/fulfillOrder.js and read by
 *     lib/referralSettlement.js. If the writer's column name changes, settlement
 *     stops seeing coupons and starts paying $20 commission on discounted orders.
 *
 * Following the working note in Open_Items_Queue.md: asserting a string is
 * present is not the same as asserting the code does the thing. So (1) and (2)
 * execute the real functions, and (3) asserts agreement BETWEEN files rather than
 * the existence of any single line.
 */

import { readFileSync } from 'node:fs';
import {
  generatePerkCode, normalizePerkCode, evaluatePerk, applyPerkToLineItems,
  RPC, PERK_AMOUNT_CENTS, RESERVATION_MINUTES,
} from '../lib/partnerPerk.js';
import { eligibility } from '../lib/referralSettlement.js';

let failed = 0;
const t = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// ── 1. PURE LOGIC ───────────────────────────────────────────────────────────
console.log('\nCODE GENERATION AND NORMALISATION\n');
const code = generatePerkCode();
t('generated code has the TAP-XXXX-XXXX shape', /^TAP-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code);
t('a generated code survives its own normaliser', normalizePerkCode(code) === code);
t('lowercase accepted', normalizePerkCode(code.toLowerCase()) === code);
t('missing dashes accepted', normalizePerkCode(code.replace(/-/g, '')) === code);
t('missing TAP prefix accepted', normalizePerkCode(code.slice(4)) === code);
t('surrounding whitespace tolerated', normalizePerkCode(`  ${code} `) === code);
t('garbage rejected', normalizePerkCode('hello there') === null);
t('wrong length rejected', normalizePerkCode('TAP-ABCD-EF') === null);
// The alphabet excludes these precisely so they cannot be confused. A code
// containing one did not come from us.
t('ambiguous glyphs rejected (O I 0 1)',
  normalizePerkCode('TAP-OOOO-IIII') === null && normalizePerkCode('TAP-0000-1111') === null);

console.log('\nVALIDITY\n');
t('unknown code', evaluatePerk({ perk: null }).reason === 'unknown_code');
t('already redeemed', evaluatePerk({ perk: { perk_redeemed_at: '2026-08-01' } }).reason === 'already_redeemed');
t('inactive partner', evaluatePerk({ perk: { partner_active: false } }).reason === 'partner_inactive');
t('a live reservation blocks',
  evaluatePerk({ perk: { perk_reserved_at: new Date().toISOString() } }).reason === 'reserved_by_another_checkout');
t('a stale reservation does not block',
  evaluatePerk({ perk: { perk_reserved_at: new Date(Date.now() - (RESERVATION_MINUTES + 1) * 60_000).toISOString() } }).valid === true);
t('a clean row is valid', evaluatePerk({ perk: {} }).valid === true);
// Nathan, 17 Aug: "Lets just make the coupon never expire." A future edit that
// reintroduces expiry has to delete this line, which makes it a decision again.
t('NO EXPIRY — a coupon issued years ago is still valid',
  evaluatePerk({ perk: { perk_issued_at: '2019-01-01T00:00:00Z' } }).valid === true);

console.log('\nLINE ITEMS\n');
const items = [
  { price_data: { unit_amount: 8900, product_data: { name: 'Filing service' } } },
  { price_data: { unit_amount: 2500, product_data: { name: 'Broward VAB fee' } } },
];
const discounted = applyPerkToLineItems(items);
t('service fee 8900 -> 6900', discounted[0].price_data.unit_amount === 8900 - PERK_AMOUNT_CENTS);
// The VAB fee is collected for the county and forwarded. Discounting it would
// mean paying part of a statutory fee out of pocket while telling the customer
// they had paid it.
t('the county VAB fee is NOT discounted', discounted[1].price_data.unit_amount === 2500);
t('the original array is not mutated', items[0].price_data.unit_amount === 8900);
let threw = false;
try { applyPerkToLineItems([{ price_data: { unit_amount: 2500, product_data: { name: 'x' } } }]); }
catch { threw = true; }
t('throws rather than silently failing to discount', threw);

// ── 2. THE SETTLEMENT REFUSAL ───────────────────────────────────────────────
console.log('\nA REDEEMED COUPON CANCELS THE COMMISSION\n');
const partner = { email: 'partner@example.com', active: true };
const order = { id: 'o1', ref_code: 'ABC', customer_email: 'buyer@example.com', payment_status: 'paid' };

t('a discounted order pays no commission',
  eligibility({ ...order, perk_code: code }, partner, new Set()).reason === 'perk_redeemed');
// Checked before self_referral so the partner is told the true reason: they
// already received the $20, as a discount.
t('perk_redeemed is reported ahead of self_referral',
  eligibility({ ...order, customer_email: partner.email, perk_code: code }, partner, new Set()).reason === 'perk_redeemed');
// Otherwise two partners could split $40 out of one $89 order.
t('ANOTHER partner\'s coupon still cancels the commission',
  eligibility({ ...order, perk_code: 'TAP-ZZZZ-ZZZZ' }, partner, new Set()).reason === 'perk_redeemed');
t('an undiscounted order still pays normally',
  eligibility(order, partner, new Set()).ok === true);
t('the self-referral guard still fires without a coupon',
  eligibility({ ...order, customer_email: partner.email }, partner, new Set()).reason === 'self_referral');
t('an empty perk_code does not block a payout',
  eligibility({ ...order, perk_code: '' }, partner, new Set()).ok === true);

// ── 3. CROSS-FILE INVARIANTS ────────────────────────────────────────────────
console.log('\nFACTS THAT LIVE IN TWO FILES AND MUST AGREE\n');
const migration = read('scripts/migrations/2026-08-17-partner-perk.sql');
const perkSrc = read('lib/partnerPerk.js');
const fulfillSrc = read('lib/fulfillOrder.js');
const settleSrc = read('lib/referralSettlement.js');
const checkoutSrc = read('pages/api/checkout.js');

t('the migration file is present', migration.length > 0);

const jsAlphabet = (perkSrc.match(/const ALPHABET = '([^']+)'/) || [])[1];
const sqlAlphabet = (migration.match(/alphabet constant text := '([^']+)'/) || [])[1];
t('the backfill alphabet matches the generator alphabet',
  Boolean(jsAlphabet) && jsAlphabet === sqlAlphabet,
  `js=${jsAlphabet} sql=${sqlAlphabet}`);

for (const [k, fn] of Object.entries(RPC)) {
  t(`the migration creates ${fn}() for RPC.${k}`,
    new RegExp(`create or replace function\\s+${fn}\\s*\\(`).test(migration));
}

// The writer and the reader of orders.perk_code. If either name moves, the
// commission stops being cancelled and nothing complains.
t('fulfillOrder WRITES orders.perk_code on the insert', /perk_code:\s*m\.perkCode/.test(fulfillSrc));
t('referralSettlement READS order.perk_code', /order\.perk_code/.test(settleSrc));
t('fulfillOrder confirms the coupon against the reservation key',
  /perk_confirm/.test(fulfillSrc) && /p_session:\s*m\.perkKey/.test(fulfillSrc));

// Checkout must reserve BEFORE discounting — the discount is applied off
// `perkApplied`, which is only ever set inside the successful-reserve branch.
t('checkout discounts only after a successful reservation',
  /perkApplied\s*\?\s*applyPerkToLineItems/.test(checkoutSrc));
t('checkout sends the reservation key to the webhook', /perkKey:\s*perkApplied\s*\?\s*perkKey/.test(checkoutSrc));

// The migration must create the order-side columns settlement depends on.
t('the migration adds orders.perk_code', /alter table orders add column if not exists perk_code/.test(migration));
t('the migration adds the unique index on referrals.perk_code',
  /create unique index if not exists referrals_perk_code_unique/.test(migration));

console.log(`\n${failed === 0 ? '✓ partner coupon: all checks passed' : `✗ partner coupon: ${failed} check(s) failed`}\n`);
process.exit(failed ? 1 : 0);
