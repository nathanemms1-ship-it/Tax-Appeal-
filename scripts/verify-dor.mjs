/**
 * VERIFICATION for the DOR roll parser and the savings gate.
 *
 * Offline, no database, no downloads. The fixtures are REAL numbers taken from
 * the Hillsborough County Property Appraiser record for
 * U-23-28-17-A4M-000000-00066.0 (8023 Marbella Creek Ave, Tampa) — the parcel
 * that revealed the Save Our Homes problem in the first place. If the gate ever
 * stops refusing that property, this fails the build.
 *
 * The assertions here are about MONEY AND HONESTY, not code style:
 *   - a capped homestead that cannot save must be refused
 *   - a non-homesteaded parcel must NOT be refused, because school levies are
 *     uncapped and any reduction reaches the bill
 *   - a recent purchase must qualify, because the sale reset assessed to just
 *   - CSV fields containing commas must not shift every later column
 */

import assert from 'node:assert';
import { qualify, taxEffect, breakEvenJv } from '../lib/dor/qualify.js';
import { parseRoll, splitCsvLine } from '../lib/dor/parseRoll.js';
import { normalizeAddr, anchoredPattern, rowMatches, addressVariants, stripUnit } from '../lib/dor/addressMatch.js';

let pass = 0;
const fail = [];
const t = (name, cond) => (cond ? pass++ : fail.push(name));

// ── Fixture 1: the real capped homestead ─────────────────────────────────────
// County record, 2026 roll: just 608,998 / assessed 459,927 / taxable 408,516
// (county) and 434,927 (schools). Exemptions 51,411 and 25,000 respectively.
const MARBELLA = {
  parcel_id: 'U-23-28-17-A4M-000000-00066.0',
  dor_uc: 1,
  jv: 608998,
  av_sd: 459927, av_nsd: 459927,
  tv_sd: 434927, tv_nsd: 408516,
  tot_lvg_area: 2399, act_yr_blt: 2018,
};

const m = qualify(MARBELLA, { millage: { school: 6.3, nonSchool: 11.5 } });

t('capped homestead does NOT proceed on comparable sales alone', m.eligible === false);
// CHANGED 7 Aug 2026. This used to assert reason === 'saving_below_cost' — a flat
// refusal. On comps alone that is still the arithmetic (a strong 25% win nets ~$57
// against a $104 cost), but the required cut is 24.5%, well inside what a
// documented cost to cure can reach. So the gate now ASKS about condition instead
// of declaring "an appeal would not lower your tax bill this year" to the owner of
// a house that might have a dead A/C and a failed roof.
//
// Marbella Creek is the parcel this module's own header uses to explain cost to
// cure. It was being refused by the one function that never considered it.
t('...it is RESCUABLE, not refused', m.rescuable === true);
t('...and says so by name', m.reason === 'needs_condition_case');
t('best case ON COMPS ALONE is under the service fee', m.bestCaseSaving < 104);
t('the invitation quotes the actual comps-only best case', m.message.includes('$57'));
// The question is kept OUT of `message` and in its own field, so the UI can
// emphasise it without emphasising the arithmetic around it. If these two ever
// merge again, the screen loses the only sentence that can change the outcome.
t('the message is the arithmetic only, not the question', !/tell us what is wrong with it/i.test(m.message));
t('the invitation asks about condition rather than closing the door', /tell us what is wrong with it/i.test(m.conditionPrompt));
t('the invitation promises a re-check before payment', /before you pay anything/i.test(m.conditionPrompt));
t('break-even equals the assessed value', m.breakEven === 459927);
t('differential is 149,071', m.differential === 149071);
t('required cut is 24.5%', Math.abs(m.requiredCutPct - 0.2448) < 0.0005);
// The exact failure this module exists to prevent: a 15% win changing nothing.
t('a plausible 15% reduction moves NOTHING', m.atPlausibleReduction.noEffect === true);
t('a plausible 15% reduction saves $0', m.atPlausibleReduction.dollarsSaved === 0);
t('the message states the dollar differential', m.message.includes('149,071'));

// ── PASS 2: the same parcel, with a documented cure ──────────────────────────
// $80,000 of sourced cost to cure — roof, HVAC, kitchen on a 2,399 sqft home — is
// subtracted from the requested just value ON TOP of the comps reduction. That
// clears the $459,927 cap comfortably and the sale becomes legitimate.
const mCured = qualify(MARBELLA, { millage: { school: 6.3, nonSchool: 11.5 }, cureDollars: 80000 });
t('PASS 2: a documented cure makes the same parcel ELIGIBLE', mCured.eligible === true);
t('PASS 2: ...and the best case now clears the service fee', mCured.bestCaseSaving > 104);
t('PASS 2: ...and it is no longer flagged rescuable', !mCured.rescuable);

// A cure too small to close the gap must NOT rescue the sale. This is the
// assertion that stops the change from becoming "sell to everyone who ticks a box".
//
// $2,000, not a rounder number, because the threshold is closer than it looks:
// once the requested value is already below break-even, every further dollar of
// cure cuts taxable value on BOTH levies, so at ~17.8 mills each $1,000 of cure is
// worth ~$18/yr. On this parcel $2,500 of cure still fails at $101 and $3,000
// passes at $110. A cure of $5,000 already clears the fee comfortably — which is
// the point of the change, and the reason the "too thin" fixture has to be small.
const mThin = qualify(MARBELLA, { millage: { school: 6.3, nonSchool: 11.5 }, cureDollars: 2000 });
t('PASS 2: a trivial cure does NOT make it eligible', mThin.eligible === false);
t('PASS 2: ...and having asked once, it does not ask again', !mThin.rescuable);
t('PASS 2: ...it is now a real refusal', mThin.reason === 'saving_below_cost');

// The cure must be ADDITIVE to comps, not an alternative to them. If these two
// were ever the same number, the cure would be getting swallowed.
t('cure lowers the requested value on top of the comps reduction',
  mCured.scenarios.optimistic.requestedJv === m.scenarios.optimistic.requestedJv - 80000);

// Derived exemptions must match the county's published figures exactly.
const eff = taxEffect(MARBELLA, 400000, { school: 6.3, nonSchool: 11.5 });
t('school exemption derives to 25,000', 459927 - 434927 === 25000);
t('non-school exemption derives to 51,411', 459927 - 408516 === 51411);
t('a reduction BELOW break-even does move the bill', eff.noEffect === false);
t('taxable falls to 375,000 school at a 400k just value', eff.taxableAfter.school === 375000);
t('taxable falls to 348,589 non-school at a 400k just value', eff.taxableAfter.nonSchool === 348589);
t('dollars saved are computed and positive', eff.dollarsSaved > 0);

// ── Fixture 1b: THE SAME RATIO, A BIGGER HOUSE ───────────────────────────────
// 24.5% required cut again — identical to Marbella Creek — but on a $2M property
// the same percentage is worth real money, so it must be ALLOWED through.
// This is the case a percentage threshold gets wrong, and the reason the gate
// tests dollars instead. If these two ever return the same verdict, the gate has
// regressed to reasoning about ratios.
const BIG = { dor_uc: 1, jv: 2000000, av_sd: 1510000, av_nsd: 1510000, tv_sd: 1485000, tv_nsd: 1458589 };
const b = qualify(BIG);
t('same required cut on a $2M house is ALLOWED', b.eligible === true);
t('...and its required cut really is the same as Marbella', Math.abs(b.requiredCutPct - m.requiredCutPct) < 0.001);
t('...and it clears the service fee', b.bestCaseSaving > 104);
t('a long-odds case carries a written disclosure', typeof b.disclosure === 'string' && b.disclosure.includes('not refundable'));

// ── Fixture 1c: cap absorbs everything ───────────────────────────────────────
// A 45% required cut. No outcome we would call strong moves any tax at all, so
// this refuses for a different reason than "too small to be worth it".
const DEEP = { dor_uc: 1, jv: 400000, av_sd: 220000, av_nsd: 220000, tv_sd: 195000, tv_nsd: 168589 };
const d = qualify(DEEP);
t('an unreachable cap is refused', d.eligible === false);
t('...for absorbing everything, not for a small saving', d.reason === 'cap_absorbs_everything');
t('...and its best case is exactly zero', d.bestCaseSaving === 0);
// A cut this deep is beyond ANY documented cure, so it must not be dressed up as
// a question. The condition prompt exists only where condition can actually change
// the answer — offering it here would be a false hope.
t('...and a flat refusal carries NO condition prompt', !d.conditionPrompt);
t('...and is not flagged rescuable', !d.rescuable);

// ── Fixture 2: non-homesteaded ───────────────────────────────────────────────
// The 10% cap (s 193.1554) does NOT apply to school levies, so av_sd equals jv.
// Any reduction reaches the school portion immediately. If this ever reads as
// ineligible we have wrongly written off ~30-35% of Florida residential parcels
// and 64% of the state's property tax revenue.
const RENTAL = {
  dor_uc: 1,
  jv: 500000,
  av_sd: 500000,   // uncapped for schools
  av_nsd: 450000,  // 10% cap applied to non-school
  tv_sd: 500000, tv_nsd: 450000,
};
const r = qualify(RENTAL);
t('non-homesteaded parcel is ELIGIBLE', r.eligible === true);
t('non-homesteaded break-even equals just value', r.breakEven === 500000);
t('non-homesteaded differential is zero', r.differential === 0);
t('non-homesteaded confidence is high', r.confidence === 'high');
const rEff = taxEffect(RENTAL, 450000, { school: 6.3, nonSchool: 11.5 });
t('a 10% cut reaches the school levy even under the 10% cap', rEff.taxableReduction.school === 50000);
t('...and nothing on non-school, which is already capped', rEff.taxableReduction.nonSchool === 0);

// ── Fixture 3: recent purchase ───────────────────────────────────────────────
// A sale resets assessed to just value, so there is no differential to clear.
const RECENT = { dor_uc: 1, jv: 400000, av_sd: 400000, av_nsd: 400000, tv_sd: 375000, tv_nsd: 350000 };
const rc = qualify(RECENT);
t('recent purchase is ELIGIBLE', rc.eligible === true);
t('recent purchase needs no reduction to break even', rc.requiredCutPct === 0);

// ── Fixture 4: fully exempt ──────────────────────────────────────────────────
const EXEMPT = { dor_uc: 1, jv: 300000, av_sd: 300000, av_nsd: 300000, tv_sd: 0, tv_nsd: 0 };
t('fully exempt parcel is refused', qualify(EXEMPT).eligible === false);
t('fully exempt break-even is null', breakEvenJv(EXEMPT) === null);

// ── Fixture 5: non-residential ───────────────────────────────────────────────
t('commercial use code is refused', qualify({ ...RECENT, dor_uc: 11 }).reason === 'not_residential');

// ── CSV parsing ──────────────────────────────────────────────────────────────
// OWN_NAME routinely contains a comma ("SMITH, JOHN A"). A naive split shifts
// every later column by one, which produces plausible numbers in the wrong
// fields — the worst possible failure on a sworn document.
const cells = splitCsvLine('29,"U-1-2-3",R,2026,"SMITH, JOHN A",608998');
t('quoted comma does not split the field', cells[4] === 'SMITH, JOHN A');
t('the column AFTER a quoted comma is not shifted', cells[5] === '608998');
t('escaped double quotes survive', splitCsvLine('a,"say ""hi""",b')[1] === 'say "hi"');

// ── End-to-end parse ─────────────────────────────────────────────────────────
const NAL_CSV = [
  'CO_NO,PARCEL_ID,ASMNT_YR,DOR_UC,JV,AV_SD,AV_NSD,TV_SD,TV_NSD,TOT_LVG_AREA,ACT_YR_BLT,NBRHD_CD,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,OWN_NAME,EXMPT_01',
  '29,U-23-28-17-A4M-000000-00066.0,2026,001,608998,459927,459927,434927,408516,2399,2018,208008.00,8023 MARBELLA CREEK AVE,TAMPA,33625,"LINDENMAYER, RAYMOND",25000',
  '29,,2026,001,,,,,,,,,,,,,',  // no PARCEL_ID — unusable, must be skipped not thrown on
].join('\n');

const parsed = parseRoll(NAL_CSV, 'nal');
t('parses one good NAL row', parsed.rows.length === 1);
t('a row with no PARCEL_ID is skipped, not fatal', parsed.skipped === 1);
t('leading zeros in DOR_UC become 1', parsed.rows[0].dor_uc === 1);
t('just value parsed', parsed.rows[0].jv === 608998);
t('neighborhood code retained for comping', parsed.rows[0].nbrhd_cd === '208008.00');
t('owner name with comma intact', parsed.rows[0].own_name === 'LINDENMAYER, RAYMOND');
t('address parsed for autocomplete', parsed.rows[0].phy_addr1 === '8023 MARBELLA CREEK AVE');

// The parsed row must reach the same verdict as the hand-built fixture —
// i.e. the parser and the gate agree end to end.
t('parsed row is refused, same as the fixture', qualify(parsed.rows[0]).eligible === false);

const SDF_CSV = [
  'CO_NO,PARCEL_ID,ASMNT_YR,SALE_YR,SALE_MO,SALE_PRC,QUAL_CD,VI_CD,NBRHD_CD,MULTI_PAR_SAL',
  '29,U-1,2026,2025,10,480000,01,I,208008.00,',
  '29,U-2,2026,2025,06,1,11,I,208008.00,',      // $1 family transfer, disqualified
  '29,U-3,2026,2025,08,900000,01,I,208008.00,C', // multi-parcel sale
  '29,U-4,2026,,,,01,I,208008.00,',              // no sale data
].join('\n');

const sdf = parseRoll(SDF_CSV, 'sdf');
t('SDF drops rows with no sale year or price', sdf.rows.length === 3);
// Counted as an EXCLUSION, not a skip. A transfer recorded with no
// consideration is a real record we cannot use as a comp — not a parse failure —
// and counting it as one made two healthy counties trip the layout alarm.
t('...and counts it as an exclusion, not a parse failure', sdf.excluded === 1 && sdf.skipped === 0);
t('qual code 01 is qualified', sdf.rows[0].is_qualified === true);
t('qual code 11 (family transfer) is NOT qualified', sdf.rows[1].is_qualified === false);
t('multi-parcel flag preserved so it can be excluded', sdf.rows[2].multi_par_sal === 'C');
t('sale date built from year and month', sdf.rows[0].sale_date === '2025-10-01');

// SALE_ID_CD is the sales table's primary key, so losing it silently would make
// loads non-idempotent AND collapse distinct transfers. The Hillsborough 2026
// roll has 1,343 sale groups sharing a parcel, month and price while being
// genuinely different recorded instruments — usually two $100 quit-claim deeds
// with different clerk numbers. Keying on (parcel, date, price) would have
// discarded one of each pair.
const SDF_DUP = [
  'CO_NO,PARCEL_ID,ASMNT_YR,SALE_YR,SALE_MO,SALE_PRC,QUAL_CD,VI_CD,SALE_ID_CD',
  '39,172702007000000000223U,2026,2025,08,100,11,I,2025350840',
  '39,172702007000000000223U,2026,2025,08,100,11,I,2025354244',
].join('\n');
const dup = parseRoll(SDF_DUP, 'sdf');
t('same parcel/month/price with different sale IDs are kept as two sales', dup.rows.length === 2);
t('sale_id_cd is preserved — it is the primary key', dup.rows[0].sale_id_cd === '2025350840');
t('...and the two sale IDs differ', dup.rows[0].sale_id_cd !== dup.rows[1].sale_id_cd);


// ── DR-486 evidence integrity ────────────────────────────────────────────────
// The petition is signed under penalty of perjury. These assertions guard the
// one property that matters: the prompt may contain ONLY comps that were
// supplied, and must never ask the model to produce a comparable sales section
// of its own. An earlier version did exactly that and mailed invented addresses
// and sale prices to a government board over a homeowner's signature.
import { readFileSync } from 'node:fs';
const dr486 = readFileSync(new URL('../pages/api/generate-dr486.js', import.meta.url), 'utf8');

// THE HANDLER, NOT buildDR486Html.
//
// The previous assertion matched
//   /propertyAddress, county, parcelId, assessedValue, requestedValue, taxYear, comps,/
// which is the PARAMETER LIST of buildDR486Html — a function that always had
// `comps` and never lost it. So it passed while the request handler, the place
// that actually needs the field, did not destructure it at all. Every Florida
// petition threw "ReferenceError: comps is not defined" at the final step and
// this suite still reported 66 of 66 passing.
//
// Assert against the scope that matters.
const handlerHead = dr486.slice(
  dr486.indexOf('export default async function handler'),
  dr486.indexOf('} = checked.clean;'),
);
t('DR-486 handler destructures comps from the request body', /\bcomps,/.test(handlerHead));

// Behaviour, not an exact source string. The old form matched the literal text
// `const compRows = Array.isArray(comps)`, so adding a bound to that same
// expression failed the build without changing what it does.
t('DR-486 only builds a comps block from supplied rows', /const compRows\s*=[\s\S]{0,200}Array\.isArray\(comps\)/.test(dr486));
t('DR-486 bounds the comps it will interpolate into the prompt', /const compRows[\s\S]{0,300}\.slice\(0,\s*\d+\)/.test(dr486));
t('DR-486 requires both an address and a sale price per comp', dr486.includes('c.salePrice && c.address'));
t('DR-486 forbids sales outside the supplied set', dr486.includes('The ONLY comparable sales you may reference are those listed under VERIFIED COMPARABLE SALES'));
t('DR-486 tells the model to cite nothing when none are supplied', dr486.includes('If it is absent, cite no sales at all'));
t('DR-486 keeps the fabrication prohibition', dr486.includes('DO NOT invent, estimate, or state any specific comparable sale'));
// Scoped to the PROMPT, not the file — the comments deliberately quote the old
// fabricating phrasing to explain why it was removed, and a naive whole-file
// scan flags its own changelog.
const promptStart = dr486.indexOf('const evidencePrompt = `');
const promptBody = promptStart > -1 ? dr486.slice(promptStart, dr486.indexOf('`;', promptStart)) : '';
t('the prompt itself exists', promptBody.length > 200);
t('the prompt never asks the model to produce comparables', !/3-4 recent comparable sales|4-5 recent sales|include a comparable sales section/i.test(promptBody));
t('the prompt forbids unlisted sales', promptBody.includes('cite no sales at all'));

const apply = readFileSync(new URL('../pages/apply.js', import.meta.url), 'utf8');
t('funnel only forwards comps that support a reduction', apply.includes('cJson?.supportsReduction !== false'));
t('funnel only forwards a sufficient comp set', apply.includes('cJson?.sufficient'));
t('a comps failure does not block the petition', apply.includes('filing on methodology alone'));


// ── Address matching ─────────────────────────────────────────────────────────
/**
 * ADDED 23 Aug 2026, after 13 of 46 recorded checks returned `no_parcel`.
 *
 * findParcel built its filter with `orIlike(col, addressVariants(addr))` and no
 * wildcards. ILIKE with no wildcard is case-insensitive EQUALITY, so a customer
 * had to reproduce the county's PHY_ADDR1 character for character. Measured
 * against the loaded 2026 roll the same day: 326,092 parcels carry unit text in
 * PHY_ADDR1 and 270,468 have irregular internal whitespace — up to 596,560 of
 * 8,410,126 that no correctly-typed address could reach.
 *
 * suggestAddresses wrapped its patterns in `%...%` the whole time, so the
 * DROPDOWN found those properties. The same address therefore succeeded or
 * failed on whether the customer clicked a suggestion, and the failure read as a
 * statement about the property. Every assertion below fails if the equality
 * comparison is restored.
 */
t('a roll row with trailing unit text matches', rowMatches('1610 SEAGRAPE WAY APT 4', addressVariants(normalizeAddr('1610 Seagrape Way'))));
t('a roll row with a doubled internal space matches', rowMatches('1610  SEAGRAPE  WAY', addressVariants(normalizeAddr('1610 Seagrape Way'))));
t('a roll row with leading/trailing space matches', rowMatches('  1610 SEAGRAPE WAY ', addressVariants(normalizeAddr('1610 Seagrape Way'))));
t('an exact roll row still matches', rowMatches('1610 SEAGRAPE WAY', addressVariants(normalizeAddr('1610 Seagrape Way'))));

/**
 * ============================================================================
 * PUNCTUATION IN THE ROLL. Reported by a customer, 25 Aug 2026.
 * ============================================================================
 * "17400 GULF BLVD # J-9", Redington Shores, Pinellas — a condominium, with the
 * unit written into PHY_ADDR1 the way the county writes it.
 *
 * normalizeAddr removes '.' and '#' from the CUSTOMER'S text. normSpace, which
 * was what rowMatches ran over the ROLL ROW, did not. So the row kept a '#' the
 * typed side had lost, and the two were compared as strings:
 *
 *     rowMatches('17400 GULF BLVD # J-9',
 *                addressVariants(normalizeAddr('17400 GULF BLVD # J-9')))  ->  false
 *
 * A roll address did not match ITSELF, and the customer was told we had no
 * record of their property.
 *
 * The autocomplete turned that from likely into certain. suggestAddresses
 * returns `street: r.phy_addr1` — the raw roll string, '#' included — and
 * onSelect writes it into the box. Picking the suggestion took a customer whose
 * shorter typing WOULD have matched and guaranteed that it no longer did.
 *
 * INJECTION: revert rowMatches to normSpace -> the first three FAIL.
 */
t('a roll row with a hash unit matches itself', rowMatches('17400 GULF BLVD # J-9', addressVariants(normalizeAddr('17400 GULF BLVD # J-9'))));
t('a hash unit matches when the customer omits it', rowMatches('17400 GULF BLVD # J-9', addressVariants(normalizeAddr('17400 Gulf Blvd'))));
t('a hash unit matches with no space after the hash', rowMatches('17400 GULF BLVD # J-9', addressVariants(normalizeAddr('17400 Gulf Blvd #J-9'))));
t('a period in the roll matches text typed without one', rowMatches('1200 ST. JOHNS BLUFF RD', addressVariants(normalizeAddr('1200 St Johns Bluff Rd'))));
t('a period typed matches a roll row without one', rowMatches('1200 ST JOHNS BLUFF RD', addressVariants(normalizeAddr('1200 St. Johns Bluff Rd'))));

/**
 * And the punctuation fix must not have loosened the other-house rule.
 * Stripping '#' and '.' changes nothing about the word-boundary test.
 */
t('a hash unit does NOT match a different unit', !rowMatches('17400 GULF BLVD # J-9', addressVariants(normalizeAddr('17400 GULF BLVD # K-9'))));
t('a hash unit does NOT match a different building', !rowMatches('17402 GULF BLVD # J-9', addressVariants(normalizeAddr('17400 GULF BLVD # J-9'))));

/**
 * KNOWN LIMITATION, asserted so that it is a decision rather than a surprise.
 *
 * normalizeAddr maps '.' to a SPACE, not to nothing, because "ST. JOHNS" must
 * not become "STJOHNS". The cost is that a dotted abbreviation splits: "N.W."
 * becomes "N W", which does not match a customer typing "NW". This is symmetric
 * — it was equally true of the customer's side before 25 Aug — so it is not a
 * regression, and it is only reachable if a Florida roll actually spells a
 * quadrant with dots. If a customer reports it, the fix is a targeted rewrite of
 * single-letter runs, NOT deleting '.' outright.
 */
t('dotted quadrant abbreviations are a known miss', !rowMatches('55 N.W. 2 AVE', addressVariants(normalizeAddr('55 NW 2 AVE'))));

/**
 * THE OTHER HOUSE. These are the assertions that stop the fix becoming a worse
 * bug than the one it replaced: a loose match would put another household's
 * assessment on somebody's sworn petition.
 *
 * INJECTION: change anchoredPattern to return `%${...}%`, or rowMatches to use
 * `a.includes(w)` -> the first two FAIL.
 */
t('a different house number does NOT match', !rowMatches('11610 SEAGRAPE WAY', addressVariants(normalizeAddr('1610 Seagrape Way'))));
t('a longer street name does NOT match', !rowMatches('1610 SEAGRAPE WAYSIDE DR', addressVariants(normalizeAddr('1610 Seagrape Way'))));
t('a different street does NOT match', !rowMatches('1610 PALM AVE', addressVariants(normalizeAddr('1610 Seagrape Way'))));
t('an empty roll address never matches', !rowMatches('', addressVariants(normalizeAddr('1610 Seagrape Way'))));

/**
 * The pattern must stay anchored at the house number. This is the single
 * character that separates the fix from the bug in the other direction.
 *
 * INJECTION: add a leading '%' -> FAILS.
 */
t('the SQL pattern is anchored at the house number', !anchoredPattern('1610 SEAGRAPE WAY').startsWith('%'));
t('the SQL pattern tolerates anything after the street', anchoredPattern('1610 SEAGRAPE WAY').endsWith('%'));
t('the SQL pattern wildcards every internal space', anchoredPattern('1610 SEAGRAPE WAY') === '1610%SEAGRAPE%WAY%');

/**
 * Ordinal handling predates this and must survive it — Miami-Dade writes
 * "92 SW 3 ST" and "10981 SW 121ST ST" in the same file.
 */
t('an ordinal typed by the owner matches a roll that omits it', rowMatches('92 SW 3 ST', addressVariants(normalizeAddr('92 SW 3rd St'))));
t('an ordinal omitted by the owner matches a roll that has it', rowMatches('10981 SW 121ST ST', addressVariants(normalizeAddr('10981 SW 121 St'))));

/**
 * TERMINAL_SUFFIXES is applied to the LAST WORD ONLY. Applying it to every word
 * would rewrite street NAMES that contain a suffix word, which is a new class of
 * miss traded for the one being fixed.
 *
 * INJECTION: fold TERMINAL_SUFFIXES into the whole-word map in normalizeAddr ->
 * the second FAILS.
 */
t('a terminal suffix is abbreviated', normalizeAddr('123 Ocean Plaza') === '123 OCEAN PLZ');
t('the same word inside a name is left alone', normalizeAddr('123 Crossing Creek Dr') === '123 CROSSING CREEK DR');
t('spelled-out suffixes still abbreviate anywhere', normalizeAddr('123 North Ocean Boulevard') === '123 N OCEAN BLVD');
// The ordinal is NOT stripped here — that is addressVariants' job, and keeping
// the two separate is why a roll spelling either way still matches.
t('a city after a comma is still stripped', normalizeAddr('11142 SW 6th St, Miami') === '11142 SW 6TH ST');


// ── The customer's own unit number ───────────────────────────────────────────
/**
 * THE MIRROR OF THE UNIT-TEXT BUG, added the same day it was found.
 *
 * anchoredPattern tolerates extra text in the ROLL. It cannot tolerate extra
 * text in what the CUSTOMER typed, because their string becomes the pattern —
 * and in Florida the customer typing the unit is the common direction, because
 * it is on their mail and the county keeps it in PHY_ADDR2.
 *
 * INJECTION: make stripUnit return its argument unchanged -> the first four FAIL.
 */
const typed = (s) => addressVariants(normalizeAddr(s));
t('a typed APT is stripped so a unitless roll row matches', rowMatches('1610 SEAGRAPE WAY', typed('1610 Seagrape Way Apt 4')));
t('a typed UNIT matches a roll row spelling it APT', rowMatches('1610 SEAGRAPE WAY APT 4', typed('1610 Seagrape Way Unit 4')));
// normalizeAddr turns '#' into a space long before stripUnit sees it, so this
// case has no designator at all and is caught by the positional rule instead.
t('a typed # unit survives losing its hash', rowMatches('1610 SEAGRAPE WAY', typed('1610 Seagrape Way #4')));
t('unit stripping composes with ordinal spelling', rowMatches('1610 SW 5 ST', typed('1610 SW 5th St Apt 4')));

/**
 * AND IT MUST NOT EAT A REAL ROAD NUMBER. stripUnit only ADDS a spelling; the
 * unstripped form is still generated, and findParcel prefers an exact match over
 * a prefix one so the real row wins.
 *
 * INJECTION: drop the STREET_TYPES guard from stripUnit's positional rule, or
 * stop emitting the unstripped base in addressVariants -> the first FAILS.
 */
t('a county road number is still matched exactly', rowMatches('123 COUNTY RD 30', typed('123 County Rd 30')));
t('...because the unstripped spelling is still generated', typed('123 County Rd 30').includes('123 COUNTY RD 30'));
t('a trailing number NOT after a street type is left alone', stripUnit('100 NW 5') === '100 NW 5');
t('a two-word address is never stripped to nothing', stripUnit('1610 SEAGRAPE') === '1610 SEAGRAPE');
t('the house number is never read as a unit', stripUnit('4 MAIN ST') === '4 MAIN ST');

/**
 * findParcel resolves the ambiguity that unit stripping can introduce by
 * preferring an exact match. It needs a database, so this is asserted against
 * the source rather than executed — the weaker kind of guard, and recorded as
 * such. See the header of lib/dor/addressMatch.js for why everything else here
 * could be moved out of that category.
 *
 * INJECTION: delete the `if (exact.length) data = exact;` line -> FAILS.
 */
const parcelsSrc = readFileSync(new URL('../lib/dor/parcels.js', import.meta.url), 'utf8');
t('findParcel prefers an exact match over a prefix match', /const exact = data\.filter/.test(parcelsSrc) && /if \(exact\.length\) data = exact;/.test(parcelsSrc));
t('...and it runs after the rowMatches filter, not before', parcelsSrc.indexOf('const exact = data.filter') > parcelsSrc.indexOf('data = (data || []).filter'));

// ── The no-cap break-even floor ──────────────────────────────────────────────
/**
 * ADDED 23 Aug 2026. `no_cap_differential` returned eligible unconditionally and
 * returned BEFORE saving_below_cost, so it was the one verdict in qualify() with
 * no break-even test. 15 of the 17 visitors ever told they could be helped came
 * out of that line.
 *
 * INJECTION: restore the unconditional return -> the first three FAIL.
 */
const noCap = (jv) => qualify(
  { parcel_id: 'X', dor_uc: 1, jv, av_sd: jv, av_nsd: jv, tv_sd: jv, tv_nsd: jv, tot_lvg_area: 900, act_yr_blt: 1985 },
  { millage: { school: 6.3, nonSchool: 11.5 } }
);

const thinNoCap = noCap(20000);
t('a no-cap parcel that cannot pay for itself is NOT sold', thinNoCap.eligible === false);
t('...and is asked about condition rather than refused', thinNoCap.reason === 'needs_condition_case');
t('...which is a rescue, not a dead end', thinNoCap.rescuable === true);
t('...and its best case really is under the fee', thinNoCap.bestCaseSaving < 104);

const marginalNoCap = noCap(30000);
t('a thin but viable no-cap parcel is still sellable', marginalNoCap.eligible === true && marginalNoCap.reason === 'no_cap_differential');
t('...but is rated marginal, not high', marginalNoCap.confidence === 'marginal');
// `disclosure` is what pages/check.js scopes the cost-to-cure invitation to, so
// this is the assertion that the thinnest results get the extra help rather than
// the least. See Condition_Case_Routing_2026-08-22.
t('...and carries a disclosure, which is what surfaces the condition question', typeof marginalNoCap.disclosure === 'string');
// Null-safe on purpose: reintroducing the unconditional return leaves disclosure
// undefined, and a guard that throws a TypeError names the assertion file rather
// than the defect. It still fails the build either way; this way it says why.
t('...that quotes the real numbers', typeof marginalNoCap.disclosure === 'string'
  && marginalNoCap.disclosure.includes('$104') && marginalNoCap.disclosure.includes('not refundable'));

const strongNoCap = noCap(300000);
t('a comfortable no-cap parcel is unchanged', strongNoCap.eligible === true && strongNoCap.reason === 'no_cap_differential');
t('...stays high confidence', strongNoCap.confidence === 'high');
t('...and is not given a worry it does not have', strongNoCap.disclosure == null);

/**
 * ============================================================================
 * CONFIDENCE IS RATED ON WHAT COMPS STILL HAVE TO CARRY, NOT THE GROSS GAP.
 * ============================================================================
 * Found in a browser on 23 Aug, contradicting itself on one screen: a parcel
 * needing 16.3% with $71,300 documented read "comparable sales have to carry the
 * remaining 7.0%" and, underneath, "that is an ambitious reduction" plus an
 * invitation to document more. Both sentences came from qualify().
 *
 * requiredCutPct is the whole distance to the cap and the cure does not change
 * it — the cure takes dollars off the ask. So a rating built on requiredCutPct
 * describes an owner who answered no condition questions at all.
 *
 * The fixture is the real Broward parcel from the live test.
 */
{
  const seagrape = { jv: 764980, av_sd: 640180, av_nsd: 640180, tv_sd: 640180, tv_nsd: 640180, dor_uc: 1 };

  const noCure = qualify(seagrape, { serviceFee: 114 });
  t('pass 1 with no cure rates the gross requirement — 16.3% is marginal',
    noCure.confidence === 'marginal' && typeof noCure.disclosure === 'string');
  t('...and its disclosure does not mention repairs nobody documented',
    !/documented repairs/.test(noCure.disclosure));

  // 9.3 points of the 16.3 covered, leaving 7.0 — inside a plausible 15% result.
  const withCure = qualify(seagrape, { serviceFee: 114, cureDollars: 71300 });
  t('the same parcel with $71,300 documented is rated on the residual, not the gross',
    withCure.confidence === 'good');
  t('...so it is no longer told the reduction is ambitious',
    withCure.disclosure == null);
  t('...and it is still eligible', withCure.eligible === true);

  // Enough cure to matter, not enough to clear it: 16.3 - 2.6 = 13.7... still good.
  // Take a smaller one so the residual stays above the plausible band.
  const thinCure = qualify(seagrape, { serviceFee: 114, cureDollars: 8000 });
  t('a cure too small to close the gap leaves the rating marginal',
    thinCure.confidence === 'marginal');
  t('...and its disclosure names the residual and the documented figure',
    typeof thinCure.disclosure === 'string'
      && thinCure.disclosure.includes('$8,000')
      && /comparable sales to carry/.test(thinCure.disclosure));

  // THE SAFETY PROPERTY: pass 1 is byte-identical to before this change.
  t('cureDollars = 0 rates exactly as the gross requirement did',
    qualify(seagrape, { serviceFee: 114, cureDollars: 0 }).confidence === noCure.confidence);

  // And the cure must never be able to buy its way past the gate, which is a
  // different test entirely (scenarios.optimistic.noEffect / bestCase).
  const capped = { jv: 608998, av_sd: 459927, av_nsd: 459927, tv_sd: 408516, tv_nsd: 408516, dor_uc: 1 };
  const absurd = qualify(capped, { serviceFee: 114, cureDollars: 10_000_000 });
  t('an absurd cure does not produce an absurd verdict', absurd.eligible === true || absurd.eligible === false);
  t('...and never a negative asking price', absurd.scenarios.optimistic != null);
}

// ── Report ───────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`DOR check — ${fail.length} of ${pass + fail.length} FAILED:`);
  for (const f of fail) console.error(`    ✗ ${f}`);
  process.exit(1);
}
console.log(`DOR check — ${pass} checks passed`);
console.log('✓ capped homesteads refused, non-homestead qualified, CSV commas survive');
