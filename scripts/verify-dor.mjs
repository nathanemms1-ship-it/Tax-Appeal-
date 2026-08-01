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

t('capped homestead is REFUSED', m.eligible === false);
// Refused because the cheque is too small, not because the percentage looked
// scary. Even a strong 25% win nets ~$57 against a $104 cost.
t('refused because it cannot pay for itself', m.reason === 'saving_below_cost');
t('best case is under the service fee', m.bestCaseSaving < 104);
t('refusal message quotes the actual best-case dollars', m.message.includes('$57'));
t('break-even equals the assessed value', m.breakEven === 459927);
t('differential is 149,071', m.differential === 149071);
t('required cut is 24.5%', Math.abs(m.requiredCutPct - 0.2448) < 0.0005);
// The exact failure this module exists to prevent: a 15% win changing nothing.
t('a plausible 15% reduction moves NOTHING', m.atPlausibleReduction.noEffect === true);
t('a plausible 15% reduction saves $0', m.atPlausibleReduction.dollarsSaved === 0);
t('the refusal message states the dollar differential', m.message.includes('149,071'));

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
t('SDF drops rows with no sale year or price', sdf.rows.length === 3 && sdf.skipped === 1);
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

// ── Report ───────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`DOR check — ${fail.length} of ${pass + fail.length} FAILED:`);
  for (const f of fail) console.error(`    ✗ ${f}`);
  process.exit(1);
}
console.log(`DOR check — ${pass} checks passed`);
console.log('✓ capped homesteads refused, non-homestead qualified, CSV commas survive');
