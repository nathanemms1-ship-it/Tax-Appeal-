#!/usr/bin/env node
/**
 * ============================================================================
 * THE SELLABLE POPULATION — where the savings gate and the evidence agree
 * ============================================================================
 *
 *   node scripts/tx/sellable.mjs
 *   node scripts/tx/sellable.mjs --sample=600 --fee=89 --rate=0.022
 *   node scripts/tx/sellable.mjs --cad=123
 *
 * WHY THIS EXISTS
 *
 * Two numbers are already known and they do not compose:
 *
 *   lib/tx/qualify.js   119,808 parcels (40.2%) where a protest CAN move the bill
 *   lib/tx/comps.js     44.4% of sampled parcels have a clean unequal-appraisal case
 *
 * Multiplying them is wrong and the error is not small. They are correlated
 * through the cap: a parcel whose market value has outrun its capped appraised
 * value is BOTH more likely to look over-appraised against its neighbours AND
 * less likely to have any dollars available when it wins. The comp selector has
 * a name for that overlap — `cap_absorbed` — and it was 51 of 1,235 sampled sets.
 * Only running both gates over the same parcels gives an honest number.
 *
 * ============================================================================
 * AND IT REPLACES AN ASSUMPTION WITH A MEASUREMENT
 * ============================================================================
 * qualify.js currently estimates the tax effect from a guessed outcome:
 *
 *     OPTIMISTIC_REDUCTION_PCT = 0.15
 *     PLAUSIBLE_REDUCTION_PCT  = 0.08
 *
 * Its own comment says those are placeholders, "deliberately NOT sourced from a
 * competitor's marketing", to be replaced by real data. This script is the
 * replacement path: for every parcel it computes the reduction the ACTUAL comp
 * set indicates, and reports the distribution. If the measured median comes back
 * near 8%, the placeholder was a good guess and can be defended. If it comes back
 * at 3% or 20%, every saving figure quoted to a Texas customer so far is wrong in
 * a knowable direction and the constants must move before anyone is charged.
 *
 * That is the single most valuable output here. The headcount is the second.
 *
 * ============================================================================
 * WHAT THIS STILL CANNOT TELL YOU
 * ============================================================================
 * The DOLLAR figures remain UPPER BOUNDS and must not be quoted to a customer.
 * tx_parcel_entities is empty, so exemptions are not modelled, and the $140,000
 * school homestead exemption means a modest homestead's true saving is smaller —
 * sometimes far smaller — than what this prints. Per the note in qualify.js, that
 * error runs toward OVER-acceptance, which is the expensive direction for a
 * service that takes the fee up front.
 *
 * The REDUCTION percentages do not have that problem. They are computed from the
 * district's own roll values on both sides and are as sound as the roll.
 */

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { findComps } from '../../lib/tx/comps.js';
// NOTE: qualify() itself is deliberately NOT called here. Its gate runs on an
// ASSUMED reduction (OPTIMISTIC/PLAUSIBLE_REDUCTION_PCT); this script has the
// reduction the comp set actually indicates, which supersedes the assumption.
// taxEffect() is the part that matters either way — it clamps the new appraised
// value at what is already taxed, which is the cap gate.
import { taxEffect, DEFAULT_TAX_RATE, PLAUSIBLE_REDUCTION_PCT } from '../../lib/tx/qualify.js';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};

const YEAR = Number(arg('year', 2026));
const SAMPLE = Number(arg('sample', 400));
const FEE = Number(arg('fee', 89));
const RATE = Number(arg('rate', DEFAULT_TAX_RATE));
const CLASS_PREFIX = arg('class', 'A1');

// ── connection (same idiom as push.mjs and comps-validate.mjs) ──────────────
async function promptSecret(q) {
  if (!process.stdin.isTTY) return null;
  process.stdout.write(q);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  try { return ((await new Promise((r) => rl.question('', r))) || '').trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}
function urlFromEnvFile() {
  try {
    const txt = readFileSync('.env.local', 'utf8');
    for (const key of ['PGURL', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL']) {
      const m = txt.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)`, 'm'));
      if (m && /^postgres(ql)?:\/\//.test(m[1])) return m[1].trim();
    }
  } catch { /* fine */ }
  return null;
}
let url = process.env.PGURL || process.env.DATABASE_URL || urlFromEnvFile();
if (url && !/^postgres(ql)?:\/\//.test(url)) url = null;
if (!url) url = await promptSecret('Paste the connection string (nothing will appear): ');
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('\n✗ No usable connection string. Nothing was sent anywhere.');
  process.exit(2);
}
const isLocal = /localhost|127\.0\.0\.1/.test(url) || process.env.PGSSL === 'disable';
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
await client.connect();

const COLS = `cad_id, account_number, living_area, year_built, effective_year_built,
  appraised_value, market_value, land_value, improvement_value,
  homestead_cap_loss, nhs_cap_loss, has_homestead, quality_class, condition_code,
  state_class_code, neighborhood_code, abs_subdv_cd, market_area_code,
  neighborhood_group, situs_street, situs_city, situs_zip, arb_protest_flag`;

function makeFetcher(cadId) {
  return async (subject, stratum, year) => {
    if (stratum.column) {
      const v = subject[stratum.column];
      if (v === null || v === undefined || String(v).trim() === '') return null;
      const { rows } = await client.query(
        `select ${COLS} from tx_parcels
          where cad_id=$1 and tax_year=$2 and state_class_code=$3 and ${stratum.column}=$4
            and living_area>0 and appraised_value>0 limit 600`,
        [cadId, year, subject.state_class_code, v]);
      return rows;
    }
    const { rows } = await client.query(
      `select ${COLS} from tx_parcels
        where cad_id=$1 and tax_year=$2 and state_class_code=$3
          and living_area>0 and appraised_value>0
          and living_area between $4 and $5 limit 600`,
      [cadId, year, subject.state_class_code, subject.living_area * 0.85, subject.living_area * 1.15]);
    return rows;
  };
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const med = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pctile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/**
 * DISPERSION INSIDE A COMP SET — an internal consistency check, nothing else.
 *
 * COD = 100 × (mean absolute deviation from the median) / the median.
 *
 * ── THIS IS NOT THE IAAO COD, DESPITE SHARING THE FORMULA ──────────────────
 * The IAAO Standard on Ratio Studies defines its coefficient of dispersion over
 * a POPULATION — every residential parcel in the stratum. What this function is
 * handed is a comp set: eight properties comps.js has already filtered to a
 * narrow size, age and land-share band around one subject. The filtering is what
 * makes it tight, so this number is systematically lower than the IAAO one and
 * comparing it against the residential benchmark of 15 is a category error.
 *
 * Measured over the five loaded counties the gap runs 3–8 points, and in Taylor
 * it straddles the benchmark: 10.1 here, 15.5 measured properly. Read off this
 * column, Taylor looks like a district doing fine work. It is not.
 *
 * The publishable figure comes from scripts/tx/county-stats.mjs, which computes
 * dispersion across whole neighbourhoods per the standard, and lands in
 * lib/tx/countyStats.json. Nothing on a public page may cite this function.
 *
 * IT IS A CHECK ON US, AND THAT IS THE ONLY REASON IT IS HERE.
 *
 * The reduction this engine indicates is, by construction, the distance from the
 * subject down to the median of its stratum. For a roughly symmetric spread, the
 * median such distance among the above-median half lands close to the COD itself.
 * So the two numbers should agree. If the measured reduction comes in far ABOVE
 * the COD, the comp sets are not measuring dispersion in the district's values —
 * they are measuring a bug in ours, most likely comps that are not actually
 * comparable. A large average reduction with a tight COD is a contradiction, not
 * a windfall.
 */
const cod = (values) => {
  if (values.length < 3) return null;
  const m = med(values);
  if (!m) return null;
  const mad = values.reduce((a, v) => a + Math.abs(v - m), 0) / values.length;
  return (mad / m) * 100;
};

try {
  const { rows: counties } = await client.query(
    `select cad_id, count(*)::int total
       from tx_parcels
      where tax_year=$1 and state_class_code like $2 and living_area>0 and appraised_value>0
        ${arg('cad') ? 'and cad_id=' + Number(arg('cad')) : ''}
      group by 1 order by 1`,
    [YEAR, `${CLASS_PREFIX}%`]);

  if (!counties.length) { console.error(`No ${CLASS_PREFIX}* parcels for ${YEAR}.`); process.exit(1); }

  console.log(`\nSELLABLE POPULATION — tax year ${YEAR}, class ${CLASS_PREFIX}*`);
  console.log(`Fee $${FEE}, tax rate ${(RATE * 100).toFixed(2)}% (placeholder), sample ${SAMPLE}/county.\n`);
  console.log('cad     A1 parcels  sampled  no comps  no case  cap-abs  FILABLE  clears cap  SELLABLE   rate  proj. count');
  console.log('─'.repeat(112));

  const allReductions = [], allCods = [];
  let gTotal = 0, gSellable = 0, gProjected = 0, gA1 = 0, gCapArtifact = 0;

  for (const { cad_id, total } of counties) {
    const { rows: subjects } = await client.query(
      `select ${COLS} from tx_parcels
        where cad_id=$1 and tax_year=$2 and state_class_code like $3
          and living_area>0 and appraised_value>0
        order by md5(account_number) limit $4`,
      [cad_id, YEAR, `${CLASS_PREFIX}%`, SAMPLE]);

    const fetchFn = makeFetcher(cad_id);
    let noComps = 0, noCase = 0, capAbs = 0, filable = 0, clearsCap = 0, sellable = 0, capArtifact = 0;
    const reductions = [], savings = [], cods = [];

    for (const p of subjects) {
      const c = await findComps(p, { rollYear: YEAR, fetchFn });
      if (!c.sufficient) { noComps++; continue; }

      // Uniformity of the district's OWN values inside this comp set, measured
      // on every set we build regardless of whether it yields a case.
      const setCod = cod(c.comps.map((x) => Number(x.appraised_value) / Number(x.living_area)));
      if (setCod !== null) cods.push(setCod);

      if (c.basis === 'cap_absorbed') { capAbs++; continue; }
      if (c.basis === 'none') { noCase++; continue; }

      // clean or cap_artifact — the district's own roll says this parcel is
      // appraised above the median of its comparables.
      filable++;
      if (c.basis === 'cap_artifact') capArtifact++;

      // MEASURED, not assumed. The reduction the comp set actually indicates.
      const reductionPct = (Number(p.appraised_value) - c.indicatedAppraised) / Number(p.appraised_value);
      if (reductionPct > 0) reductions.push(reductionPct);

      // Does the cap leave any of it on the table? taxEffect clamps the new
      // appraised value at what is already taxed, so this is where a parcel that
      // is genuinely over-appraised but capped below the comps drops out.
      const effect = taxEffect(p, c.indicatedAppraised, RATE);
      if (effect.reduction > 0) clearsCap++;

      // And is what is left worth more than the fee? Still an UPPER bound —
      // exemptions are not modelled — so this over-counts, in the direction
      // qualify.js warns about.
      if (effect.annualSaving >= FEE) { sellable++; savings.push(effect.annualSaving); }
    }

    const rate = sellable / subjects.length;
    const projected = Math.round(rate * total);
    allReductions.push(...reductions);
    allCods.push(...cods);
    gTotal += subjects.length; gSellable += sellable; gProjected += projected;
    gA1 += total; gCapArtifact += capArtifact;

    console.log(
      `${String(cad_id).padStart(3, '0')} ${String(total).padStart(12)} ${String(subjects.length).padStart(8)} ` +
      `${String(noComps).padStart(9)} ${String(noCase).padStart(8)} ${String(capAbs).padStart(8)} ` +
      `${String(filable).padStart(8)} ${String(clearsCap).padStart(11)} ${String(sellable).padStart(9)} ` +
      `${pct(sellable, subjects.length).padStart(6)} ${projected.toLocaleString().padStart(12)}`);

    if (reductions.length) {
      const mc = med(cods);
      console.log(`     measured reduction on filable cases: median ${(med(reductions) * 100).toFixed(1)}%  ` +
        `p25 ${(pctile(reductions, 0.25) * 100).toFixed(1)}%  p75 ${(pctile(reductions, 0.75) * 100).toFixed(1)}%  ` +
        `| median saving (UPPER BOUND) $${med(savings) ? Math.round(med(savings)).toLocaleString() : '—'}`);
      // Deliberately NOT compared against 15. See the note on cod() above: this
      // is comp-set dispersion and the IAAO benchmark does not apply to it.
      console.log(`     dispersion inside the comp sets (NOT the IAAO COD): ${mc === null ? '—' : mc.toFixed(1)}`);
    }
  }

  console.log('─'.repeat(112));
  console.log(`TOTAL ${gA1.toLocaleString().padStart(10)} ${String(gTotal).padStart(8)} ` +
    `${''.padStart(9)} ${''.padStart(8)} ${''.padStart(8)} ${''.padStart(8)} ${''.padStart(11)} ` +
    `${String(gSellable).padStart(9)} ${pct(gSellable, gTotal).padStart(6)} ${gProjected.toLocaleString().padStart(12)}`);

  // ── THE FINDING THAT MATTERS MOST ─────────────────────────────────────────
  const m = med(allReductions);
  console.log(`\n── MEASURED REDUCTION vs THE PLACEHOLDER IN qualify.js`);
  console.log(`   qualify.js assumes a plausible reduction of ${(PLAUSIBLE_REDUCTION_PCT * 100).toFixed(0)}%.`);
  if (m === null) {
    console.log('   No filable cases in the sample — nothing to compare.');
  } else {
    console.log(`   The comp sets actually indicate a median of ${(m * 100).toFixed(1)}%  ` +
      `(p25 ${(pctile(allReductions, 0.25) * 100).toFixed(1)}%, p75 ${(pctile(allReductions, 0.75) * 100).toFixed(1)}%), n=${allReductions.length}.`);
    const drift = Math.abs(m - PLAUSIBLE_REDUCTION_PCT) / PLAUSIBLE_REDUCTION_PCT;
    if (drift > 0.25) {
      console.log(`\n   ⚠️  That is ${(drift * 100).toFixed(0)}% away from the placeholder. Every saving figure`);
      console.log(`       quoted from qualify.js is wrong in a KNOWABLE direction. Move`);
      console.log(`       PLAUSIBLE_REDUCTION_PCT to ${(m).toFixed(3)} before anyone is charged.`);
    } else {
      console.log(`   Within 25% of the placeholder — the guess holds. Worth replacing with`);
      console.log(`   the measured figure anyway, so the constant stops being a guess.`);
    }
  }

  // ── DOES OUR REDUCTION MATCH THE DISTRICT'S OWN DISPERSION? ──────────────
  const mc = med(allCods);
  if (m !== null && mc !== null) {
    console.log(`\n── CONSISTENCY CHECK`);
    console.log(`   Median dispersion inside our comp sets: ${mc.toFixed(1)}  (not the IAAO COD)`);
    console.log(`   Median indicated reduction:      ${(m * 100).toFixed(1)}%`);
    const ratio = (m * 100) / mc;
    if (ratio > 1.6) {
      console.log(`\n   ⚠️  The reduction is ${ratio.toFixed(1)}x the dispersion. It should be close to 1x.`);
      console.log(`       We are indicating cuts larger than the spread of the district's own`);
      console.log(`       values, which is not a windfall — it means the comp sets contain`);
      console.log(`       properties that are not really comparable. Investigate before filing.`);
    } else {
      console.log(`   Ratio ${ratio.toFixed(2)}x — consistent. The reduction is tracking the district's`);
      console.log(`   own spread rather than an artefact of comp selection.`);
    }
    // The IAAO comparison used to live here, run against `mc`. It was wrong:
    // `mc` is comp-set dispersion and the benchmark is defined over a
    // population. Whether a district clears the standard is answered by
    // scripts/tx/county-stats.mjs, which measures whole neighbourhoods.
    console.log(`\n   For whether this district clears the IAAO residential standard of 15,`);
    console.log(`   see scripts/tx/county-stats.mjs — that is a different measurement and`);
    console.log(`   it is the only one that may be quoted publicly.`);
  }

  console.log(`\n── HONEST CAVEATS`);
  console.log(`   • Dollar savings are UPPER BOUNDS. tx_parcel_entities is empty, so exemptions`);
  console.log(`     are not modelled and the $140,000 school homestead exemption is not subtracted.`);
  console.log(`     The SELLABLE column therefore OVER-counts. Reduction percentages do not have`);
  console.log(`     this problem — both sides come from the district's own roll.`);
  if (gCapArtifact) {
    console.log(`   • ${gCapArtifact} filable cases rest on the capped basis only (cap_artifact) and are`);
    console.log(`     the most likely to be rebutted. They are counted in SELLABLE. Decide`);
    console.log(`     deliberately whether to sell them, and if so, at what confidence.`);
  }
  console.log(`   • Projected counts extrapolate the sampled rate to the full county. At`);
  console.log(`     ${SAMPLE}/county the margin is roughly ±3 points; raise --sample before`);
  console.log(`     putting these numbers in a plan.`);
} finally {
  await client.end();
}
