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

console.log(failures.length
  ? `verify-tx-protest: ${failures.length} FAILED, ${pass} passed\n  ✗ ` + failures.join('\n  ✗ ')
  : `verify-tx-protest: ${pass} passed`);
process.exit(failures.length ? 1 : 0);
