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

// ── 3. WHAT THE DOCUMENT ACTUALLY SAYS ───────────────────────────────────────
/**
 * SECTION 5, AND THE TWO ERRORS NATHAN FOUND BY READING IT. 7 Sept 2026.
 *
 * The first draft said "we have deliberately left it blank" and, four lines
 * above, "Tick one before you sign." A bare imperative next to its own
 * contradiction, with no statement of what blank actually MEANS. His question
 * was the right one: what happens if it is filed unticked?
 *
 * Nothing. § 41.44(d) makes a notice sufficient if it identifies the owner,
 * identifies the property and indicates dissatisfaction -- the hearing box is
 * not part of sufficiency, and the notice "need not be on an official form" at
 * all. § 41.45(a) then requires the board to schedule a hearing regardless.
 *
 * The second error was worse because it was a legal claim, not a UX one: the
 * draft said non-appearance means "your protest is dismissed and you may lose
 * your right to appeal for this tax year." Dismissal is real ARB practice --
 * Collin ARB states it outright -- but § 41.45(e-1) entitles an owner who misses
 * a hearing to a NEW hearing on a written statement of good cause filed within
 * four days. Printing the consequence without the cure overstates it on a
 * document a homeowner relies on.
 *
 * These assertions exist so neither comes back.
 */
const { renderProtestHtml } = await import('../lib/tx/protestHtml.js');
const html = renderProtestHtml(ok);

t('the document never orders the owner to tick a box it also leaves blank',
  !/Tick one before you sign/i.test(html));
t('it says plainly that leaving the hearing box blank does not affect the filing',
  /leaving it blank does not affect your filing/i.test(html));
t('it cites the sufficiency rule that makes that true (§ 41.44(d))',
  /41\.44\(d\)/.test(html));
t('it says a hearing is scheduled regardless (§ 41.45(a))', /41\.45\(a\)/.test(html));
t('it tells the owner they can still request telephone or video later',
  /41\.45\(b-1\)/.test(html) && /10 days before/i.test(html));

/**
 * INJECTION: delete the § 41.45(e-1) sentence -> FAILS. A document may state the
 * dismissal risk only if it also states the cure.
 */
const saysDismissed = /dismiss/i.test(html);
t('the dismissal warning is never printed without the four-day cure beside it',
  !saysDismissed || (/41\.45\(e-1\)/.test(html) && /four days/i.test(html)));
t('and dismissal is attributed to boards\' practice, not claimed as statute',
  !saysDismissed || /appraisal review\s+boards dismiss/i.test(html));

/**
 * THE REASSURANCE IN SECTION 5, AND THE TWO CLAIMS IT MUST NOT MAKE. 7 Sept 2026.
 *
 * Nathan asked for a line telling the owner they probably will not have to
 * attend anything. He is right that they probably will not. The two phrasings
 * proposed would each have printed something false on a filed document:
 *
 *   "decided without any type of formal or informal hearing" — EPCAD 2023:
 *   41,154 protests filed, 16,656 resolved AT THE INFORMAL, 9,116 reached the
 *   ARB. The informal is the largest single place a protest is resolved, and it
 *   is the box we tick two lines above. The claim would contradict our own form.
 *
 *   "if by chance the county asks for one" — § 41.45(a) says the board SHALL
 *   schedule a hearing on the filing of a protest. Not discretionary, not rare.
 *   The paragraph directly below already says so, so this would contradict that
 *   too. What is rare is the hearing HAPPENING, because the informal resolves it.
 *
 * INJECTION: reinstate either phrase -> the matching assertion FAILS.
 */
t('the document never claims protests are decided without an informal review',
  !/without any (?:type of )?(?:formal or )?informal/i.test(html));
t('it never frames the hearing as something the county might or might not ask for',
  !/if (?:by chance )?the (?:county|district) (?:asks|requests)/i.test(html));
t('it does say most protests resolve before a formal hearing, which the numbers support',
  /resolved with the appraisal district before a formal hearing/i.test(html));
t('and it points at the informal as the reason, rather than at our own results',
  /that is what the informal review above is for/i.test(html));
/**
 * Scoped to the reassurance paragraph, not the whole document — the first
 * version of this assertion failed on `width:100%` in the stylesheet and on
 * "within 10% of the subject's living area" in the comps methodology note. Both
 * are legitimate; the thing being kept out is an OUTCOME statistic. The model
 * decision drops percentages from anything customer-facing, because a stat in
 * that position becomes a marketing claim — which is what Texas Tax Protest is
 * suing Ownwell over.
 */
const reassurance = (html.match(/You most likely will not have to attend[\s\S]*?<\/div>/) || [''])[0];
t('the reassurance paragraph was found at all (the extractor still matches)',
  reassurance.length > 200);
t('it quotes no success rate, share or percentage',
  !/\d{1,3}\s?%/.test(reassurance) && !/vast majority/i.test(reassurance)
  && !/\b(?:one|1) in \d/i.test(reassurance));

/**
 * THE PER-DISTRICT FACT IS PRINTED ONLY WHERE WE HOLD IT.
 *
 * El Paso's informal is conducted entirely by email — EPCAD's own portal says
 * you cannot meet an appraiser in person. That is worth telling a homeowner.
 * Harris runs iSettle, Tarrant an automated valuation tool; printing El Paso's
 * sentence for them would tell someone to expect an email that never comes.
 *
 * INJECTION: change INFORMAL_CHANNEL[cadId] to a default string -> FAILS.
 */
t('El Paso’s email-only informal is stated on an El Paso filing',
  /handled entirely by email/i.test(html));
{
  const other = buildProtest({ parcel: { ...subject, cad_id: 999 },
    comps: goodComps, taxYear: 2026, owner: { firstName: 'A', lastName: 'B' } });
  t('a district we hold no informal-practice note for prints none',
    other.filable === true && other.form50132.informalChannel === null);
}

/**
 * THE INFORMAL REVIEW AND THE ARB HEARING ARE DIFFERENT PROCEEDINGS. 7 Sept 2026.
 *
 * Nathan read the rendered page: the top of Section 5 says El Paso's review is
 * by email and you cannot meet an appraiser in person, and the bottom said
 * "blank means the hearing is set as an in-person hearing." Both statements were
 * true — of DIFFERENT proceedings — and the copy used "hearing" for both, so on
 * the page it read as a flat contradiction.
 *
 * The informal review comes first and is where most protests settle. The formal
 * ARB hearing is a separate, later step. The document now says so before it says
 * anything about an in-person default.
 *
 * INJECTION: delete the "separate, later step" sentence -> FAILS.
 */
t('the document distinguishes the ARB hearing from the informal review',
  /separate, later step from the informal review/i.test(html));
t('the in-person default is stated as conditional on the hearing going ahead',
  !/Blank means the hearing is set as an in-person hearing/i.test(html)
  && /if the ARB\s+hearing does go ahead, it is an in-person hearing/i.test(html));

/**
 * AND THE RENDERER NAMES NO DISTRICT.
 *
 * Fixing the contradiction above, the first attempt wrote "in El Paso by email"
 * into the shared renderer — which would print El Paso's practice on a Harris
 * filing. That is the defect INFORMAL_CHANNEL exists to prevent, reintroduced in
 * the act of fixing something else. Per-district facts are data; this file is
 * prose that must hold for every district.
 *
 * INJECTION: put a county name back in the template -> FAILS.
 */
{
  const { readFileSync } = await import('node:fs');
  // Comments stripped first: the file's own header cites Travis's 15-minute
  // hearing allotment as the reason for the layout, which is documentation, not
  // something the document prints. Scanning raw source flagged it on the first
  // run — a guard that fires on its own rationale trains people to ignore it.
  const tmpl = readFileSync(new URL('../lib/tx/protestHtml.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const named = ['El Paso', 'Harris', 'Dallas', 'Tarrant', 'Travis', 'Bexar',
    'Jefferson', 'Kaufman', 'Nueces', 'Taylor', 'Wichita']
    .filter((c) => new RegExp(`\\b${c}\\b`).test(tmpl));
  t(`the shared renderer hardcodes no district${named.length ? ` — found: ${named.join(', ')}` : ''}`,
    named.length === 0);
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
 * CURE ADJUSTS THE MARKET GROUND, NEVER THE EQUITY GRID.
 *
 * § 41.43(b)(3) compares APPRAISED values. Condition is a § 41.41(a)(1)
 * market-value argument. Subtracting a repair cost from the equity indication
 * would be arguing that our neighbours' appraised values should be lower too.
 *
 * INJECTION: subtract cureDollars from `equity` in opinionOfValue -> FAILS.
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
t('cost to cure lowers the ask below the equity-only figure',
  withIssues.requestedValue < ok.requestedValue);
t('the ask is the lower of the equity ground and the cure-adjusted market ground',
  withIssues.requestedValue === Math.min(
    goodComps.indicatedAppraised,
    goodComps.indicatedMarket - withIssues.conditionExhibit.cureDollars));

/**
 * THE ASSERTION THAT ACTUALLY CATCHES IT.
 *
 * The one above compares against a formula, so it holds whichever ground wins.
 * This one pins the equity ground directly: with a cure small enough that the
 * market ground stays above it, the answer must be the equity figure UNCHANGED.
 * Subtract the cure from equity as well and it drops by exactly the cure.
 *
 * INJECTION: `const equity = n(comps.indicatedAppraised) - n(cureDollars)` -> FAILS.
 */
t('a cure that does not beat the equity ground leaves the ask exactly where it was',
  opinionOfValue(subject, goodComps, 5000) === goodComps.indicatedAppraised);

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
 * A large enough cure would otherwise drive the ask below the value of the bare
 * lot, which no board will entertain and which discredits the rest of the packet.
 *
 * INJECTION: drop the Math.max floor from opinionOfValue -> FAILS.
 */
{
  const huge = opinionOfValue(subject, goodComps, 10 ** 7);
  t('an enormous cure cannot drive the ask below the district’s own land value',
    huge === subject.land_value && huge > 0);
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
 * ============================================================================
 * THE GRID ASSERTIONS WERE READING THE DATA, NOT THE PAGE. 7 Sept 2026.
 * ============================================================================
 *
 * Found by injection sweep: emptying the statute out of the rendered grid —
 * `<div class="statute">${e(g.statute)}</div>` -> `<div class="statute"></div>`
 * — left all 68 assertions passing, because they tested `ok.grid.statute`, the
 * DATA the renderer is handed, and never what it printed.
 *
 * The statute block is, per the research pass, the single highest-leverage
 * element in the document: the Comptroller's ARB Manual gives boards almost no
 * guidance on (b)(3), so the page has to teach the test while making the
 * argument. It was the least guarded thing in the file.
 *
 * Section 5's assertions read the rendered HTML from the start. The grid's did
 * not. Same file, two standards, and the weaker one was on the page that
 * carries the argument. Everything a panel actually reads is asserted against
 * the RENDER below.
 */
{
  const grid = (html.match(/UNEQUAL APPRAISAL[\s\S]*?(?=<div class="page|<\/body>)/) || [''])[0];
  t('the grid page was found in the render (the extractor still matches)', grid.length > 400);
  t('the § 41.43(b)(3) test is PRINTED on the grid page, not merely available to it',
    /41\.43\(b\)\(3\)/.test(grid) && /median appraised value/i.test(grid));
  t('the burden being the district’s is printed there too', /41\.43\(a\)/.test(grid));
  t('the median row is printed with the comp count',
    new RegExp(`MEDIAN of ${ok.grid.compCount} comparable`).test(grid));
  t('the median per-square-foot figure reaches the page',
    grid.includes(String(ok.grid.medianAppraisedPerSqft)));
  /**
   * SCOPED TO THE ASK BLOCK, NOT THE PAGE.
   *
   * `grid.includes(requestedValue)` passed with the ask block emptied, because
   * on a packet with no condition case the requested value EQUALS
   * indicatedAppraised — which the median row already prints. The assertion was
   * satisfied by a different number that happened to be the same. Same
   * degeneracy as the fixture whose two grounds agreed.
   */
  // Bounded by the block that follows it, not by a closing tag: the ask block
  // nests three divs, so a lazy </div></div> match stopped before the figure.
  const ask = (grid.match(/<div class="ask">[\s\S]*?<div class="foot">/) || [''])[0];
  t('the ask block was found on the grid page', ask.length > 80);
  t('the value requested is printed IN the ask block',
    ask.includes(ok.requestedValue.toLocaleString()));
  t('and the reduction sought is stated beside it',
    ask.includes(ok.reductionSought.toLocaleString()));
  t('the capped share of the comp set is disclosed on the page, not just computed',
    /assessment cap/i.test(grid));
  t('the subject is identified as the subject', /— <b>subject<\/b>/.test(grid));
}

/**
 * And the same standard for Exhibit C: a priced repair with no visible source is
 * the fabricated-comparable defect. lib/costToCure.js's rule is "EVERY DOLLAR
 * FIGURE CARRIES A SOURCE", and it is the owner who defends it in the room.
 */
{
  const withHtml = renderProtestHtml(withIssues);
  const ex = (withHtml.match(/PROPERTY CONDITION[\s\S]*$/) || [''])[0];
  t('the condition exhibit was found in the render', ex.length > 400);
  t('the market-value ground is named on the exhibit', /41\.41\(a\)\(1\)/.test(ex));
  t('the total cost to cure is printed',
    ex.includes(withIssues.conditionExhibit.cureDollars.toLocaleString()));
  t('every priced line shows its source on the page',
    withIssues.conditionExhibit.priced.every((x) => ex.includes(x.source)));
  t('and the packet states we never inspected the property',
    /has not inspected the property/i.test(ex));
}

/**
 * THE FILED ADDRESS CARRIES THE STATE.
 *
 * A county roll has no state column because it does not need one; a document
 * filed with an appraisal district does. Section 2 printed "EL PASO, 79907"
 * until it was read on the page — and nothing asserted it afterwards.
 *
 * INJECTION: drop 'TX' from propertyAddress in protest.js -> FAILS.
 */
t('the property address on the form carries the state',
  /,\s*TX\s+\d{5}/.test(ok.form50132.propertyAddress)
  && html.includes(ok.form50132.propertyAddress));

console.log(failures.length
  ? `verify-tx-protest: ${failures.length} FAILED, ${pass} passed\n  ✗ ` + failures.join('\n  ✗ ')
  : `verify-tx-protest: ${pass} passed`);
process.exit(failures.length ? 1 : 0);
