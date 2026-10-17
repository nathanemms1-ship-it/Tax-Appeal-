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

const { buildProtest, CAUTION_CODES, opinionOfValue, STATUTE_PLAIN_LANGUAGE } =
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
  // DELIBERATELY DIFFERENT. They were both 246400, which made the fixture
  // degenerate: subtracting the cure from the equity ground instead of the
  // market ground produced an identical answer, so the assertion that the grid
  // is untouched passed while the defect was live. A fixture whose two branches
  // agree cannot tell them apart.
  indicatedAppraised: 246400, indicatedMarket: 258000,
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
  comps: { sufficient: false, reason: 'no_comparables', comps: [],
    message: 'The appraisal district’s roll has no comparable properties we can match to '
      + 'this one — nothing shares its neighborhood grouping, size and age closely enough '
      + 'to compare. There is no unequal-appraisal exhibit to build from it.' } }));

refusals.set('not over-appraised', buildProtest({
  parcel: subject, taxYear: 2026, comps: { ...goodComps, basis: 'none' } }));

refusals.set('cap artifact only', buildProtest({
  parcel: subject, taxYear: 2026, comps: { ...goodComps, basis: 'cap_artifact' } }));

refusals.set('nothing to ask for', buildProtest({
  parcel: subject, taxYear: 2026,
  comps: { ...goodComps, indicatedAppraised: 400000, indicatedMarket: 400000 } }));

/**
 * REWRITTEN 7 Sept 2026. These five used to assert `filable === false`.
 *
 * Nothing refuses any more — § 41.44(d) makes a notice sufficient on owner,
 * property and dissatisfaction alone, so for any parcel we can identify a valid
 * protest can always be produced. Each of these five now has to come back as a
 * BUILDABLE packet carrying a named caution, and the cautions must still be
 * distinguishable from one another for the same reason the reasons were:
 * a warning that cannot be told apart from another warning is a bug nobody
 * will ever find.
 *
 * INJECTION: restore any `return { filable: false, ... }` in buildProtest -> FAILS.
 */
for (const [label, r] of refusals) {
  t(`${label}: still produces a filable packet`, r.filable === true);
  t(`${label}: carries at least one caution`,
    Array.isArray(r.cautions) && r.cautions.length > 0);
  t(`${label}: every caution is named and explained`,
    (r.cautions || []).every((c) => typeof c.code === 'string' && c.code
      && typeof c.message === 'string' && c.message.length > 20));
  t(`${label}: the form is complete enough to file`,
    !!r.form50132 && !!r.form50132.accountNumber && r.form50132.grounds.length > 0);
}
const codeSets = [...refusals.values()].map((r) => (r.cautions || []).map((c) => c.code).sort().join('+'));
t('no two of these cases produce the same set of cautions',
  new Set(codeSets).size === codeSets.length);



const codesOf = (label) => (refusals.get(label).cautions || []).map((c) => c.code);

t('capped-beyond-reach is the cap gate, not a comps failure',
  codesOf('capped beyond reach').includes('capped_beyond_reach'));
t('a parcel already at or below its neighbors is cautioned by name',
  codesOf('not over-appraised').includes(CAUTION_CODES.NOT_UNEQUAL));
t('the cap-artifact case keeps its own name, not folded into the above',
  codesOf('cap artifact only').includes(CAUTION_CODES.CAP_ARTIFACT));

/**
 * AN INDICATION AT OR ABOVE THE ROLL VALUE NEVER BECOMES A NUMBER ON THE FORM.
 *
 * This is the one thing that survives the no-refusals rule as a hard product
 * behaviour, because printing it would ask the board to KEEP or RAISE the value.
 * The packet is still built and still filable — § 41.44(d) needs no opinion of
 * value — but Section 4 is blank and the owner is told why.
 *
 * INJECTION: `const askable = opinion;` in buildProtest -> FAILS.
 */
{
  const r = refusals.get('nothing to ask for');
  t('an indication above the roll value is cautioned by name',
    codesOf('nothing to ask for').includes(CAUTION_CODES.NOTHING_TO_ASK));
  t('and never reaches Section 4 as a number',
    r.form50132.opinionOfValue === null && r.requestedValue === null);
  t('while the packet itself is still filable',
    r.filable === true && r.form50132.grounds.length > 0);
}

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
/**
 * This used to be caught by the no-value REFUSAL. Refusals are gone, so without
 * an explicit check it would now be a SALE: a blank protest built for a house
 * whose value we are holding in memory. It throws instead — it is our bug, not
 * a finding a customer can weigh.
 *
 * INJECTION: delete the ROLL_KEYS check in buildProtest -> FAILS.
 */
let camelThrew = null;
try {
  buildProtest({
    parcel: { cadId: 71, marketValue: 300000, appraisedValue: 300000, livingArea: 2000 },
    comps: goodComps, taxYear: 2026 });
} catch (err) { camelThrew = err.message; }
t('a camelCase parcel throws rather than quietly becoming a blank filing',
  typeof camelThrew === 'string');
t('and the error names the fix', /\.row/.test(camelThrew || ''));

// ── 3. WHAT THE PACKET CARRIES ───────────────────────────────────────────────
/**
 * 17 Oct 2026: lib/tx/protestHtml.js — the HTML look-alike of Form 50-132 — was
 * deleted (the Texas kit fills the comptroller's own PDF, lib/tx/fill50132.js,
 * asserted in verify-tx-form.mjs and verify-tx-kit.mjs). About 110 assertions
 * here read that HTML: Section 5's hearing copy, the grid page, Exhibit C, the
 * Form 50-283 wording. They went with it.
 *
 * What stays is what buildProtest PUTS ON THE PACKET, because that is what the
 * kit is printed from. Each block below is a packet-level re-point of a render
 * assertion that used to sit here; the render half is gone.
 */

/**
 * NO COMPARABLES MEANS NO EVIDENCE PAGE — hasGrid is what says so.
 *
 * INJECTION: hardcode hasGrid: true in buildProtest -> FAILS.
 */
t('a packet with no comparables says hasGrid false',
  refusals.get('no comparables').hasGrid === false);
t('a packet with comparables says hasGrid true', ok.hasGrid === true);

/**
 * A CAUTION IS FOR THE OWNER, NEVER FOR THE BOARD.
 *
 * Re-pointed from "no caution text reaches the filed document": the filed
 * document is printed from form50132, the grid and the condition exhibit, so no
 * caution message may be carried inside any of them.
 *
 * INJECTION: copy cautions into form50132 (or a caution message into the grid
 * disclosure) in buildProtest -> FAILS.
 */
for (const [label, r] of [...refusals, ['happy path', ok]]) {
  const filed = JSON.stringify({ f: r.form50132, g: r.grid, c: r.conditionExhibit });
  t(`${label}: no caution text is carried on what gets filed`,
    (r.cautions || []).every((c) => !filed.includes(c.message)));
}

/**
 * THE PER-DISTRICT FACT IS CARRIED ONLY WHERE WE HOLD IT.
 *
 * El Paso's informal is conducted entirely by email; Harris runs iSettle, Tarrant
 * an automated valuation tool. Carrying El Paso's note for them would tell
 * someone to expect an email that never comes.
 *
 * INJECTION: change INFORMAL_CHANNEL[cadId] to a default string -> FAILS.
 */
t('El Paso’s email-only informal is carried on an El Paso packet',
  /email/i.test(ok.form50132.informalChannel || ''));
{
  const other = buildProtest({ parcel: { ...subject, cad_id: 999 },
    comps: goodComps, taxYear: 2026, owner: { firstName: 'A', lastName: 'B' } });
  t('a district we hold no informal-practice note for carries none',
    other.filable === true && other.form50132.informalChannel === null);
}

// ── 4. CONDITION, AND THE ADAPTER THAT NEARLY WASN'T ─────────────────────────
/**
 * lib/costToCure.js reads FLORIDA roll columns. Handed a Texas row it does not
 * throw: Number(undefined || 0) is 0, so both multipliers fall back to 1.00 and
 * every defect prices as if the house were the 2,000 sqft reference home.
 *
 * The adapter's FIRST version had this bug too, in a file written to prevent it
 * — it matched finishMultiplier's camelCase PARAMETER ({ jv, lndVal,
 * totLvgArea }) when curePriceFor actually reads a snake_case ROLL ROW
 * (parcel.jv, parcel.lnd_val, parcel.tot_lvg_area). Same silent 1.00.
 *
 * This is the guard, and it is behavioural: two houses of very different size
 * and finish must not price the same defect identically.
 *
 * INJECTION: rename lnd_val/tot_lvg_area back to lndVal/totLvgArea in
 * toCureShape -> FAILS.
 */
const cure = await import('../lib/tx/costToCure.js');
const flCure = await import('../lib/costToCure.js');
{
  const label = Object.keys(flCure.COST_TO_CURE)
    .find((k) => flCure.COST_TO_CURE[k].curable !== false
      && flCure.COST_TO_CURE[k].scale !== undefined);
  const big = cure.toCureShape({ market_value: 1400000, land_value: 180000, living_area: 4300 });
  const small = cure.toCureShape({ market_value: 150000, land_value: 30000, living_area: 1150 });
  const pBig = flCure.curePriceFor(label, big);
  const pSmall = flCure.curePriceFor(label, small);

  t('the adapter hands cost-to-cure the field names it actually reads',
    'lnd_val' in big && 'tot_lvg_area' in big && 'jv' in big);
  t('a defect prices differently on a large expensive house than a small cheap one',
    pBig && pSmall && pBig.asked > pSmall.asked);
  t('...and neither falls back to the un-adjusted reference-home multipliers',
    pBig.sizeMultiplier !== 1 && pBig.finishMultiplier !== 1);
}

/**
 * ADDING CONDITION MUST NOT CHANGE A PACKET THAT HAS NONE.
 *
 * This lands in a pipeline that already carries orders. Empty issues has to be
 * byte-identical to the behaviour before the feature existed.
 *
 * INJECTION: default `issues` to a non-empty array -> FAILS.
 */
t('no issues reported means no condition exhibit at all', ok.conditionExhibit === null);
t('and the requested value is unchanged by the feature existing',
  ok.requestedValue === Math.min(goodComps.indicatedMarket, goodComps.indicatedAppraised));

/**
 * THE CURE DOES NOT MOVE THE ASK AT ALL. IT IS EVIDENCE, NOT ARITHMETIC.
 *
 * Changed 7 Sept 2026 on Nathan's call. `indicatedMarket - cureDollars` asserted
 * that a repair's cost equals the value it destroys. It does not: a buyer may
 * deduct more (deferred-maintenance stigma) or considerably less. That
 * equivalence is a valuation judgment, and Occupations Code § 1103.003 defines
 * an appraisal as "an opinion of value; or the act or process of developing an
 * opinion of value" — which is precisely the heading over Section 4.
 *
 * The prose never claimed it. The subtraction did, and the subtraction was the
 * signed number. So the defects stay in the packet as support for the value we
 * ask; they generate none of it.
 *
 * INJECTION: restore `- n(cureDollars)` on either ground in opinionOfValue -> FAILS.
 */
const issueLabels = Object.keys(flCure.COST_TO_CURE)
  .filter((k) => flCure.COST_TO_CURE[k].curable !== false).slice(0, 2);
const withIssues = buildProtest({ parcel: subject, comps: goodComps, taxYear: 2026,
  issues: issueLabels, owner: { firstName: 'Jane', lastName: 'Doe' } });

t('a packet with reported defects is still filable', withIssues.filable === true);
t('the equity grid is untouched by the condition case',
  withIssues.grid.indicatedAppraised === goodComps.indicatedAppraised);
t('the condition exhibit exists and carries a total',
  withIssues.conditionExhibit && withIssues.conditionExhibit.cureDollars > 0);
t('reported defects do not move the ask by one dollar',
  withIssues.requestedValue === ok.requestedValue);
t('the ask is the lower of the two grounds, neither of them cure-adjusted',
  withIssues.requestedValue === Math.min(
    goodComps.indicatedAppraised, goodComps.indicatedMarket));
t('and the cure is large enough that a subtraction would have shown',
  withIssues.conditionExhibit.cureDollars > 1000);

/**
 * opinionOfValue TAKES NO CURE ARGUMENT ANY MORE.
 *
 * A stray third argument at a call site must not silently start moving values
 * again, so pass one and prove it is ignored.
 *
 * INJECTION: re-add a cureDollars parameter and subtract it -> FAILS.
 */
// The first version passed 5000 and PASSED under injection: the fixture's
// grounds are 246,400 and 258,000, so a 5,000 cure never beats the equity
// ground and both calls return 246,400 whether or not it is subtracted. The
// probe has to be bigger than the 11,600 gap between the two grounds or it
// tests nothing. Fourth blind guard of the day, same shape as the others.
{
  const gap = goodComps.indicatedMarket - goodComps.indicatedAppraised;
  t('the probe cure is large enough that a subtraction would change the answer',
    gap > 0 && gap < 100000);
  t('opinionOfValue ignores anything passed where cureDollars used to go',
    opinionOfValue(subject, goodComps, 100000) === opinionOfValue(subject, goodComps)
    && opinionOfValue(subject, goodComps) === Math.min(
      goodComps.indicatedAppraised, goodComps.indicatedMarket));
}

/**
 * EVERY PRICED LINE CARRIES ITS PROVENANCE.
 *
 * lib/costToCure.js's own rule: "EVERY DOLLAR FIGURE CARRIES A SOURCE." It is
 * the owner who has to defend the number in the room.
 */
t('every priced defect names a published source',
  withIssues.conditionExhibit.priced.every((x) => x.source && x.sourceYear));

/**
 * THE FLOOR IS THE DISTRICT'S OWN LAND VALUE.
 *
 * Less load-bearing since the cure stopped driving the ask down, but a comp set
 * indicating below the bare lot would still discredit the packet.
 *
 * INJECTION: drop the Math.max floor from opinionOfValue -> FAILS.
 */
{
  const cheap = { ...goodComps, indicatedAppraised: 1, indicatedMarket: 1 };
  const floored = opinionOfValue(subject, cheap);
  t('an indication below the district’s own land value is floored at it',
    floored === subject.land_value && floored > 0);
}

/**
 * THE DOUBLE-COUNT NOTE IS PRINTED ONLY WHERE THE CLAIM CAN BE MADE.
 *
 * BELOW_AVERAGE_CONDITION is unpopulated until the condition_code distribution
 * is queried per district. Until then an unrecognised code returns 'unknown',
 * and an unknown prints NOTHING — we do not warn a homeowner about an inference
 * we could not draw. Inventing a code vocabulary would be the guessed-URL error
 * from scripts/tx/sources.json in another file.
 *
 * INJECTION: return BELOW_AVERAGE for unknown codes -> FAILS.
 */
t('an unrecognised condition code is reported as unknown, not guessed',
  cure.conditionDiscountRisk({ cad_id: 71, condition_code: 'AV' })
    === cure.CONDITION_RISK.UNKNOWN);
t('a parcel the district publishes no condition for cannot have been discounted for one',
  cure.conditionDiscountRisk({ cad_id: 71, condition_code: null })
    === cure.CONDITION_RISK.NOT_BELOW_AVERAGE);
t('and no double-count note is printed while the risk is unknown',
  withIssues.conditionExhibit.doubleCountDisclosure === null);

/**
 * ============================================================================
 * FIXED, AND THE ASSERTION FLIPPED AS IT WAS WRITTEN TO. 7 Sept 2026.
 * ============================================================================
 * This block used to assert `regionMismatch === true` — that the Florida-region
 * cost basis was still DETECTED — with a note saying it would fail the day the
 * bases were re-derived, and that whoever did the work should flip it.
 *
 * That is exactly what happened: entering the West South Central figures turned
 * regionMismatch false and this test went red on a correct change. The
 * mechanism did its job — a known defect that no test mentions is a defect that
 * ships, and this one could not be forgotten because the build would not go
 * green while it was open.
 *
 * It now asserts the real property, in both directions.
 *
 * INJECTION: point txCostToCure back at the default region -> FAILS.
 */
t('a Texas packet no longer carries a Florida-region cost basis',
  withIssues.conditionExhibit.regionMismatch === false);
t('every priced line cites West South Central, the region the figures came from',
  withIssues.conditionExhibit.priced
    .filter((x) => !x.ownerSupplied && /cost-vs-value/.test(x.sourceUrl || ''))
    .every((x) => /west-south-central/.test(x.sourceUrl)));
t('...and the printed label agrees with the URL it was taken from',
  withIssues.conditionExhibit.priced
    .filter((x) => /west-south-central/.test(x.sourceUrl || ''))
    .every((x) => /West South Central/.test(x.source)));

/**
 * Florida must be untouched. The region is an opt-in argument, so every FL
 * caller passes nothing and gets South Atlantic exactly as before.
 */
{
  const flc = await import('../lib/costToCure.js');
  const shape = { jv: 312500, lnd_val: 42000, tot_lvg_area: 2040 };
  const roof = 'Roof damage or age (leaks, missing shingles, sagging)';
  const fl = flc.curePriceFor(roof, shape);
  const wsc = flc.curePriceFor(roof, shape, { region: 'west-south-central' });
  t('Florida still prices from South Atlantic by default',
    /South Atlantic/.test(fl.source) && fl.asked > wsc.asked);
  t('the two regions genuinely differ — this is not a relabel',
    fl.asked !== wsc.asked);
}
t('an owner-supplied contractor figure is never counted as a region mismatch',
  cure.sourceRegionMismatch([{ ownerSupplied: true, sourceUrl:
    'https://www.jlconline.com/cost-vs-value/2025/south-atlantic/' }]) === false);
t('a West South Central citation would clear the flag',
  cure.sourceRegionMismatch([{ sourceUrl:
    'https://www.jlconline.com/cost-vs-value/2025/west-south-central/' }]) === false);

/**
 * THE FILED ADDRESS CARRIES THE STATE.
 *
 * A county roll has no state column because it does not need one; a document
 * filed with an appraisal district does. Section 2 printed "EL PASO, 79907"
 * until it was read on the page. (The render half of this check went with
 * protestHtml.js; fill50132 prints form50132.propertyAddress as-is.)
 *
 * INJECTION: drop 'TX' from propertyAddress in protest.js -> FAILS.
 */
t('the property address on the form carries the state',
  /,\s*TX\s+\d{5}/.test(ok.form50132.propertyAddress));

/**
 * THE NARRATIVE FIELDS ARE ARRAYS. comps.js returns describeAdjustments() and
 * disclosureFor() as string[]; the render checks that consumed them (comma
 * jamming, the "Before you sign" block) went with protestHtml.js. The producers'
 * shape is still asserted, because every consumer depends on it.
 */
{
  const { describeAdjustments, disclosureFor, STRATA, COUNTY_TIER } =
    await import('../lib/tx/comps.js');
  const nb = STRATA.find((x) => x.level === 'neighborhood');
  const adj = describeAdjustments(nb, { size: 0.1, age: 15, land: 0.1 }, 6);
  t('describeAdjustments returns a list, not a sentence', Array.isArray(adj) && adj.length > 1);
  const weak = disclosureFor(COUNTY_TIER, { size: 0.25, age: 40, land: 0.25 },
    { basis: 'clean', cappedCompShare: 0 }, 5);
  t('a last-resort comp tier produces an owner warning', Array.isArray(weak) && weak.length > 0);
}

/**
 * SECTION 4 IS NOT MOVED BY THE CURE. (Its render half — which exhibit Section 4
 * cites — went with protestHtml.js.)
 */
t('the Section 4 number is not moved by the cure',
  withIssues.conditionExhibit.cureDollars > 0
  && withIssues.form50132.opinionOfValue === ok.form50132.opinionOfValue);

/**
 * NOTHING THE PACKET CARRIES NAMES THE BUSINESS.
 *
 * Nathan's call, 7 Sept 2026: the owner protests pro se, so what the district
 * receives carries no business name and no business contact. Re-pointed from
 * the rendered HTML to the packet fields the kit prints from. (Cost-guide
 * source URLs in the condition exhibit are citations, not contact details, so
 * the probe is names and email addresses.)
 *
 * INJECTION: put "TaxAppeal" or a contact email into any form50132 field -> FAILS.
 */
{
  const BIZ = /taxappeal|tax appeal usa|@[a-z0-9.-]+\.(com|net|org)/gi;
  for (const [label, p] of [['plain packet', ok], ['packet with an exhibit', withIssues]]) {
    const filed = JSON.stringify({ f: { ...p.form50132, ownerEmail: '' }, g: p.grid, c: p.conditionExhibit });
    const hits = filed.match(BIZ);
    t(`the ${label} names no business and carries no contact`, !hits, hits && [...new Set(hits)].join(', '));
  }
  t('and that check would catch one if it were there',
    /taxappeal|@[a-z0-9.-]+\.(com|net|org)/i.test(JSON.stringify({ x: 'Prepared by TaxAppeal USA — customerservice@taxappealusa.com.' })));
}

/**
 * This is a Texas filing. British spellings in owner- and board-facing copy
 * read as boilerplate lifted from somewhere else.
 *
 * INJECTION: restore "neighbourhood" in describeAdjustments -> FAILS.
 */
{
  const { describeAdjustments, disclosureFor, STRATA, COUNTY_TIER } =
    await import('../lib/tx/comps.js');
  const facing = [
    JSON.stringify({ f: ok.form50132, g: ok.grid, c: withIssues.conditionExhibit }),
    ...STRATA.flatMap((x) => describeAdjustments(x, { size: 0.1, age: 15, land: 0.1 }, 6)),
    ...describeAdjustments(COUNTY_TIER, { size: 0.2, age: 40, land: 0.25 }, 5),
    ...disclosureFor(COUNTY_TIER, { size: 0.25, age: 40, land: 0.25 },
      { basis: 'cap_artifact', cappedCompShare: 0.8 }, 5),
  ].join('\n');
  const british = facing.match(
    /neighbourhood|authorised|notarised|recognise|organisation|licence|centre\b/gi);
  t('owner-facing copy uses American spelling', !british, british && british.join(', '));
}

/**
 * TWO FILES DECIDE WHAT "BELOW AVERAGE" MEANS, AND THEY MUST NOT DRIFT.
 *
 * scripts/tx/load-dcad.mjs decides which CDU ratings reach condition_code.
 * lib/tx/costToCure.js decides which of those mean the district has already
 * discounted for condition. If the loader stops writing FAIR, the disclosure
 * silently stops firing for 22,903 Dallas parcels and nothing reports it.
 *
 * Dallas is the FIRST district to publish condition at all, so this pairing has
 * never existed before and has no history of being checked.
 *
 * INJECTION: drop a rating from either list -> FAILS.
 */
{
  const { readFileSync } = await import('node:fs');
  const { BELOW_AVERAGE_CONDITION } = await import('../lib/tx/costToCure.js');
  const loader = readFileSync(new URL('../scripts/tx/load-dcad.mjs', import.meta.url), 'utf8');

  const inLoader = new Set(
    (/const BELOW_AVERAGE = new Set\(\[([^\]]*)\]\)/.exec(loader)?.[1] || '')
      .split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean)
  );
  const inMeaning = BELOW_AVERAGE_CONDITION[57] || new Set();

  t('the Dallas loader recognises some below-average ratings', inLoader.size > 0);
  t('and costToCure knows what they mean', inMeaning.size > 0);
  t('and the two lists are identical',
    inLoader.size === inMeaning.size && [...inLoader].every((r) => inMeaning.has(r)),
    `loader=[${[...inLoader].join('|')}] meaning=[${[...inMeaning].join('|')}]`);

  // The two ratings that are NOT condition findings must be in neither list.
  for (const notACondition of ['UNASSIGNED', 'MANUALLY ENTER DEPRECIATION']) {
    t(`"${notACondition}" is not treated as below average`,
      !inLoader.has(notACondition) && !inMeaning.has(notACondition));
  }

  // Districts whose export carries no condition field at all must stay absent —
  // an empty Set here would read as "we checked and found none".
  for (const cad of [71, 220]) {
    t(`cad ${cad} has no condition vocabulary, because its export has no field`,
      !(cad in BELOW_AVERAGE_CONDITION));
  }
}

// =============================================================================
// ROLL_YEAR IS THE YEAR WE ACTUALLY HOLD, AND ONLY ONE FILE MAY SAY SO
// =============================================================================
//
// 17 Sept 2026. `lib/tx/parcels.js` exports `export const ROLL_YEAR = 2026` as a
// bare literal, and `lib/tx/comps.js` repeats it as a default parameter
// (`findComps(subject, { rollYear = 2026 })`). Neither has an env override —
// Florida has DOR_ROLL_YEAR with a validating resolver — and nothing anywhere
// compares either number to reality.
//
// The failure has a date on it. On 1 April 2027 the funnel looks up the parcel at
// tax_year = 2026, pulls 2026 comps, prints "2026" in the form's Tax Year box,
// and REPORTS SUCCESS. Nothing throws. Nothing warns. The first signal is a
// district refusing a protest of a year whose deadline passed.
//
// The honest invariant is not "ROLL_YEAR must equal the current tax year" — under
// the file-first model it is DELIBERATELY the prior year, because the certified
// roll for year N publishes on 25 July, ten weeks after year N's protest
// deadline. The invariant is that ROLL_YEAR must equal the roll that is actually
// in the database, and lib/tx/countyStats.json records exactly that, generated by
// scripts/tx/county-stats.mjs from a live query against tx_parcels.
//
// PROVE IT: change ROLL_YEAR to 2027 without loading a 2027 roll.
//   expect: "ROLL_YEAR (2027) is not the year loaded in tx_parcels (2026)"
{
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(p, 'utf8');
  /**
   * STRIP COMMENTS BEFORE SCANNING, because the first version of this block did
   * not and failed on its own documentation: lib/tx/rollYear.js explains itself
   * by QUOTING `export const ROLL_YEAR = 2026`, so the file appeared to declare
   * it twice.
   *
   * Exactly the trap recorded on 7 Sept, when verify-tx-seo's district-name scan
   * failed against the word "Travis" inside a header comment explaining why the
   * evidence page is laid out as it is. A guard that fires on its own rationale
   * trains people to ignore it.
   */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const rollYearSrc = stripComments(read('lib/tx/rollYear.js'));
  const parcelsSrc = stripComments(read('lib/tx/parcels.js'));
  const compsSrc = stripComments(read('lib/tx/comps.js'));
  const stats = JSON.parse(read('lib/tx/countyStats.json'));

  const declared = [...rollYearSrc.matchAll(/export const ROLL_YEAR\s*=\s*(\d{4})/g)].map((m) => Number(m[1]));
  t('lib/tx/rollYear.js declares ROLL_YEAR exactly once', declared.length === 1);
  t('lib/tx/parcels.js re-exports it rather than declaring a second copy',
    !/export const ROLL_YEAR\s*=\s*\d{4}/.test(parcelsSrc));

  const years = [...new Set(Object.values(stats.counties || {}).map((c) => Number(c.taxYear)))];
  t('every loaded district holds the same tax year', years.length === 1);

  const loaded = years[0];
  t(`ROLL_YEAR (${declared[0]}) is the year loaded in tx_parcels (${loaded})`, declared[0] === loaded);

  // A second literal is the countyStats twin failure in another costume: fix one,
  // and any caller that omits rollYear silently keeps the other.
  /**
   * 20 Sept 2026 — this was a WARN until the roll year got its own module.
   *
   * comps.js used to carry `rollYear = 2026` as a default parameter, a second
   * literal nothing compared to the first. Softening it was right at the time:
   * the obvious fix, importing ROLL_YEAR from parcels.js, would have dragged
   * pages/api/supabase into a file that comps-validate.mjs, sellable.mjs and
   * condition-codes.mjs all run against stub fetch functions with no database.
   *
   * Nathan's call: lib/tx/rollYear.js, imported by both. So the assertion is
   * hard again, and the second one below guards the REASON — a future import
   * from './parcels' would satisfy "no literal" and quietly break three scripts.
   *
   * PROVE IT: change the default in comps.js back to a literal year.
   *   expect: "lib/tx/comps.js carries no literal roll year"
   */
  t('lib/tx/comps.js carries no literal roll year — it defaults from ROLL_YEAR',
    [...compsSrc.matchAll(/rollYear\s*=\s*\d{4}/g)].length === 0);

  t('and comps.js takes it from ./rollYear, not ./parcels — which would pull Supabase '
    + 'into three scripts that run without a database',
    /from '\.\/rollYear'/.test(compsSrc) && !/from '\.\/parcels'/.test(compsSrc));

  t('lib/tx/rollYear.js imports nothing, so comps.js stays runnable with no database',
    !/^\s*import\s/m.test(read('lib/tx/rollYear.js')));
}

/**
 * ============================================================================
 * A CAUTION WITH NO MESSAGE IS WORSE THAN NO CAUTION
 * ============================================================================
 * Added 3 Oct 2026, from a screenshot. The review screen for 1707 Bunker Hill
 * Ln -- the one with the payment button -- rendered, in full, under the
 * heading "One thing to know":
 *
 *     few_comparables  ·  confidence: low
 *
 * buildProtest does `caution(comps.reason || NO_COMPS, comps.message)`, and
 * findComps' short-set branch in lib/tx/comps.js never set `message`. So the
 * <p> rendered empty and the debug <code> line beneath it WAS the warning.
 *
 * THE ASSERTION FOR THIS ALREADY EXISTED -- "every caution is named and
 * explained", message.length > 20, about sixty lines above. It never fired
 * because it only walks the `refusals` fixtures, and not one of them was a
 * short comp set. The guard was right and its coverage was not, which is the
 * quieter cousin of an assertion that cannot fail.
 *
 * So: every branch of findComps that can raise a caution gets one here.
 *
 * INJECTION: delete `message` from the few_comparables return -> FAILS.
 */
{
  const shortSet = buildProtest({
    parcel: subject, taxYear: 2026,
    comps: { ...goodComps, sufficient: false, reason: 'few_comparables',
             confidence: 'low', compCount: 2, comps: compRows.slice(0, 2),
             message: 'We found only 2 comparable properties close enough to this house to use, '
               + 'fewer than we would like. The median they produce is still your county\'s own '
               + 'data and the protest is still valid, but a short set is easier for the board '
               + 'to set aside than a long one.' },
  });
  t('short comp set still builds a filable packet', shortSet.filable === true);
  t('short comp set raises the few_comparables caution',
    (shortSet.cautions || []).some((c) => c.code === 'few_comparables'));
  t('and that caution is explained in words, not a code',
    (shortSet.cautions || []).every((c) => typeof c.message === 'string' && c.message.length > 20));

  /*
    The real source, not the fixture. SCOPED TO THE OBJECT LITERAL, because
    the first version of this check read 1,800 characters forward from
    `reason: 'few_comparables'` and found a `message:` belonging to the NEXT
    return. Deleting the one that matters left it green -- caught by
    injection, not by reading it.
  */
  const { readFileSync } = await import('node:fs');
  const compsSrc = readFileSync(new URL('../lib/tx/comps.js', import.meta.url), 'utf8');
  const from = compsSrc.indexOf("reason: 'few_comparables'");
  const to = compsSrc.indexOf('level: best.stratum.level', from);
  t('lib/tx/comps.js sets a message on the few_comparables branch itself',
    from > -1 && to > from && /message:\s*[`'"]/.test(compsSrc.slice(from, to)));

  // And the screen does not print the internal code at a customer.
  const applySrc = readFileSync(new URL('../pages/apply.js', import.meta.url), 'utf8');
  t('the review screen does not render the raw caution code',
    !/<code[^>]*>\s*\{c\.code\}/.test(applySrc));
}

/**
 * ============================================================================
 * THE QUOTED SAVING IS MEASURED ON THE VALUE THE BILL IS COMPUTED ON
 * ============================================================================
 * Added 3 Oct 2026. Nathan screenshotted the review screen for 1707 Bunker
 * Hill Ln, which said, four lines apart:
 *
 *     Your bill only changes below ............ $459,600
 *     If 2027 rates match 2026, that's about ... $924 / year
 *
 * $924 is (market 469,000 - ask 426,984) x 0.022. But § 23.23 caps the
 * APPRAISED value at 459,600 and that is what a bill is computed on, so the
 * first $9,400 of the reduction comes off a number nobody is taxed on. The
 * real figure is $718. We were overstating by the cap differential -- 29% --
 * on the screen with the payment button, while printing the correct rule
 * immediately above it.
 *
 * NOTHING CAUGHT IT, and when the fix was first guarded, reverting it still
 * passed: every fixture in this file had market == appraised, so askGap and
 * billingGap were the same number. A fixture whose two branches agree cannot
 * tell them apart -- the same note already written above goodComps, about
 * indicatedAppraised and indicatedMarket, for the same reason.
 *
 * So this fixture is DELIBERATELY CAPPED, and the two bases are asserted to
 * disagree before either is checked.
 *
 * INJECTION: estimatedSaving back to askGap -> FAILS.
 */
{
  const RATE = 0.022;
  const capped = { ...subject, market_value: 469000, appraised_value: 459600 };
  const r = buildProtest({ parcel: capped, comps: goodComps, taxYear: 2026 });

  const ask = r.requestedValue;
  const onMarket = Math.round((469000 - ask) * RATE);
  const onBilling = Math.round((459600 - ask) * RATE);

  // If these agree the fixture is degenerate and everything below is theatre.
  t(`the capped fixture distinguishes the two bases (${onMarket} vs ${onBilling})`,
    ask > 0 && ask < 459600 && onMarket !== onBilling);
  t(`estimatedSaving is measured on the capped value, not market (got ${r.estimatedSaving}, billing ${onBilling}, market ${onMarket})`,
    r.estimatedSaving === onBilling);
  t('reductionSought stays on market value — it is the Section 4 figure',
    r.reductionSought === 469000 - ask);
  t('the packet reports the value the bill is computed on',
    r.billingValueBefore === 459600);

  /*
    And the "not worth the fee" caution is dropped on the SAME basis. If it is
    dropped on askGap, a capped house whose real benefit is under $89 gets the
    warning removed and is sold a filing anyway.

    This one is a SOURCE check, and weaker than the rest of this block for it.
    Building a fixture that lands between the two thresholds also needs
    qualify() to raise SAVING_BELOW_FEE first, which depends on the district
    rate rather than on anything this test controls. Named here rather than
    faked: it pins the identifier, not the behaviour.
  */
  const { readFileSync } = await import('node:fs');
  const protestSrc = readFileSync(new URL('../lib/tx/protest.js', import.meta.url), 'utf8');
  t('the below-fee caution is dropped on the billing gap, not the market gap',
    /if \(billingGap > 0 && Math\.round\(billingGap \* DEFAULT_TAX_RATE\) >= SERVICE_FEE\)/.test(protestSrc));

  // An ask that lands ABOVE the capped value moves the bill by nothing, and
  // must quote nothing rather than a four-figure number beside a refusal.
  const absorbed = buildProtest({
    parcel: { ...subject, market_value: 1103386, appraised_value: 600000 },
    comps: { ...goodComps, indicatedAppraised: 953964, indicatedMarket: 953964 },
    taxYear: 2026,
  });
  t(`an ask above the capped value quotes no saving (got ${absorbed.estimatedSaving})`,
    absorbed.estimatedSaving === null);
}

/**
 * ============================================================================
 * THE VERDICT IS RECONCILED WITH THE PACKET, AND ONLY EVER UPWARDS
 * ============================================================================
 * 4 Oct 2026. A sweep of 500 addresses across all 20 loaded districts found
 * 50 lookups whose verdict contradicted their own packet:
 *
 *   24  `cap_absorbs_everything`, eligible: false, while the comps produced
 *       an ask BELOW the capped value -- median $969/yr refused, top $8,865.
 *   26  `saving_below_cost` on packets worth a median $457 against an $89 fee.
 *
 * qualify() sets the verdict from a district-wide rate before any comparable
 * exists. The evidence pass then replaced the FIGURE and left `eligible` and
 * `outcome` on the guess.
 *
 * reconcileVerdict() is pure and exported precisely so this can run without a
 * database. The inline version it replaced lived inside a function that needs
 * Supabase, which is how it would have stayed unguarded.
 *
 * INJECTION: make it promote on `estimatedSaving >= 0` -> FAILS (refusals).
 * INJECTION: drop the `>= serviceFee` test -> FAILS (under-fee promotion).
 */
{
  const { reconcileVerdict } = await import('../lib/tx/lookup.js');
  const V = (reason, eligible) => ({ reason, eligible, confidence: 'high' });
  const go = (reason, saving, capped = true, eligible = false) =>
    reconcileVerdict(V(reason, eligible), { estimatedSaving: saving, capped, serviceFee: 89 });

  // --- it promotes where the packet disagrees -----------------------------
  const cap = go('capped_beyond_reach', 3119);
  t('a cap refusal with a real saving is overturned',
    cap.verdict.eligible === true && cap.verdict.reason === 'capped_but_reachable'
    && cap.reconciledFrom === 'capped_beyond_reach');
  t('an uncapped parcel lands on the uncapped reason',
    go('capped_beyond_reach', 3119, false).verdict.reason === 'uncapped');
  const fee = go('saving_below_fee', 407);
  t('a below-fee verdict is overturned once the packet clears the fee',
    fee.verdict.eligible === true && fee.verdict.savingWarning === false
    && fee.reconciledFrom === 'saving_below_fee');

  // --- and nowhere else ---------------------------------------------------
  t('a refusal with no saving stands',
    go('capped_beyond_reach', 0).reconciledFrom === null
    && go('capped_beyond_reach', null).reconciledFrom === null);
  t('a below-fee verdict UNDER the fee stands',
    go('saving_below_fee', 88).reconciledFrom === null
    && go('saving_below_fee', 89).reconciledFrom === 'saving_below_fee');
  t('verdicts it has no business touching are passed through',
    ['uncapped', 'capped_but_reachable', 'no_value_on_roll', 'no_taxable_value']
      .every((r) => go(r, 5000, true, true).reconciledFrom === null));

  /*
    THE ASYMMETRY IS THE POINT. A refusal already shown to someone is not
    something a later estimate should take back, so there must be no input
    at all that turns an eligible verdict into an ineligible one.
  */
  let demoted = null;
  for (const reason of ['uncapped', 'capped_but_reachable', 'saving_below_fee', 'capped_beyond_reach',
                        'no_value_on_roll', 'no_taxable_value', 'no_evidence']) {
    for (const saving of [null, 0, 1, 88, 89, 500, 1e6, -5, NaN]) {
      for (const capped of [true, false]) {
        for (const wasEligible of [true, false]) {
          const out = reconcileVerdict(V(reason, wasEligible), { estimatedSaving: saving, capped, serviceFee: 89 });
          if (wasEligible && out.verdict.eligible === false) demoted = `${reason} / ${saving} / capped=${capped}`;
        }
      }
    }
  }
  t(`no input demotes an eligible verdict${demoted ? ' (' + demoted + ')' : ''}`, !demoted);

  t('it is null-safe', reconcileVerdict(null, { estimatedSaving: 1, capped: true, serviceFee: 89 }).verdict === null);

  // The overturn has to be countable, or the rate is invisible.
  const { readFileSync } = await import('node:fs');
  const lookupSrc = readFileSync(new URL('../lib/tx/lookup.js', import.meta.url), 'utf8');
  t('the lookup records what it overturned', /reconciledFrom,/.test(lookupSrc));
  /*
    And the confidence shown at step 1 is the EVIDENCE's, not qualify's
    opinion of its own district-rate arithmetic. The payload used to ship
    `compCount: 2` beside `confidence: 'high'`.
  */
  t('step 1 reports the comparables\' confidence, not the pre-filter\'s',
    /confidence: packet\.grid\?\.confidence/.test(lookupSrc)
    && !/confidence: packet\.verdict\?\.confidence/.test(lookupSrc));
}

console.log(failures.length
  ? `verify-tx-protest: ${failures.length} FAILED, ${pass} passed\n  ✗ ` + failures.join('\n  ✗ ')
  : `verify-tx-protest: ${pass} passed`);
process.exit(failures.length ? 1 : 0);
