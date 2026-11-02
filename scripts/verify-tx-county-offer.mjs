/**
 * verify-tx-county-offer — what each Texas county and city page may promise (2 Nov 2026).
 *   lib/tx/countyOffer.js           reserve / data_late / address_pending / not_covered
 *   pages/counties/[slug].js         and pages/texas/[city].js read it
 *   lib/kit/countyOpen.js            the waitlist "open" email needs the roll and the tier too
 * Offline. Where a line says INJECTION, reintroducing that bug fails the assertion.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { txCountyOffer, loadedCadFor } = await import('../lib/tx/countyOffer.js');
const { kitCountyOpen } = await import('../lib/kit/countyOpen.js');
const { WAITLIST_BLOCKED_REASONS } = await import('../lib/waitlistReasons.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOV = new Date('2026-11-02T12:00:00Z');
const FEB = new Date('2027-02-10T12:00:00Z');

// ── 1. THE FOUR KINDS ───────────────────────────────────────────────────────
const harris = txCountyOffer('Harris', { now: NOV });
// INJECTION: drop canReserve from txCountyOffer -> Denton FAILS as reserve.
t('Harris: a reservation county, open from 31 January, kit timing stated', harris.kind === 'reserve' && harris.sells && !harris.reservationsOpen && harris.preOrderText === 'January 31, 2027' && /goes out once the district publishes/.test(harris.body) && /last year in April/.test(harris.body));
t('...and on 10 February reservations are open', txCountyOffer('Harris', { now: FEB }).reservationsOpen === true && /reserve your kit now/i.test(txCountyOffer('Harris', { now: FEB }).body));
t('Denton: we hold the roll, but its data came too late last year: no sale', txCountyOffer('Denton', { now: NOV }).kind === 'data_late' && !txCountyOffer('Denton', { now: NOV }).sells);
t('Wichita: roll held, address not confirmed: no sale', txCountyOffer('Wichita', { now: NOV }).kind === 'address_pending' && !txCountyOffer('Wichita', { now: NOV }).sells);
// INJECTION: treat every county as covered -> FAILS.
t('Bexar: no roll, no sale, says so', txCountyOffer('Bexar', { now: NOV }).kind === 'not_covered' && /don't serve Bexar County yet/.test(txCountyOffer('Bexar', { now: NOV }).heading) && loadedCadFor('Bexar') === null);
t('"County" suffix and case do not matter', txCountyOffer('harris county', { now: NOV }).kind === 'reserve' && loadedCadFor('Fort Bend') === 79);
t('every waitlist reason the pages write is one the database accepts', ['reserve', 'data_late', 'address_pending', 'not_covered'].length === 4
  && [harris, txCountyOffer('Denton'), txCountyOffer('Wichita'), txCountyOffer('Bexar')].every((o) => WAITLIST_BLOCKED_REASONS.includes(o.blockedReason)));
t('a data-late county waits for its data (tx_awaiting_data), the others for "open"', txCountyOffer('Denton').blockedReason === 'tx_awaiting_data' && txCountyOffer('Bexar').blockedReason === 'tx_county_not_open' && harris.blockedReason === 'tx_county_not_open');

// ── 2. THE WAITLIST EMAIL ───────────────────────────────────────────────────
const ok = () => ({ addressee: 'X', line1: '1 Main St', city: 'Houston', stateAbbr: 'TX', zip: '77002', confidence: 'confirmed', verifiedOn: '2026-10-22', cassValidated: true, sources: [] });
// INJECTION: remove the Texas branch in kitCountyOpen -> FAILS (Bexar waitlisters told "open" with no roll).
t('Bexar is never "open" for the waitlist email, even with a confirmed address', kitCountyOpen('TX', 'Bexar', { now: NOV, addressLookup: ok }).open === false);
t('Denton waits for its data, not this email', kitCountyOpen('TX', 'Denton', { now: NOV, addressLookup: ok }).reason === 'no_season_data');
t('Harris is open (the reminder goes out when reservations open)', kitCountyOpen('TX', 'Harris', { now: NOV }).open === true);

// ── 3. THE PAGES READ IT ────────────────────────────────────────────────────
const county = read('pages/counties/[slug].js');
const city = read('pages/texas/[city].js');
t('county pages: Texas offer computed at build, rebuilt every 12 hours', /txCountyOffer\(county\.name, \{ district: county\.district \}\)/.test(county) && /county\.code === "TX" \? \{ revalidate: 43200 \}/.test(county));
t('county pages: no Offer markup, no buy button and a notify signup where we cannot sell', /\.\.\.\(sells \? \{\s*offers:/.test(county) && /txWaiting \? \(/.test(county) && /<SeasonNotice stateCode="TX"/.test(county));
t('county pages: a reservation county states the date and links the free check', /txPreOrder \? \(\s*<Link href="\/check"/.test(county) && /tx\.heading/.test(county));
t('city pages read the same offer, for their county', /txOffer: txCountyOffer\(city\.county, \{ district: city\.district \}\)/.test(city) && /<SeasonNotice stateCode="TX" variant="dark" offer=\{tx\} \/>/.test(city));
t('SeasonNotice sends the county and the reason with the signup', /offer \? \{ county: offer\.county, blockedReason: offer\.blockedReason \}/.test(read('components/SeasonNotice.js')));
t('the roll section no longer says we "file for you"', !/would not file for you/.test(read('components/CountyRollFacts.js')));

console.log(`verify-tx-county-offer: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
