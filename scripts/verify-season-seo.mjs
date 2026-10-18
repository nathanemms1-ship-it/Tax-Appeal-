/**
 * verify-season-seo — the public pages talk about the right filing season.
 * (18 Oct 2026, lib/season.js.)
 *
 * On 18 Oct 2026, with every state's season closed, 159 Georgia county pages
 * read "2026 Deadline: April 1" (April 1 was never Georgia's appeal deadline:
 * it is 45 days from each owner's notice), the Florida county, city and metro
 * pages printed 2026 dates, and the Tampa page gave Hillsborough the statewide
 * 18 Sept when the county's own date was 7 Sept.
 *
 *   1. the rule itself, at fixed dates (offline)
 *   2. the templates hold no typed season year or date (source)
 *   3. the built pages say what the rule says today (after next build)
 *
 * Usage: node scripts/verify-season-seo.mjs [--source-only]
 * Where a line says INJECTION, reintroducing that bug makes the assertion fail.
 */
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const { seasonYear, seasonDates, flSeasonDeadline, GA_DEADLINE } = await import('../lib/season.js');
const { FL_COUNTY_DATES_YEAR } = await import('../lib/filingWindows.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const D = (s) => new Date(`${s}T12:00:00Z`);
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// ── 1. THE RULE ─────────────────────────────────────────────────────────────
t('Georgia: this year through its last filing day (15 July)', seasonYear('GA', D('2026-07-15')) === 2026);
t('Georgia: next year from the day after', seasonYear('GA', D('2026-07-16')) === 2027 && seasonYear('GA', D('2026-10-18')) === 2027);
t('Florida: this year through 18 Sept, next year after', seasonYear('FL', D('2026-09-18')) === 2026 && seasonYear('FL', D('2026-09-19')) === 2027);
t('Florida: in spring the season is this year\'s', seasonYear('FL', D('2027-03-01')) === 2027);
t('Texas keeps its own derivation', seasonYear('TX', D('2026-10-18')) === 2027);
const fl = seasonDates('FL', D('2026-10-18'));
t("our own dates are printed for the season ahead: 24 Aug open, reservations 60 days before", fl.year === 2027 && fl.openISO === '2027-08-24' && fl.preOrderISO === '2027-06-25');
const inSeason = flSeasonDeadline('Hillsborough', D('2026-08-01'));
t("in the table's own year a county's real date is printed", inSeason.known === true && inSeason.iso === '2026-09-07' && /September 7, 2026/.test(inSeason.text));
const next = flSeasonDeadline('Hillsborough', D('2026-10-18'));
// INJECTION: drop the FL_COUNTY_DATES_YEAR check in flSeasonDeadline -> FAILS (a projected 2027 date printed as fact).
t('for any other year no projected date is printed as fact, only how it is set and last year\'s', next.known === false && next.iso === null && /2027 TRIM notice/.test(next.text) && /In 2026 it was September 7, 2026/.test(next.sentence) && !/2027-09|September \d+, 2027/.test(next.sentence));
t('an undated county gets the rule, no fallback date', flSeasonDeadline('Nowhere', D('2026-08-01')).known === false && FL_COUNTY_DATES_YEAR === 2026);
t('Georgia\'s deadline is the 45-day rule', /45 days from the date on your assessment notice/.test(GA_DEADLINE));

// ── 2. SOURCE ───────────────────────────────────────────────────────────────
const county = code(read('pages/counties/[slug].js'));
// INJECTION: put back `deadline: "April 1"` or `year: "2026"` -> FAILS.
t('the county template types no season year and never says April 1', !/year:\s*"20\d\d"/.test(county) && !/April 1/.test(county) && !/flPetitionDeadline\(county\.name, 20\d\d\)/.test(county));
t('...and reads Georgia, Florida, Arkansas and Alabama from the one rule', /seasonDates\('GA'\)/.test(county) && /flSeasonDeadline\(county\.name\)/.test(county) && /county\.code === 'GA' \? GA_DEADLINE/.test(county));
t('...and Georgia\'s FAQ no longer borrows Texas\'s "30 days after" rule', /county\.code === "GA"\s*\?\s*`In Georgia the deadline is 45 days/.test(county));
const FL_PAGES = ['pages/florida/[city].js', 'pages/florida.js', 'pages/orlando.js', 'pages/miami.js', 'pages/tampa.js', 'pages/jacksonville.js', 'pages/fort-lauderdale.js'];
for (const p of FL_PAGES) {
  const s = code(read(p));
  t(`${p}: no typed season year or reservation date`, !/Date\.UTC\(20\d\d/.test(s) && !/new Date\('20\d\d-\d\d-\d\d'\)/.test(s) && !/flPetitionDeadline\([^)]*20\d\d\)/.test(s));
}
const METRO = { orlando: 'Orange', miami: 'Miami-Dade', tampa: 'Hillsborough', jacksonville: 'Duval', 'fort-lauderdale': 'Broward' };
for (const [p, c] of Object.entries(METRO)) t(`/${p} quotes ${c} County's own deadline, never the statewide one`, read(`pages/${p}.js`).includes(`trimDeadline: flSeasonDeadline('${c}').text`));

// ── 3. BUILT PAGES ──────────────────────────────────────────────────────────
const out = (p) => new URL(`../.next/server/pages/${p}.html`, import.meta.url);
if (!process.argv.includes('--source-only') && existsSync(out('counties/cobb-county-ga'))) {
  const html = (p) => readFileSync(out(p), 'utf8');
  const ga = seasonYear('GA'); const fy = seasonYear('FL');
  const cobb = html('counties/cobb-county-ga');
  t(`a Georgia county page is about ${ga}, with the 45-day rule and no April 1`, cobb.includes(`${ga} Deadline: 45 days from the date on your assessment notice`) && !/April 1/.test(cobb) && cobb.includes(`Property Tax Appeal ${ga} | TaxAppeal USA`));
  const hills = html('counties/hillsborough-county-fl');
  const dl = flSeasonDeadline('Hillsborough');
  t(`a Florida county page is about ${fy}, with the season's own deadline wording`, hills.includes(`Property Tax Appeal ${fy} | TaxAppeal USA`) && hills.includes(dl.short) && (dl.known || !hills.includes(`${fy} Deadline: Sep`)));
  t('the Tampa page never gives Hillsborough the statewide 18 Sept', !/September 18/.test(html('tampa')));
  const city = html('florida/brandon-fl');
  t('a Florida city page carries the season\'s deadline sentence', city.includes(dl.sentence.replace(/'/g, '&#x27;')) || city.includes(dl.sentence));
} else {
  console.log('verify-season-seo: built pages not checked (no .next output, or --source-only)');
}

console.log(`verify-season-seo: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
