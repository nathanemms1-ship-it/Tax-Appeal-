#!/usr/bin/env node
/**
 * ============================================================================
 * COUNTY STATISTICS — the facts that make each Texas page worth reading
 * ============================================================================
 *
 *   node scripts/tx/county-stats.mjs            recompute every loaded county
 *   node scripts/tx/county-stats.mjs --cad=178  one county
 *   node scripts/tx/county-stats.mjs --dry      print, write nothing
 *
 * Writes lib/tx/countyStats.json, which pages/counties/[slug].js renders.
 *
 * ============================================================================
 * WHY A FILE AND NOT A QUERY
 * ============================================================================
 * The county template renders 480 pages. Querying Supabase in getStaticProps
 * would put a network call on every one of them at build time, and the sitemap
 * verifier runs under plain Node where a database client is not available.
 *
 * lib/contentRevised.js already established this pattern for the same reason —
 * it is a hand-declared constant precisely so lib/sitemapUrls.js can be imported
 * by scripts/verify-sitemap.mjs without booting Next.
 *
 * A committed JSON file also means the numbers are **reviewable in a diff**. If a
 * county's capped share moves from 24.4% to 61%, that shows up in the pull
 * request rather than silently on 254 live pages.
 *
 * ============================================================================
 * EXACT FACTS ONLY. NOTHING MODELLED.
 * ============================================================================
 * Every figure here is computed in SQL directly over the district's own
 * certified roll. There are no estimates, no assumed tax rates, no projected
 * savings and no sampling.
 *
 * That restraint is the point. This content exists to be cited — by a homeowner,
 * a journalist, possibly an ARB panel — and one modelled number in the middle of
 * it would put every other number in question. The estimates live in
 * lib/tx/qualify.js where they are labelled as estimates and never leave the
 * funnel.
 *
 * If a future version wants "typical reduction", it must run the real comp
 * selector over a sample, report the sample size on the page, and store it under
 * a key that says so. Do not derive it from COD because the two correlate.
 * Measuring and inferring are different things and a reader cannot tell them
 * apart once they are printed in the same typeface.
 *
 * ============================================================================
 * PAGES FOLLOW DATA. NEVER THE REVERSE.
 * ============================================================================
 * Only counties present in tx_parcels get an entry. A county with no roll loaded
 * gets no entry, and the page renders exactly as it does today. There is no
 * placeholder, no "data coming soon", no county-average stand-in.
 *
 * 254 pages carrying invented or borrowed statistics is precisely the
 * scaled-content pattern Google's spam policy targets, and it would also be
 * dishonest. The whole argument for this work is that the numbers are real.
 */

import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

const YEAR = Number(arg('year', 2026));
const CLASS_PREFIX = arg('class', 'A1');
const OUT = 'lib/tx/countyStats.json';

// ── connection (same idiom as push.mjs / sellable.mjs) ─────────────────────
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

/**
 * One query per county. Every number is an aggregate over the roll.
 *
 * ============================================================================
 * VALUE DISPERSION — and why this is NOT called a COD
 * ============================================================================
 * `valueDispersion` is: within each neighbourhood, the mean absolute deviation
 * of APPRAISED VALUE PER SQUARE FOOT from that neighbourhood's median, over that
 * median, as a percentage. The county figure is the median across
 * neighbourhoods, so one enormous neighbourhood cannot drown out fifty small
 * ones.
 *
 * An earlier version of this file called that number a coefficient of dispersion
 * and compared it against the IAAO residential standard of 15. Both were wrong,
 * and the mistake would have gone onto public pages.
 *
 * The IAAO Standard on Ratio Studies computes its COD over ASSESSMENT-TO-SALE-
 * PRICE RATIOS — "dividing the appraised value by the sale price forms the
 * ratios" — and the COD is the average percentage deviation of THOSE RATIOS from
 * their median. It is a measure of appraisal ACCURACY: how close the district's
 * values sit to what properties actually sell for.
 *
 * We have no sale prices. Texas is a non-disclosure state; that absence is the
 * founding constraint of this whole product. So we cannot compute a ratio study,
 * we cannot compute a COD, and we must not print a number next to the IAAO
 * benchmark as though we had. (The standard's residential range is also 5.0–15.0
 * for older heterogeneous areas and 5.0–10.0 for newer homogeneous ones — not the
 * single line of 15 the old comment implied.)
 *
 * WHAT WE MEASURE IS STILL WORTH MEASURING, AND ARGUABLY MORE RELEVANT.
 * Tex. Tax Code § 41.43(b)(3) does not ask whether a district's values track the
 * market. It asks whether a property is appraised equally with comparable
 * properties — the district's values against EACH OTHER. That is precisely what
 * dispersion of appraised value per square foot within a neighbourhood measures,
 * and it needs no sale prices to compute. It is the right statistic for the
 * statute we actually file under. It simply is not the IAAO's statistic, and it
 * gets its own name so nobody can conflate them again.
 *
 * A REAL RATIO STUDY FOR TEXAS ALREADY EXISTS, from the Comptroller's Property
 * Value Study, which has access to sales and to independent appraisals. If a page
 * ever needs to say "this district is outside the IAAO standard", that claim must
 * be sourced to the PVS and cited, never derived here.
 *
 * ── The other dispersion figure in this codebase ────────────────────────────
 * scripts/tx/sellable.mjs computes the same formula over a COMP SET, which
 * comps.js has already filtered to a narrow size, age and land-share band around
 * one subject. That filtering is what makes it tight, so it runs several points
 * below this one and is a diagnostic only. Measured over the five loaded
 * counties:
 *
 *   cad 123 Jefferson   comp-set  9.9   neighbourhood 12.8
 *   cad 129 Kaufman     comp-set  1.6   neighbourhood  9.3
 *   cad 178 Nueces      comp-set  6.5   neighbourhood 12.3
 *   cad 221 Taylor      comp-set 10.1   neighbourhood 15.5
 *   cad 243 Wichita     comp-set  8.0   neighbourhood 12.2
 *
 * The `compSetCod` values in REDUCTION_BY_CAD in lib/tx/qualify.js are the
 * left-hand column. Only this file's figure is publishable, and only under its
 * own name.
 *
 * Neighbourhoods below MIN_HOOD parcels are excluded from the dispersion figure
 * only. A dispersion measure over three houses is noise, and Jefferson has 4,780
 * neighbourhoods at a median of five parcels — including them would produce a
 * number that says more about small samples than about the district.
 */
const MIN_HOOD = 10;

const STATS_SQL = `
with base as (
  select *
    from tx_parcels
   where cad_id = $1
     and tax_year = $2
     and state_class_code like $3
     and living_area > 0
     and appraised_value > 0
),
psf as (
  select neighborhood_code,
         appraised_value::numeric / living_area as v
    from base
   where neighborhood_code is not null
),
hood as (
  select neighborhood_code,
         count(*)::int                                            as n,
         percentile_cont(0.5) within group (order by v)            as med
    from psf
   group by 1
  having count(*) >= ${MIN_HOOD}
),
hood_dispersion as (
  select h.neighborhood_code,
         100.0 * avg(abs(p.v - h.med)) / nullif(h.med, 0) as dispersion
    from psf p
    join hood h using (neighborhood_code)
   group by h.neighborhood_code, h.med
)
select
  (select count(*) from base)::int                                          as parcels,
  (select count(*) from base
    where coalesce(homestead_cap_loss,0) + coalesce(nhs_cap_loss,0) > 0)::int as capped,
  (select count(distinct neighborhood_code) from base
    where neighborhood_code is not null)::int                                as neighborhoods,
  (select percentile_cont(0.5) within group (order by market_value) from base)    as median_market_value,
  (select percentile_cont(0.5) within group (order by living_area)  from base)    as median_living_area,
  (select percentile_cont(0.5) within group (order by year_built)   from base
    where year_built between 1850 and ${YEAR})                                    as median_year_built,
  (select percentile_cont(0.5) within group (order by dispersion) from hood_dispersion) as dispersion,
  (select count(*) from hood_dispersion)::int                                          as dispersion_hoods
`;

const round = (v, dp = 1) => (v === null || v === undefined ? null : Number(Number(v).toFixed(dp)));

try {
  const { rows: counties } = await client.query(
    `select cad_id, count(*)::int n
       from tx_parcels
      where tax_year = $1 ${arg('cad') ? 'and cad_id = ' + Number(arg('cad')) : ''}
      group by 1 order by 1`, [YEAR]);

  if (!counties.length) {
    console.error(`No tx_parcels rows for tax year ${YEAR}. Nothing to compute.`);
    process.exit(1);
  }

  // Preserve counties already in the file that we are not recomputing, so a
  // --cad run does not silently delete the other 253.
  let existing = {};
  try { existing = JSON.parse(readFileSync(OUT, 'utf8')).counties || {}; } catch { /* first run */ }

  const out = { ...existing };
  console.log(`\nCOUNTY STATISTICS — tax year ${YEAR}, class ${CLASS_PREFIX}*\n`);

  for (const { cad_id } of counties) {
    const { rows: [r] } = await client.query(STATS_SQL, [cad_id, YEAR, `${CLASS_PREFIX}%`]);
    if (!r || !r.parcels) { console.log(`  ${cad_id}: no ${CLASS_PREFIX} parcels, skipped`); continue; }

    const stats = {
      taxYear: YEAR,
      stateClass: CLASS_PREFIX,
      parcels: r.parcels,
      cappedParcels: r.capped,
      cappedPct: round((r.capped / r.parcels) * 100),
      neighborhoods: r.neighborhoods,
      medianMarketValue: r.median_market_value === null ? null : Math.round(r.median_market_value),
      medianLivingArea: r.median_living_area === null ? null : Math.round(r.median_living_area),
      medianYearBuilt: r.median_year_built === null ? null : Math.round(r.median_year_built),
      // Null rather than 0 when no neighbourhood cleared MIN_HOOD. A county with
      // no measurable uniformity must render nothing, not "0.0", which would read
      // as perfect uniformity — the exact opposite of what it means.
      // NOT a COD. See the note above: no sale prices exist, so no ratio study
      // is possible. This is dispersion of the district's own appraised value
      // per square foot within a neighbourhood.
      valueDispersion: r.dispersion === null ? null : round(r.dispersion),
      dispersionNeighborhoods: r.dispersion_hoods,
      dispersionMinHoodSize: MIN_HOOD,
      computedAt: new Date().toISOString().slice(0, 10),
    };
    out[String(cad_id)] = stats;

    console.log(
      `  cad ${String(cad_id).padStart(3, '0')}  ` +
      `${String(stats.parcels).padStart(7)} parcels  ` +
      `capped ${String(stats.cappedPct).padStart(5)}%  ` +
      `dispersion ${stats.valueDispersion === null ? '    —' : stats.valueDispersion.toFixed(1).padStart(5)}  ` +
      `median $${(stats.medianMarketValue || 0).toLocaleString()}`
    );
  }

  const payload = {
    _comment: 'Generated by scripts/tx/county-stats.mjs. Do not hand-edit — rerun the script.',
    generatedAt: new Date().toISOString().slice(0, 10),
    counties: out,
  };

  if (has('dry')) {
    console.log(`\n--dry: ${Object.keys(out).length} counties computed, ${OUT} not written.\n`);
  } else {
    writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
    console.log(`\n✓ wrote ${OUT} — ${Object.keys(out).length} counties\n`);
    console.log('  Review the diff before committing. These numbers go on public pages.\n');
  }
} finally {
  await client.end();
}
