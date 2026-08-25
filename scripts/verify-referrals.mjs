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
// Imported to re-derive the served count independently, rather than trusting the
// number serviceCoverage hands back — a refactor that returns a constant would
// otherwise satisfy every assertion below.
const { FL_COUNTY_NAMES, isFlCountySupported } = await import('../lib/flVabAddresses.js');
const { getFlVabFee } = await import('../lib/flCountyFees.js');

/**
 * ============================================================================
 * THE PARTNER PAGE MAY NOT PROMISE AN EMAIL NOBODY SENDS
 * ============================================================================
 * Added 11 Aug 2026. /partners, twice, and the partner dashboard once, claimed:
 * "We email every customer 11 months after their filing with a renewal reminder."
 * There was no such job — four crons exist, and `renewal` appeared in none of them
 * nor anywhere in email-templates.js. It was a recurring-revenue claim used to
 * recruit partners, which is the worst kind to get wrong: they repeat it to their
 * own clients in their own name.
 *
 * Replaced by perpetual attribution, which is publishable BEFORE it is built for a
 * specific reason worth preserving: `ref_code` is already written onto every order
 * at purchase, and no customer can refile before FL 2027, so nobody can be
 * short-changed between publishing and shipping. That reasoning does not transfer
 * automatically — before adding another forward-looking partner promise, check that
 * second condition holds for it too.
 *
 * These assertions pin both halves: the dead claim cannot return, and the live one
 * cannot quietly lose the parts that make it fair.
 */
{
  const partnersSrc = readCode('pages/partners.js');
  const dashSrc = readCode('pages/partners/dashboard.js');

  t('no page promises a renewal email on a timer',
    !/11 months/.test(partnersSrc) && !/11 months/.test(dashSrc) &&
    !/renewal reminder/i.test(partnersSrc) && !/renewal reminder/i.test(dashSrc),
    'there is no cron that sends one; if one is ever built, this check is what should be relaxed');

  t('the renewal promise is not reinstated without a cron behind it',
    !/renewal/i.test(readCode('pages/api/email-templates.js')) ||
    /renewal/i.test(read('vercel.json')),
    'a renewal template with no scheduled job is the same defect in a new place');

  // The perpetual-credit promise, and the three parts that make it honest.
  t('/partners states that credit carries to repeat filings',
    /You keep earning on the clients you bring us/.test(partnersSrc));
  t('the promise is scoped to active partners',
    /as long as you(&rsquo;|\')?re an active partner/.test(partnersSrc),
    'without this a removed or closed account accrues forever');
  t('the promise says plainly we will not take the client direct',
    /comes back on their own later, you still get paid/.test(partnersSrc),
    'that sentence is the whole reason a realtor hands over their client list');
  t('the FAQ discloses the competing-referral exception',
    /actively referred by a different partner that season/.test(partnersSrc),
    'a partner who does the work and loses to one who did nothing will notice');
}

/**
 * A PARTNER LINK MUST NOT BE A BEARER CREDENTIAL.
 *
 * /partners/connect binds a Stripe payout destination to a referral code, and
 * /partners/dashboard shows a partner's earnings. Both authenticated on
 * ?ref=CODE&email=EMAIL and nothing else. create-connect-account.js says why that
 * is not a secret: "codes are FIRSTNAME-LASTNAME and appear in public links". A
 * realtor's work email is on every listing they have.
 *
 * That endpoint refuses to REBIND once stripe_account_id is set, so an onboarded
 * partner is safe. An un-onboarded one is not: anyone holding the pair binds their
 * own bank first and collects that partner's fees, while the partner sees an
 * account that looks connected and no money arriving. Every partner is in that
 * state between signing up and finishing Stripe — which is the state a recruitment
 * campaign puts a whole list into at once.
 *
 * Tokens are verified BEHAVIOURALLY below rather than by grepping for `token`,
 * because the failure that matters is a signature that does not actually check.
 */
{
  const realSecret = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = 'verify-referrals-fixture';
  const { partnerToken, verifyPartnerToken, PARTNER_TOKEN_TTL_MS } = await import('../lib/partnerToken.js');

  const good = partnerToken('JANE-SMITH', 'jane@example.com');
  t('a token we issued verifies', verifyPartnerToken('JANE-SMITH', 'jane@example.com', good).ok === true);
  t('case differences in code or email do not break a real link',
    verifyPartnerToken('jane-smith', 'JANE@EXAMPLE.COM', good).ok === true,
    'partners retype their email with different capitalisation constantly');

  t('a token for one partner does not work for another',
    verifyPartnerToken('BOB-JONES', 'jane@example.com', good).ok === false &&
    verifyPartnerToken('JANE-SMITH', 'bob@example.com', good).ok === false,
    'this is the whole attack: bind your own bank to someone else\'s code');

  t('no token at all is refused', verifyPartnerToken('JANE-SMITH', 'jane@example.com', '').ok === false);
  t('a forged signature is refused',
    verifyPartnerToken('JANE-SMITH', 'jane@example.com', `${Date.now() + 1000}.${'0'.repeat(32)}`).ok === false);

  // The expiry is inside the signed payload. Editing it must break the signature,
  // or the TTL is decoration.
  t('the expiry cannot be extended by editing the link',
    verifyPartnerToken('JANE-SMITH', 'jane@example.com', `${Date.now() + 9e12}.${good.split('.')[1]}`).ok === false);

  const stale = partnerToken('JANE-SMITH', 'jane@example.com', Date.now() - PARTNER_TOKEN_TTL_MS - 1000);
  t('an expired link stops working', verifyPartnerToken('JANE-SMITH', 'jane@example.com', stale).reason === 'expired');

  if (realSecret === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = realSecret;

  // Wiring: both routes must actually call it, and the sharing link must NOT be
  // signed — /apply?ref=CODE is public by design and is handed to strangers.
  const connectApi = read('pages/api/create-connect-account.js');
  const statsApi = read('pages/api/partner-stats.js');
  /**
   * ORDER MATTERS, AND THE FIRST VERSION OF THIS CHECK DID NOT TEST IT.
   *
   * It asserted the token was verified before `accounts.create`, which is true even
   * if the verification sits after the partner-row lookup — and an injection moving
   * it there passed. But a route that reads the row first answers "no such partner"
   * to an unsigned caller, which turns it back into the oracle the token exists to
   * close: a stranger can still confirm a (code, email) pair is real.
   *
   * Assert against the thing the comment in that file actually promises: the
   * signature is checked before ANY database read.
   */
  const before = (src, first, second) => {
    const a = src.indexOf(first);
    const b = src.indexOf(second);
    return a !== -1 && b !== -1 && a < b;
  };
  t('the payout-binding route verifies the token before it reads the partner row',
    before(connectApi, 'verifyPartnerToken(code, partnerEmail, token)', ".from('referrals')"),
    'reading first tells an unsigned caller whether the pair exists');
  t('the dashboard route verifies before it reads the partner row',
    before(statsApi, 'verifyPartnerToken(codeUpper, emailLower, token)', ".from('referrals')"));

  const registerApi = read('pages/api/register-referrer.js');
  // Three call sites: a connect link inlined in each of the two emails, plus the one
  // inside dashboardBlock, which is defined once and mounted twice. I asserted 4 from
  // memory and it was wrong in both directions — count the file, don't guess it.
  t('emailed payout links are signed',
    (registerApi.match(/token=\$\{partnerToken\(/g) || []).length === 3,
    'a connect link in each email, plus the shared dashboard block');

  /**
   * SIGNING THE DASHBOARD LINK TOOK AWAY THE ONLY WAY BACK IN.
   *
   * Partners used to reach their dashboard by retyping ?ref=CODE&email=EMAIL — which
   * was the hole. Once signed, the only signed link lived on the page shown right
   * after signup, so a partner who closed it could never see their earnings again.
   * Caught while verifying the deploy, before the campaign email that tells them to
   * go and look.
   */
  // Two MOUNTS. The definition is an arrow function, `const dashboardBlock = (code,
  // email) =>`, so it does not match `dashboardBlock(`.
  t('both partner emails carry a dashboard link, not just a payout link',
    (registerApi.match(/\$\{dashboardBlock\(/g) || []).length === 2,
    'closing the signup page must not lock a partner out of their own earnings');
  t('each email builds the dashboard link with its own email variable',
    /dashboardBlock\(code, email\)/.test(registerApi) && /dashboardBlock\(code, normalizedEmail\)/.test(registerApi),
    'the reminder and the welcome path normalise the address differently; a token signed over the wrong one verifies against nothing');
  /**
   * THE RETURNING-PARTNER PAGE MUST NOT PROMISE WHAT THE API WITHHOLDS.
   *
   * register-referrer refuses to return the code on the duplicate path — the endpoint
   * is unauthenticated, so returning it makes it an "email in, code out" lookup. The
   * page rendered the new-signup panel against that response anyway: an empty code
   * box, an empty link box, a copy button that copied nothing, a dashboard link with
   * an empty token, and a Stripe button posting refCode: undefined. Five dead
   * controls under the words "Your link is below."
   *
   * Reported by Nathan on 13 Aug from the live page. No check saw it, because every
   * check reads the API and the API was correct.
   */
  const partnersPage = read('pages/partners.js');
  t('a returning partner is told the link was emailed, not shown a dead one',
    /result\.duplicate \?/.test(partnersPage) && /emailed your referral link/.test(partnersPage));
  /**
   * Anchored to the BUTTON, not the identifier. The first version compared against
   * indexOf('copyLink'), which finds the function DECLARATION near the top of the
   * file — so the comparison was always false regardless of where the button sits.
   * The same shape of mistake as matching a component's declaration rather than its
   * mount, which this project has now made four times.
   */
  const dupBranch = partnersPage.indexOf('result.duplicate ? (');
  const copyButton = partnersPage.indexOf('onClick={copyLink}');
  t('the code, copy button and Stripe button render only for a fresh signup',
    dupBranch !== -1 && copyButton !== -1 && dupBranch < copyButton &&
    /\) : \(\n\s*<>/.test(partnersPage),
    'they all read result.code, which the duplicate path deliberately does not send');
  t('the page no longer claims the link is below',
    !/Your link is below/.test(partnersPage));

  /**
   * A PARTNER MUST NOT LEARN ABOUT THE ELEVEN COUNTIES FROM A BOUNCED REFERRAL.
   *
   * /partners has rendered coverageSentence() since 9 Aug; the emails did not. The
   * email is what an agent keeps. Eleven Florida counties are refused by apply.js
   * today — correctly, with the homeowner captured and notified — but an agent who
   * was not warned reads their first bounced referral as a broken product, and does
   * not send a second one to check.
   */
  t('both partner emails state where we can actually file',
    (registerApi.match(/\$\{coverageBlock\(\)\}/g) || []).length === 2,
    'the welcome and the re-send each need it — the re-send is what a lapsed partner reads');

  t('the coverage line is derived, not typed',
    /coverageSentence\(\)/.test(registerApi) && !/56 of Florida/.test(registerApi),
    'a hardcoded count goes stale the next time a county is confirmed by phone');

  // The sentence itself must keep naming both halves: what we serve, and what we do
  // when we cannot. Losing the second half turns a promise into a coverage boast.
  const { coverageSentence: sentence } = await import('../lib/serviceCoverage.js');
  const line = sentence();
  t('the coverage sentence says what happens to a client we cannot serve',
    /charge nothing/.test(line) && /email them the moment their county opens/.test(line),
    'that is the part that stops a bounced referral looking like a broken product');

  /**
   * THE DASHBOARD MUST NOT GIVE SEASONAL ADVICE OUT OF SEASON.
   *
   * Both prompts read "Florida's filing season opens August 24 — a great time to
   * reach out", unconditionally. On 19 September, the day after the deadline, a
   * partner logging in was told to go and call clients about a window that had shut.
   * Same defect as the hardcoded "August 11" this file's own header describes: copy
   * stating a fact about time without asking what time it is.
   *
   * Tested by driving flSeasonPrompt with each window state rather than waiting for
   * the calendar. The function is extracted from source and given a stubbed status,
   * so this exercises the real branching, not a copy of it.
   */
  {
    const dashSrc = read('pages/partners/dashboard.js');
    const body = dashSrc.match(/function flSeasonPrompt[\s\S]*?\n\}/)[0];
    const make = (status) =>
      new Function('getFilingWindowStatus', 'FL_OPEN_LABEL', `${body}; return flSeasonPrompt;`)(
        () => status, 'August 24');

    const NOW = new Date('2026-09-19T12:00:00Z');
    const openNow = make({ canFile: true, canPreOrder: false, isOpen: true })(NOW);
    const preOrder = make({ canFile: false, canPreOrder: true, isOpen: false, openDate: new Date('2026-08-24') })(NOW);
    const early = make({ canFile: false, canPreOrder: false, isOpen: false, openDate: new Date('2026-10-10') })(NOW);
    const closed = make({ canFile: false, canPreOrder: false, isOpen: false, openDate: new Date('2027-08-24') })(NOW);

    t('an open window says file now, not "a great time to reach out"',
      /OPEN/.test(openNow) && /unfiled/.test(openNow));
    t('the pre-order window is the one that says reach out',
      /good time to reach out/.test(preOrder) && /file it the day the window opens/.test(preOrder));
    t('before pre-order we tell them to wait, not to call',
      /not taking orders yet/.test(early) && !/good time to reach out/.test(early));
    t('a closed season says so, and never invites outreach',
      /closed for this year/.test(closed) && !/good time to reach out/.test(closed) && /2027/.test(closed),
      'this is the sentence a partner saw on 19 September telling them to go and call clients');

    t('both prompts on the page read from the same derived sentence',
      (dashSrc.match(/\{seasonPrompt\}/g) || []).length === 2 &&
      !/a great time to reach out/.test(dashSrc));

    // Pre-rendered page: a date-dependent sentence computed at module scope would be
    // baked in at build time and served stale from the CDN.
    t('the season sentence is computed after mount, not at build',
      /useEffect\(\(\) => \{ setSeasonPrompt\(flSeasonPrompt\(\)\); \}, \[\]\);/.test(dashSrc));
  }

  t('the dashboard link says plainly that it is personal',
    /treat it like a password/.test(registerApi),
    'a partner who forwards it hands over their earnings view');
  t('the sharing link is deliberately NOT signed',
    /\/apply\?ref=\$\{code\}`/.test(registerApi) && !/\/apply\?ref=[^`]*token=/.test(registerApi),
    'that link is public by design — signing it would break every referral');
}

/**
 * A PARTNER WHO CANNOT FINISH ONBOARDING CANNOT BE PAID.
 *
 * Every guard in this file protects money that only moves if the connected account
 * reaches `transfers: active`. On 12 Aug all three connected accounts had been
 * Restricted since June, stopped at the same screen — Stripe asking for a business
 * website, which a realtor does not have. Agreement never accepted, transfers never
 * active, and the whole payout apparatus below therefore untested against a real
 * destination.
 *
 * Supplying business_profile.product_description at creation satisfies that
 * requirement before the partner is ever asked. Verified live: entering that text
 * was the one thing that moved an account to Enabled with transfers active.
 *
 * Asserted because it is invisible — nothing fails, no error is logged, partners
 * simply stop appearing in the Enabled list and the settlement run holds them over
 * forever while the dashboard shows them a pending balance.
 */
{
  const connectSrc = read('pages/api/create-connect-account.js');
  const connectCode = connectSrc
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  t('connected accounts are created with a product description',
    /business_profile:\s*\{[\s\S]{0,400}product_description:/.test(connectCode),
    'without it Stripe asks the partner for a website, which is where three accounts stalled');

  t('the description states the actual economics',
    /fixed \$20 referral fee/.test(connectCode) && /Does not provide tax, legal, or appraisal advice/.test(connectCode),
    'Stripe is deciding whether this is a real and permitted business');

  // Their business, not ours. A url here would misrepresent both sides.
  t('we do not put our own site in the partner\'s Stripe profile',
    !/business_profile:\s*\{[\s\S]{0,400}url:/.test(connectCode));

  t('the transfers capability is still what is requested',
    /capabilities:\s*\{[\s\S]{0,120}transfers:\s*\{\s*requested:\s*true/.test(connectCode),
    'no transfers capability means no payout, whatever else is configured');
}

/**
 * THE HAND-FILING PATH IS GONE AND MUST NOT COME BACK BY ACCIDENT.
 *
 * `needsManualFiling` was set in React state, read by one component, and sent
 * nowhere. It described an ops queue that did not exist, so an order in an
 * unconfirmed county queued like any other, was refused hourly by send-letter, and
 * nobody found out. Reintroducing the flag without also building somewhere for the
 * order to GO recreates exactly that, and it is invisible in review because the
 * funnel looks like it is doing the right thing.
 */
const applySrc = read('pages/apply.js');

/**
 * readCode(), not read() — comments are stripped, deliberately.
 *
 * The first version of this assertion failed on the block comments in apply.js and
 * serviceCoverage.js that explain WHY the flag was removed, which is the most
 * valuable text in either file and exactly what the next person needs to read
 * before reinventing it. A check that punishes writing down the reason teaches
 * people to delete the reason. Test the code; leave the history alone.
 */
t('the needsManualFiling flag is gone from the whole funnel',
  !/needsManualFiling/.test(readCode('pages/apply.js')) &&
  !/needsManualFiling/.test(readCode('components/StepFloridaFee.js')),
  'it promised routing that was never implemented; if it returns, build the queue first');
/**
 * `setFlCountyBlocked({` — the brace matters, and the injection test is what proved it.
 *
 * The first version asserted `setFlCountyBlocked(` and passed happily with the divert
 * deleted, because the CLEARING calls — setFlCountyBlocked(null) on the success path
 * and on Back — still matched. The check was satisfied by the code that undoes the
 * thing it exists to protect. Only a call that SETS a block counts.
 */
t('an unconfirmed county is refused before checkout, not accepted and flagged',
  /setFlCountyBlocked\(\s*\{/.test(applySrc),
  'applyResolvedCounty must divert to FloridaCountyUnavailable, not fall through to the fee step');
t('the block is cleared again on the path that does file',
  /setFlCountyBlocked\(\s*null\s*\)/.test(applySrc),
  'a stale block would strand a customer who went Back and picked a county we do serve');
t('the funnel tests BOTH send-letter gates, not just the address',
  /isFlCountySupported\(county\)/.test(applySrc) && /confidence === 'confirmed'/.test(applySrc),
  'checking only the address lets Nassau, Columbia and Levy through to a checkout that then refuses them');
t('the refused customer is recorded so the notify promise can be kept',
  /blockedReason: *["']fl_county_unconfirmed["']/.test(applySrc),
  'the screen promises an email when the county opens; without this row there is nobody to write to');
const coverage = getServiceCoverage();

/**
 * The marketing surface must not outrun the checkout gate.
 *
 * This used to scrape `servingFrom: 2027` out of pages/apply.js with a regex and
 * compare it against serviceCoverage's own copy. It was a real check and it
 * earned its keep: when lib/stateService.js was introduced on 25 Aug 2026 and
 * apply.js stopped carrying a literal, this is the assertion that fired.
 *
 * But reconciling two copies is a weaker thing than having one, and the right
 * response to it firing was to delete the second copy rather than teach the regex
 * a new shape. So it is now aimed at the property that actually matters: that
 * serviceCoverage and the funnel read the SAME object, and that no hand-written
 * year survives anywhere near the gate.
 */
const apply = read('pages/apply.js');
const { SERVING_FROM } = await import('../lib/stateService.js');

t('serviceCoverage does not keep its own copy of the gated states',
  NOT_YET_SERVING === SERVING_FROM,
  "NOT_YET_SERVING must BE lib/stateService.js's map, not a duplicate that happens to agree with it today");

t('apply.js has no hand-written servingFrom year',
  !/servingFrom:\s*\d{4}/.test(apply),
  'a literal year in SUPPORTED_STATES is a fourth copy of a fact that already has a home');

t('apply.js takes every gated year from the map',
  Object.keys(SERVING_FROM).every((code) => new RegExp(`servingFrom:\\s*SERVING_FROM\\.${code}\\b`).test(apply)),
  `SERVING_FROM names ${JSON.stringify(Object.keys(SERVING_FROM))}; each must be wired into SUPPORTED_STATES or the funnel will sell a state the pages have stopped advertising`);

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
t('the served count is plausible',
  coverage.florida.served > 0 && coverage.florida.served <= 67,
  `got ${coverage.florida.served}`);
t('served + not-yet-open accounts for every county',
  coverage.florida.served + coverage.florida.notYetOpen === 67,
  `${coverage.florida.served} + ${coverage.florida.notYetOpen} != 67`);
t('the ambiguous `supported` field is gone for good',
  coverage.florida.supported === undefined,
  'that name is what let served and automated be collapsed into one wrong number');

/**
 * SERVED MUST TRACK THE CHECKOUT GATE — rewritten 11 Aug 2026.
 *
 * These assertions used to require `served === 67`, on the basis that an unconfirmed
 * county was accepted and filed by hand. Hand-filing is gone: pages/apply.js
 * `applyResolvedCounty` now refuses the sale and captures the email instead. So 67 is
 * no longer the number we are allowed to say, and the check has to enforce the
 * opposite of what it used to.
 *
 * The rule is one sentence: NO MARKETING SURFACE MAY CLAIM MORE COUNTIES THAN THE
 * FUNNEL WILL TAKE AN ORDER IN. That is the failure this whole file exists to stop.
 */
t('the hand-filing fields are gone — the product no longer does it',
  coverage.florida.automatic === undefined && coverage.florida.handFiled === undefined,
  'leaving them in invites copy that promises a hand-filing path with nothing behind it');
/**
 * Re-derived from the two underlying tables, NOT from the helper serviceCoverage
 * uses — otherwise the assertion is a tautology that passes however wrong the
 * helper is. This is not hypothetical: the first version of this check compared
 * `served` against `isFlCountySupported` alone, which is what serviceCoverage was
 * already (wrongly) doing, so it went green on a count of 59 while the funnel would
 * accept 56. Assert against the source of truth, not against the thing under test.
 */
const trulyFilable = FL_COUNTY_NAMES.filter(
  c => isFlCountySupported(c) && getFlVabFee(c)?.confidence === 'confirmed'
).length;
t('serviceCoverage counts only counties send-letter.js will actually mail to',
  coverage.florida.served === trulyFilable,
  `serviceCoverage says ${coverage.florida.served}, both gates say ${trulyFilable} — ` +
  'a marketing page that outruns the checkout gate is the failure this file exists to stop');
t('the fee gate is counted, not just the address gate',
  coverage.florida.served <= FL_COUNTY_NAMES.filter(isFlCountySupported).length,
  'Nassau, Columbia and Levy have confirmed addresses and estimated fees; send-letter refuses them');
/**
 * Targeted at COVERAGE claims, not at every occurrence of the number.
 *
 * pages/florida.js legitimately cites a Department of Revenue statistic measured
 * "across all 67 Florida counties" — that is a fact about Florida's boards, not a
 * claim about us, and a blunter regex would fail the build on a true sentence and
 * teach the next person to weaken the check. What is forbidden is asserting that WE
 * serve, file in, or cover all 67 while the checkout gate refuses some of them.
 */
const OVERCLAIM = /(serve|serving|serves|served|file in|filing in|filed in|cover|covers|covering)\s+(all\s+)?(67|sixty-seven)\s*(florida\s*)?count/i;
for (const [label, src] of [['/partners', partners], ['/florida', read('pages/florida.js')]]) {
  t(`${label} does not claim more Florida counties than the funnel will accept`,
    coverage.florida.complete || !OVERCLAIM.test(src),
    `${coverage.florida.notYetOpen} counties are refused at checkout; claiming all 67 is a promise we cannot honour`);
}
t('/partners discloses what happens in a county we cannot file in',
  coverage.florida.complete || /charged nothing|charge nothing|do not take orders there/.test(partners),
  'a partner asked "what about my client in Dixie County?" needs an answer that is not a guess');

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
// 6c. THE OPERATOR CAN SEE THE PROGRAMME
// ============================================================================
// Before this existed, "who signed up", "who connected a bank" and "who has earned
// money we cannot send" were answerable only from the Supabase table editor.
const roster = read('pages/api/partner-roster.js');
const admin = readCode('pages/admin.js');

t('the partner roster endpoint is admin-authed',
  /requireAdmin\(req, res, 'partner-roster'\)/.test(roster));
t('the roster derives figures from settle(), not from stale columns',
  /from '.*referralSettlement'/.test(roster) &&
    !/total_referrals\b[^,]*\|\|/.test(roster) && !/r\.total_paid/.test(roster),
  'referrals.total_referrals and total_paid are written at signup and never maintained');
t('the roster is read-only — it must never move money',
  !/transfers\.create/.test(roster) && !/\.upsert\(/.test(roster) && !/\.update\(/.test(roster),
  'the settlement cron is the only writer');
t('the roster surfaces partners owed money it cannot pay',
  /awaitingPayoutAccount/.test(roster) && /owedButUnpayable/.test(roster),
  'earned-but-unpayable is a follow-up list, and it was previously invisible');
t('/admin has a partners view that uses the roster',
  /partner-roster/.test(admin) && /PartnersView/.test(admin));
t('/admin shows the nudge list, paid and pending separately',
  /awaitingPayoutAccount/.test(admin) && /totalPaid/.test(admin) && /totalPending/.test(admin));
t('the partners view loads lazily, not at login',
  /showPartners/.test(admin),
  'the roster makes a Stripe call per connected partner; the orders view must not pay for it');

// ============================================================================
// 7. RATE LIMITING ON THE UNAUTHENTICATED SIGNUP
// ============================================================================
const register = read('pages/api/register-referrer.js');
t('register-referrer actually calls enforceRateLimit',
  /await enforceRateLimit\(req, res, 'referrer'/.test(register),
  'importing it is not calling it — this route sends mail from our sending domain');

// The holdback is a promise about WHEN a partner is paid. Every surface that makes
// that promise must read the constant the settlement run enforces, or the first time
// the number is tuned the copy quietly becomes a lie.
t('/partners states the holdback and derives it',
  /holdbackDays/.test(partners) && /MIN_ORDER_AGE_DAYS/.test(read('pages/partners.js')),
  'orders from the last days of a month do not settle that run — the page must say so');
t('the dashboard states the holdback and derives it',
  /MIN_ORDER_AGE_DAYS/.test(dashboard));
t('the partner emails state the holdback and derive it',
  /MIN_ORDER_AGE_DAYS/.test(registerCode));
for (const [name, src] of [['/partners', partners], ['dashboard', dashboard], ['emails', registerCode]]) {
  t(`${name} does not hardcode the holdback number`,
    !/held for 7 days/i.test(src) && !/7-day hold/i.test(src),
    'derive it from MIN_ORDER_AGE_DAYS so tuning the constant updates the copy');
}

// ============================================================================
/**
 * ============================================================================
 * SETTLEMENT: NO SILENT WRITE, NO FAKE CLAIM, NO UNBOUNDED READ
 * ============================================================================
 * Three defects found on 11 Aug and fixed on 15 Aug, all in the one file that moves
 * money. Each is invisible in review because the code reads as though it already
 * does the thing.
 *
 * 1. supabase-js does NOT throw on a query error — it resolves with { error }. Two
 *    writes in the clawback block never destructured it, so the try/catch around
 *    them could not fire for a database failure and the comment inside it described
 *    something impossible. A failed clawback was recorded as a success.
 *
 * 2. .upsert(..., { onConflict: 'order_id' }) is ON CONFLICT DO UPDATE. It was
 *    described in four places as failing when a concurrent run claimed the order
 *    first. It does not fail; it overwrites. Only the 24-hour Stripe idempotency
 *    key actually prevented a second transfer.
 *
 * 3. Not one read had .range() or .limit(). PostgREST truncates at db-max-rows and
 *    returns 200. On referral_payouts — read as "every row ever paid" — a short read
 *    makes settled orders look unpaid, and every guard downstream reads the same
 *    short list, so they fail open together.
 */
{
  const src = read('pages/api/cron/settle-referrals.js');

  // 1. Every supabase call must capture `error`. A bare `await supabase...` is a
  //    write whose failure nothing can see.
  const calls = src.split('await supabase').length - 1;
  const captured = (src.match(/const \{[^}]*error[^}]*\}\s*=\s*await supabase/g) || []).length;
  t(`all ${calls} supabase calls in settle-referrals capture their error (found ${captured})`, calls > 0 && captured === calls);

  // 2. The claim must not be an upsert on the payout row. INSERT relies on the
  //    UNIQUE index, which is the only guard that cannot race.
  t('the payout claim uses .insert(), not an upsert that silently overwrites',
    /\.insert\(\{\s*\n?\s*order_id: order\.id/.test(src));
  t('a duplicate key on claim is treated as "another run has it", not an error',
    /claimError\.code === '23505'/.test(src));
  t('a retry re-claims only rows still pending or failed',
    /\.in\('status', \['pending', 'failed'\]\)/.test(src));

  // 5. ONE CLAWBACK WRITES TWO ROWS; ONLY ONE OF THEM IS AN ADJUSTMENT.
  //    A $20 recovery marks both the REVERSED order and the WITHHELD one
  //    `clawed_back`. Summing the status reported $40 and understated pending by
  //    $20. They are told apart by stripe_transfer_id: the reversed one was paid, so
  //    it has one; the withheld one never was.
  //
  //    The select assertion is the important one. Drop stripe_transfer_id from the
  //    query and every row reads undefined, `!undefined` is true, every row counts
  //    again — and the double-count returns with the filter still sitting there
  //    looking correct.
  {
    const stats = read('pages/api/partner-stats.js');
    const sheet = read('pages/api/referral-stats.js');
    t('the cron writes stripe_transfer_id: null on the withheld row, so the discriminator is guaranteed',
      /stripe_transfer_id: null,\n\s*failure_reason: `withheld to offset/.test(src));
    t('partner-stats SELECTS stripe_transfer_id — without it the filter silently matches everything',
      /\.select\('order_id, amount_cents, status, paid_at, stripe_transfer_id'\)/.test(stats));
    t('partner-stats counts only withheld rows as adjustments',
      /const withheldRows = clawedBackRows\.filter\(r => !r\.stripe_transfer_id\)/.test(stats));
    t('partner-stats deducts only the withheld amount from pending',
      /earnedCents - paidCents - withheldCents/.test(stats));
    t('the payout sheet counts only withheld rows too',
      /periodOrderIds\.has\(r\.order_id\) && !r\.stripe_transfer_id/.test(sheet));
    t('both kinds still count as settled, so neither is paid again',
      /settledOrderIds = new Set\(\[\.\.\.paidOrderIds, \.\.\.clawedBackRows\.map/.test(stats));
  }

  // 6. A DUPLICATED REFERRAL CODE MUST PAY NOBODY.
  //    settle() keyed partners with byCode[code] = partner — last writer wins — so
  //    two partners holding one code meant one collected everything and the other
  //    silently got nothing, decided by row order. A referral payout is a Stripe
  //    transfer into a real bank account; paying the wrong partner is not
  //    recoverable by a later run, so the safe answer is to pay neither and say so.
  //
  //    Driven through settle() rather than pattern-matched, because what matters is
  //    the money, not the shape of the code.
  {
    const dupPartners = [
      { id: 1, code: 'JSMITH', email: 'a@example.com', stripe_account_id: 'acct_a', active: true },
      { id: 2, code: 'jsmith', email: 'b@example.com', stripe_account_id: 'acct_b', active: true },
      { id: 3, code: 'MJONES', email: 'c@example.com', stripe_account_id: 'acct_c', active: true },
    ];
    const dupOrders = [
      { id: 'o1', ref_code: 'JSMITH', customer_email: 'buyer1@example.com', payment_status: 'paid', created_at: '2026-01-01T00:00:00Z' },
      { id: 'o2', ref_code: 'MJONES', customer_email: 'buyer2@example.com', payment_status: 'paid', created_at: '2026-01-01T00:00:00Z' },
    ];
    const r = settleFn({ orders: dupOrders, partners: dupPartners, settledOrderIds: new Set(), requirePayoutAccount: true, minAgeDays: 0 });
    const payableCodes = r.payable.map((g) => g.code);
    t('a duplicated code is not paid to either partner', !payableCodes.includes('JSMITH'));
    t('the duplicate is reported by name, not dropped in silence',
      r.excluded.some((e) => e.orderId === 'o1' && e.reason === 'duplicate_partner_code'));
    t('an unaffected code is still paid normally', payableCodes.includes('MJONES'));
    t('case and whitespace count as the same code, matching norm()',
      r.excluded.filter((e) => e.reason === 'duplicate_partner_code').length === 1);
  }

  // 7. The code is CLAIMED by inserting it. A read-then-insert is the same race the
  //    settlement claim had, and the database is the only thing that can settle it.
  {
    const reg = read('pages/api/register-referrer.js');
    t('register-referrer claims the code by inserting it', /const inserted = await supabase\n\.from\('referrals'\)\n\.insert\(\{\n\s*code: candidate,/.test(reg));
    t('a duplicate key retries with the next candidate rather than failing the signup',
      /inserted\.error\.code === '23505'/.test(reg));
    t('the migration that makes 23505 possible is in the repo',
      /CREATE UNIQUE INDEX referrals_code_unique_ci/.test(read('scripts/sql/referrals_code_unique.sql')));
    t('the index is case-insensitive, matching how settle() normalises a code',
      /upper\(btrim\(code\)\)/.test(read('scripts/sql/referrals_code_unique.sql')));
  }

  // 4. The clawback horizon must actually cover the chargeback window. This is
  //    DERIVED from the run rules rather than asserted as a number, so it stays
  //    true if the period logic changes. A run in month R covers
  //    [ (R-1 month start) - CATCHUP_DAYS , R start ).
  {
    const CATCH = Number((src.match(/const CATCHUP_DAYS = (\d+)/) || [])[1]);
    t('CATCHUP_DAYS is readable', Number.isFinite(CATCH) && CATCH > 0);
    let worst = Infinity;
    for (const [mo, d] of [[7, 1], [7, 15], [7, 31], [8, 1], [8, 30]]) {
      const created = new Date(Date.UTC(2026, mo, d));
      let last = null;
      for (let k = 0; k < 24; k++) {
        const runStart = new Date(Date.UTC(2026, mo + k, 1));
        const periodStart = new Date(Date.UTC(2026, mo + k - 1, 1));
        const catchupFrom = new Date(periodStart.getTime() - CATCH * 864e5);
        if (created >= catchupFrom && created < runStart) last = runStart;
      }
      if (last) worst = Math.min(worst, Math.round((last - created) / 864e5));
    }
    t(`a reversed order stays detectable for ${worst} days, covering the ~120-day chargeback window`, worst >= 120);
  }

  // 3. Reads are paged, with a stable sort — without .order() a page boundary can
  //    drop one row and repeat another.
  t('ledger reads are paged through fetchAllRows', /async function fetchAllRows/.test(src));
  t('fetchAllRows pages with .range()', /\.range\(from, from \+ PAGE_SIZE - 1\)/.test(src));
  t('paging throws rather than returning a partial ledger', /refusing to settle on a partial read/.test(src));
  const unpaged = (src.match(/\.from\('(orders|referrals|referral_payouts)'\)\s*\n?\s*\.select\(/g) || []).length;
  const inHelper = (src.match(/fetchAllRows\(/g) || []).length;
  t(`every table read goes through fetchAllRows (${inHelper} paged reads, ${unpaged} raw selects)`, unpaged <= inHelper);
}

console.log(`\nreferrals: ${pass} passed, ${failures.length} failed`);

if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('  ✓ partner program invariants hold\n');
