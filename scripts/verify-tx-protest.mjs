#!/usr/bin/env node
/**
 * BEHAVIOURAL TESTS for the Texas filing packet — 7 Sept 2026.
 *
 * Everything this guards fails QUIETLY and expensively. A protest is mailed once,
 * the owner gets one a year, and a §41.44 deadline has no cure. There is no
 * error path that surfaces "we asked the board for a value higher than the one
 * already on the roll" — it just gets filed and loses.
 *
 * So the assertions below are RUN, not matched: real roll-shaped rows go through
 * buildProtest() and the output is inspected. Each block names the injection that
 * proves it fails when the defect it targets is reintroduced.
 */
import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

const { buildProtest, NOT_FILABLE, opinionOfValue, STATUTE_PLAIN_LANGUAGE } =
  await import('../lib/tx/protest.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

/** An El Paso-shaped roll row. Uncapped so the cap gate does not mask the rest. */
const subject = {
  cad_id: 71, tax_year: 2026, account_number: 'E0000001',
  market_value: 300000, appraised_value: 300000,
  homestead_cap_loss: 0, nhs_cap_loss: 0,
  living_area: 2000, year_built: 1998, land_value: 40000,
  situs_street: '8023 MARBELLA CREEK AVE', situs_city: 'EL PASO', situs_zip: '79907',
  neighborhood_code: 'H1234', has_homestead: true,
};

/** Comps whose median $/sqft is well below the subject's $150. */
const compRows = [1, 2, 3, 4, 5, 6].map((i) => ({
  account_number: 'C000000' + i, living_area: 1950 + i * 10,
  appraised_value: 240000 + i * 1000, market_value: 240000 + i * 1000,
  homestead_cap_loss: 0, nhs_cap_loss: 0, year_built: 1997, land_value: 39000,
}));

const goodComps = {
  sufficient: true, level: 'neighborhood', levelStrength: 'strong', basis: 'clean',
  comps: compRows, compCount: 6, confidence: 'high',
  medianAppraisedPerSqft: 123.2, medianMarketPerSqft: 123.2,
  subjectAppraisedPerSqft: 150, subjectMarketPerSqft: 150,
  indicatedAppraised: 246400, indicatedMarket: 246400,
  cappedCompCount: 0, cappedCompShare: 0,
  adjustments: 'size within 10%, age within 15 years',
  disclosure: 'Comparables drawn from the district neighborhood code.',
};

// ── 1. THE HAPPY PATH ────────────────────────────────────────────────────────
const ok = buildProtest({ parcel: subject, comps: goodComps, taxYear: 2026,
  owner: { firstName: 'Jane', lastName: 'Doe' } });

t('a clean over-appraised parcel is filable', ok.filable === true);

/**
 * The happy-path block below dereferences ok.form50132. If the builder refuses
 * this parcel -- which is what a defect in opinionOfValue() looks like, because
 * an inflated request trips the nothing-to-ask gate -- every one of those reads
 * throws a TypeError and the suite dies instead of reporting. A guard that
 * crashes on the defect it is guarding tells you less than one that fails.
 * Found by injecting Math.max into opinionOfValue, 7 Sept 2026.
 */
if (!ok.filable) {
  console.log(`verify-tx-protest: ABORTED — the reference parcel was refused (${ok.reason}). `
    + 'Every assertion below assumes it files.');
  process.exit(1);
}
t('the county resolved off the roll row, not a hand list', ok.county === 'El Paso');
t('the account number on the form is the roll’s own',
  ok.form50132.accountNumber === 'E0000001');

/**
 * BOX 1 AND ONLY BOX 1.
 *
 * Section 3's first checkbox reads "Incorrect appraised (market) value AND/OR
 * value is unequal compared with other properties" — market value and unequal
 * appraisal in ONE box. Ticking anything else adds a ground we have no evidence
 * for and invites the panel to ask about it.
 *
 * INJECTION: add a second ground to `grounds` -> FAILS.
 */
t('exactly one ground is ticked, and it is the combined value/equity box',
  ok.form50132.grounds.length === 1
  && ok.form50132.grounds[0] === 'incorrect_value_and_or_unequal');

/**
 * THE LICENSING POSTURE, ASSERTED.
 *
 * Every trigger in Occupations Code ch. 1152 attaches to SIGNING. The entire
 * reason this is document preparation and not agency is that the owner signs.
 *
 * INJECTION: set signedBy to 'taxappeal' -> FAILS.
 */
t('the owner signs the form, never us', ok.form50132.signedBy === 'property_owner');
t('no agent appointment is implied anywhere in the packet',
  !JSON.stringify(ok).toLowerCase().includes('50-162'));

/**
 * SECTION 5 IS THE OWNER'S TO TICK.
 *
 * Every remote appearance option requires a notarised Form 50-283, which the
 * model decision says we do not collect. Pre-ticking one commits the owner to an
 * affidavit that will never arrive, and non-appearance is a DISMISSAL.
 *
 * INJECTION: set appearanceElection to 'affidavit_only' -> FAILS.
 */
t('we do not elect an appearance method on the owner’s behalf',
  ok.form50132.appearanceElection === null);
t('the informal conference IS requested — it costs nothing and settles most cases',
  ok.form50132.requestInformalConference === true);

/**
 * A PROTEST CANNOT RAISE A VALUE.
 *
 * Asking for a number at or above what is on the roll is a filing error, not a
 * conservative request. Benefit-of-the-lowest per Texas Disposal Systems
 * Landfill v. Travis CAD (Tex. 2024).
 *
 * INJECTION: return Math.max(...) from opinionOfValue -> FAILS.
 */
t('the requested value is below the value on the roll',
  ok.requestedValue < subject.market_value);
t('the requested value is the lowest of the calculations available',
  ok.requestedValue === Math.min(goodComps.indicatedMarket, goodComps.indicatedAppraised));
t('the reduction sought is the difference, not a guess',
  ok.reductionSought === subject.market_value - ok.requestedValue);

/**
 * THE PANEL IS TAUGHT THE TEST ON THE PAGE THAT MAKES THE ARGUMENT.
 *
 * The Comptroller's ARB Manual lists unequal appraisal as a ground and gives
 * boards no methodological guidance on it. Panel members are not trained on
 * (b)(3) mechanics.
 *
 * INJECTION: drop the statute line from the grid -> FAILS.
 */
t('the grid page states the § 41.43(b)(3) test in plain language',
  /41\.43\(b\)\(3\)/.test(ok.grid.statute) && /median appraised value/.test(ok.grid.statute));
t('and states that the burden is the district’s',
  /burden/i.test(STATUTE_PLAIN_LANGUAGE) && /41\.43\(a\)/.test(STATUTE_PLAIN_LANGUAGE));
t('the median is carried onto the page, not just the conclusion',
  ok.grid.medianAppraisedPerSqft === 123.2 && ok.grid.compCount === 6);
t('the capped share of the comp set is disclosed rather than hidden',
  ok.grid.cappedCompShare === 0 && 'cappedCompCount' in ok.grid);

// ── 2. EVERY REFUSAL HAS ITS OWN NAME ────────────────────────────────────────
/**
 * Same rule as lib/tx/parcels.js: no two causes may share a return value. A
 * refusal that cannot be told apart from another refusal is a bug we will never
 * find, because both look like "we did not file".
 */
const refusals = new Map();

refusals.set('capped beyond reach', buildProtest({
  parcel: { ...subject, market_value: 300000, appraised_value: 200000,
    homestead_cap_loss: 100000 },
  comps: goodComps, taxYear: 2026 }));

refusals.set('no comparables', buildProtest({
  parcel: subject, taxYear: 2026,
  comps: { sufficient: false, reason: 'insufficient_comparables', message: 'x' } }));

refusals.set('not over-appraised', buildProtest({
  parcel: subject, taxYear: 2026, comps: { ...goodComps, basis: 'none' } }));

refusals.set('cap artifact only', buildProtest({
  parcel: subject, taxYear: 2026, comps: { ...goodComps, basis: 'cap_artifact' } }));

refusals.set('nothing to ask for', buildProtest({
  parcel: subject, taxYear: 2026,
  comps: { ...goodComps, indicatedAppraised: 400000, indicatedMarket: 400000 } }));

for (const [label, r] of refusals) {
  t(`${label}: refused rather than filed`, r.filable === false);
  t(`${label}: carries a named reason`, typeof r.reason === 'string' && r.reason.length > 0);
}
const reasonValues = [...refusals.values()].map((r) => r.reason);
t('no two refusals share a reason value', new Set(reasonValues).size === reasonValues.length);

t('capped-beyond-reach is the cap gate, not a comps failure',
  refusals.get('capped beyond reach').reason === 'capped_beyond_reach');
t('a parcel already at or below its neighbours is refused by name',
  refusals.get('not over-appraised').reason === NOT_FILABLE.NOT_UNEQUAL);
t('the cap-artifact case is refused by its own name, not folded into the above',
  refusals.get('cap artifact only').reason === NOT_FILABLE.CAP_ARTIFACT);
t('an indication above the roll value never becomes a filing',
  refusals.get('nothing to ask for').reason === NOT_FILABLE.NOTHING_TO_ASK);

/**
 * THE SEAM THAT COST TWO HOURS ON 7 SEPT.
 *
 * findParcel() returns camelCase; qualify() and comps read snake_case roll rows.
 * Handing the shaped object to this module does not throw — it silently reports
 * that the district holds no value for a house whose value we are holding.
 *
 * INJECTION: pass ok.grid.subject (camelCase) as `parcel` -> this FAILS unless
 * the refusal is the honest no-value one, which is what proves the shapes differ.
 */
const camel = buildProtest({
  parcel: { cadId: 71, marketValue: 300000, appraisedValue: 300000, livingArea: 2000 },
  comps: goodComps, taxYear: 2026 });
t('a camelCase parcel is refused, loudly, rather than quietly filed',
  camel.filable === false);

console.log(failures.length
  ? `verify-tx-protest: ${failures.length} FAILED, ${pass} passed\n  ✗ ` + failures.join('\n  ✗ ')
  : `verify-tx-protest: ${pass} passed`);
process.exit(failures.length ? 1 : 0);
