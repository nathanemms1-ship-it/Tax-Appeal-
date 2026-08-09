#!/usr/bin/env node
/**
 * DOES THE PARTNER PROGRAM STILL SAY ONLY TRUE THINGS, AND PAY ONLY ONCE?
 *
 * ============================================================================
 * WHY
 * ============================================================================
 * Two failures put this file here, and neither would have shown up in a build:
 *
 *   1. Eligibility was implemented twice. /api/referral-stats excluded refunds,
 *      self-referrals, unknown codes, inactive partners and already-settled orders.
 *      /api/partner-stats did `orders.length * 20`. Both compiled. Both ran. They
 *      disagreed on every partner who had ever had a refund, and the partner-facing
 *      one was always the larger.
 *
 *   2. /partners advertised five states and 67 Florida counties. pages/apply.js
 *      blocks two of those states at checkout, and send-letter.js refuses to mail
 *      to an unconfirmed Florida county. Both compiled. Both ran.
 *
 * Compiling proves nothing about either. So the invariants are asserted here and
 * run in the same suite as the other verify-* scripts.
 *
 *   node scripts/verify-referrals.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/**
 * Source with comments removed.
 *
 * The claim checks below search for the exact wording of defects that have already
 * been fixed — and the fixes are commented with the wording they replaced, because a
 * reader needs to know what was wrong to know why the code looks the way it does.
 * Grepping the raw file therefore finds every quoted defect and reports it as live,
 * which trains everyone to either delete the explanation or ignore the checker.
 *
 * Both of those are worse than stripping comments here. Only /* *\/ blocks and
 * whole-line // comments go: a trailing comment is left alone so that a URL or a
 * divide is never mangled, and no claim has ever been shipped inside one.
 */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

/** Read a file as it renders — no commentary. Use this for every claim check. */
const readCode = (p) => stripComments(read(p));

/**
 * SQL with `--` comments stripped, for the same reason as stripComments above: the
 * migration documents the ON DELETE CASCADE it replaces, and grepping the raw file
 * for CASCADE finds the explanation and calls it a live defect.
 */
const readSql = (p) => read(p).replace(/--.*$/gm, '');

let pass = 0;
const failures = [];
const t = (name, cond, detail) => (cond ? pass++ : failures.push(detail ? `${name} — ${detail}` : name));

// ============================================================================
// 1. ONE IMPLEMENTATION OF ELIGIBILITY
// ============================================================================
const settlement = read('lib/referralSettlement.js');
const referralStats = read('pages/api/referral-stats.js');
const partnerStats = readCode('pages/api/partner-stats.js');
const cron = read('pages/api/cron/settle-referrals.js');

for (const [name, src] of [
  ['referral-stats', referralStats],
  ['partner-stats', partnerStats],
  ['settle-referrals', cron],
]) {
  t(`${name} imports lib/referralSettlement`, /from '.*referralSettlement'/.test(src),
    'this route must not implement its own eligibility rules');
}

// The specific arithmetic that produced the divergence. If it ever reappears
// anywhere, someone has gone back to counting rows.
t('no raw `orders.length * 20` earnings math survives',
  !/(allOrders|orders|referrals)\.length\s*\*\s*20\b/.test(partnerStats),
  'partner earnings must come from settle(), not from a row count');

// Every exclusion reason must exist in the shared module, because both the cron and
// the dashboard's explanation list key off these exact strings.
for (const reason of ['unknown_referral_code', 'partner_inactive', 'self_referral', 'already_settled', 'no_payout_account']) {
  t(`settlement defines '${reason}'`, settlement.includes(`'${reason}'`));
}

// ============================================================================
// 2. THE MONEY MOVES IN EXACTLY ONE PLACE
// ============================================================================
t('only the cron creates transfers',
  !/transfers\.create/.test(referralStats) && !/transfers\.create/.test(partnerStats),
  'a stats endpoint must never move money — that is how orders got paid twice before');

t('the cron authenticates with requireCronSecret', /requireCronSecret\(req, res\)/.test(cron));
t('the cron uses a deterministic Stripe idempotency key',
  /idempotencyKey: transferTag\(order\.id\)/.test(cron));
t('the cron sets transfer_group for the >24h retry lookup',
  /transfer_group: transferTag\(order\.id\)/.test(cron) && /transfers\.list/.test(cron),
  'idempotency keys expire after 24h; without the transfer_group lookup a retry pays twice');
t('the cron requires a payout account before transferring',
  /requirePayoutAccount: true/.test(cron));
t('the cron refuses to run when the ledger is unreadable',
  /Refusing to settle/.test(cron),
  'an empty settled-set means "nothing has ever been paid", which pays everyone again');
t('the cron supports a dry run', /dryRun/.test(cron));

const vercelJson = JSON.parse(read('vercel.json'));
t('the settlement cron is scheduled',
  vercelJson.crons?.some(c => c.path === '/api/cron/settle-referrals'),
  'the route exists but nothing calls it — which is the state this whole fix started from');

// The database-level guard. This is the only one that cannot race.
const sql = readSql('scripts/sql/referral_payouts.sql');
t('referral_payouts.order_id is UNIQUE', /CREATE UNIQUE INDEX IF NOT EXISTS referral_payouts_order_id_key/.test(sql),
  'the app-level check has a read-to-write gap; the constraint does not');
t('the payout ledger survives order deletion', /ON DELETE RESTRICT/.test(sql) && !/ON DELETE CASCADE/.test(sql),
  'CASCADE deletes the proof we paid a partner when the order it paid for goes away');
t('the migration writes the column the cron writes',
  /payout_month/.test(sql) && /payout_month: period\.month/.test(cron),
  'the ledger stamps a period as one text month; do not add a second shape alongside it');
t('the migration adds every column the cron writes',
  ['partner_email', 'stripe_account_id', 'failure_reason'].every(c => sql.includes(c)));

// ============================================================================
// 2b. THE REFUND HOLDBACK AND THE CLAWBACK
// ============================================================================
const { MIN_ORDER_AGE_DAYS, eligibility, settle: settleFn } =
  await import('../lib/referralSettlement.js');

t('a refund holdback exists and is at least a day',
  Number.isFinite(MIN_ORDER_AGE_DAYS) && MIN_ORDER_AGE_DAYS >= 1,
  'without it, an order placed at 11pm on the 31st is paid at 10am on the 1st');
t('the cron applies the holdback', /minAgeDays: MIN_ORDER_AGE_DAYS/.test(cron));
t('the cron looks back past the period so held orders return',
  /CATCHUP_DAYS/.test(cron) && /catchupFrom/.test(cron),
  'a strictly month-bounded query never revisits an order it held back, so it is never paid');

// The holdback is arithmetic, so test the arithmetic rather than the source text.
const PARTNER = { code: 'JANE-SMITH', email: 'jane@x.com', active: true, stripe_account_id: 'acct_1' };
const NOW = new Date('2026-09-01T15:00:00Z');
const orderAgedDays = (d, id) => ({
  id, ref_code: 'JANE-SMITH', customer_email: 'buyer@x.com', payment_status: 'paid',
  created_at: new Date(NOW.getTime() - d * 24 * 3600 * 1000).toISOString(),
});

t('an order younger than the holdback is not payable',
  eligibility(orderAgedDays(0.5, 'fresh'), PARTNER, new Set(),
    { minAgeDays: MIN_ORDER_AGE_DAYS, now: NOW }).reason === 'too_recent');
t('an order older than the holdback is payable',
  eligibility(orderAgedDays(MIN_ORDER_AGE_DAYS + 1, 'old'), PARTNER, new Set(),
    { minAgeDays: MIN_ORDER_AGE_DAYS, now: NOW }).ok === true);
t('an order with no created_at is held, not paid',
  eligibility({ id: 'x', ref_code: 'JANE-SMITH', payment_status: 'paid' }, PARTNER, new Set(),
    { minAgeDays: MIN_ORDER_AGE_DAYS, now: NOW }).reason === 'too_recent',
  'an order whose age cannot be established is exactly the one not to pay early');
t('the dashboard and payout sheet do NOT apply the holdback',
  !/minAgeDays/.test(partnerStats) && !/minAgeDays/.test(referralStats),
  'a partner should see a referral the moment it lands, labelled pending');

// Netting withholds the NEWEST order, which needs settle() to sort oldest-first.
const sorted = settleFn({
  orders: [orderAgedDays(10, 'newer'), orderAgedDays(30, 'older')],
  partners: [PARTNER], minAgeDays: MIN_ORDER_AGE_DAYS, now: NOW,
});
t('settle sorts each partner\'s orders oldest first',
  sorted.payable[0]?.orders.map(o => o.id).join(',') === 'older,newer',
  'the clawback withholds from the end of this list, so it must be the newest order');

t('the cron nets reversals instead of reversing transfers',
  /applyClawback/.test(cron) && /clawed_back/.test(cron),
  'once the money is in a partner bank account a reversal only makes their account negative');
t('clawed_back counts as settled everywhere, not just paid',
  /clawed_back/.test(cron) && /clawed_back/.test(partnerStats) && /clawed_back/.test(referralStats),
  'omitting it hands the withheld order back to the next run, undoing the clawback');
t('the ledger permits the clawed_back status', /'clawed_back'/.test(sql),
  'the CHECK constraint rejects the write otherwise, and the clawback silently fails');
// ============================================================================
// 2c. PARTNER PAYOUT SCHEDULE IS THE CLAWBACK RECOVERY WINDOW
// ============================================================================
const connect = readCode('pages/api/create-connect-account.js');
t('new partner accounts pay out weekly',
  /interval: 'weekly'/.test(connect),
  'monthly on the 1st could leave a partner waiting 30 days for money we said was sent');
t('partner accounts are no longer anchored to the settlement day',
  !/monthly_anchor: 1/.test(connect),
  'the same day the cron fires was the worst possible anchor');

// ============================================================================
// 3. THE DASHBOARD MAY NOT CALL UNPAID MONEY "PAID"
// ============================================================================
const dashboard = readCode('pages/partners/dashboard.js');
t('the dashboard explains an adjustment rather than silently shrinking',
  /adjustments/.test(dashboard),
  'a pending total that drops with no reason is how you lose a partner');
t('the dashboard explains a held-back referral as a delay, not a loss',
  /too_recent/.test(dashboard));
t('dashboard reads `paid` from the ledger', /data\.paid\?\.amount/.test(dashboard));
t('dashboard shows pending separately', /data\.pending\?\.amount/.test(dashboard));
t('dashboard no longer captions earnings as paid out',
  !/earnings\}\s*paid out/.test(dashboard) && !/earns \$20 — paid on the 1st/.test(dashboard),
  'these captions were rendered for money that had never been transferred');
t('partner-stats returns paid and pending separately',
  /paid: \{ orders:/.test(partnerStats) && /pending: \{ orders:/.test(partnerStats));

// ============================================================================
// 4. COVERAGE CLAIMS MATCH THE CODE THAT ENFORCES THEM
// ============================================================================
const { getServiceCoverage, SERVING_STATES, NOT_YET_SERVING } = await import('../lib/serviceCoverage.js');
const coverage = getServiceCoverage();

// The marketing page must not outrun the checkout gate. pages/apply.js is the gate.
const apply = read('pages/apply.js');
const gatedStates = [...apply.matchAll(/(\w{2}):\s*\{[^}]*servingFrom:\s*(\d{4})/g)].map(m => [m[1], Number(m[2])]);
t('lib/serviceCoverage agrees with apply.js on which states are gated',
  gatedStates.length === Object.keys(NOT_YET_SERVING).length &&
    gatedStates.every(([code, year]) => NOT_YET_SERVING[code] === year),
  `apply.js gates ${JSON.stringify(gatedStates)}, serviceCoverage says ${JSON.stringify(NOT_YET_SERVING)}`);

t('no gated state is listed as currently serving',
  !SERVING_STATES.some(s => s in NOT_YET_SERVING));

// The Florida count must be counted, never typed.
const partners = readCode('pages/partners.js');
t('/partners derives its county counts at build time',
  /getStaticProps/.test(partners) && /serviceCoverage/.test(partners),
  'a hardcoded county count is wrong the next time a county is confirmed');
t('/partners no longer claims all 67 Florida counties',
  !/all 67 Florida counties/.test(partners));
t('/partners no longer advertises Arkansas and Alabama as served',
  !/all 75 Arkansas counties/.test(partners) && !/all 67 Alabama counties/.test(partners));

// Sanity-check the derived number against the address table it comes from, so a
// refactor of serviceCoverage that silently returns 0 or 67 is caught.
t('Florida supported-county count is plausible',
  coverage.florida.supported > 0 && coverage.florida.supported <= 67,
  `got ${coverage.florida.supported}`);
t('Florida supported + pending accounts for every county',
  coverage.florida.supported + coverage.florida.pending === 67,
  `${coverage.florida.supported} + ${coverage.florida.pending} != 67`);

// ============================================================================
// 5. PRICING AND EARNINGS CLAIMS
// ============================================================================
// A bare "$89 flat" is true in TX and GA and false in FL, where a statutory county
// fee of $15-$50 is charged on top. The partner surfaces are read during the
// FLORIDA season, so the flat-fee wording was wrong exactly when it was read most.
for (const [name, src] of [['/partners', partners], ['dashboard', dashboard]]) {
  t(`${name} does not quote a bare flat $89`,
    !/\$89 flat/.test(src) && !/for \$89\b/.test(src),
    'Florida customers pay $89 plus a county filing fee of $15-$50');
}

t('/partners does not promise savings in the thousands',
  !/saving thousands/.test(partners),
  'no substantiation exists for a typical saving');
t('/partners does not present the earnings table as a typical season',
  !/What a season looks like/.test(partners),
  'FTC Act s.5 judges the net impression, and that caption is the claim');
t('/partners does not state that Stripe files the 1099 automatically',
  !/Stripe will automatically issue you a 1099-NEC/.test(partners),
  'that depends on Stripe tax reporting being enabled — a setting, not a guarantee');

// ============================================================================
// 6. CAN-SPAM / CONTRACT ADDRESS
// ============================================================================
t('/partners renders the postal address', /BUSINESS_ADDRESS/.test(partners));

// ============================================================================
// 6b. THE PARTNER EMAILS
// ============================================================================
// Two near-identical bodies meant every claim existed twice, so a fix applied to
// one silently left the other wrong. They now share one definition each.
const registerCode = readCode('pages/api/register-referrer.js');

t('partner emails carry a postal address (CAN-SPAM)',
  /BUSINESS_ADDRESS/.test(registerCode) && /emailFooter\(\)/.test(registerCode),
  '15 U.S.C. 7704(a)(5) requires a physical postal address in commercial email');
t('partner emails offer a way to opt out',
  /unsubscribe/i.test(registerCode));
t('partner emails do not quote a bare flat $89',
  !/\$89 flat/.test(registerCode),
  'Florida customers pay $89 plus a county filing fee of $15-$50');
t('partner emails do not promise Stripe files the 1099',
  !/Stripe will issue a 1099/.test(registerCode) && !/1099 tax forms automatically/.test(registerCode),
  'that depends on Stripe tax reporting being enabled — a setting, not a guarantee');
t('the shared email blocks are defined once and called from both emails',
  /const partnerScriptBlock =/.test(registerCode) &&
    (registerCode.match(/\$\{partnerScriptBlock\(/g) || []).length === 2 &&
    (registerCode.match(/\$\{emailFooter\(\)\}/g) || []).length === 2,
  'one definition, one call per email — inlining them is how the two bodies diverged');

// ============================================================================
// 7. RATE LIMITING ON THE UNAUTHENTICATED SIGNUP
// ============================================================================
const register = read('pages/api/register-referrer.js');
t('register-referrer actually calls enforceRateLimit',
  /await enforceRateLimit\(req, res, 'referrer'/.test(register),
  'importing it is not calling it — this route sends mail from our sending domain');

// ============================================================================
console.log(`\nreferrals: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('  ✓ partner program invariants hold\n');
