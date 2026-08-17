#!/usr/bin/env node
/**
 * Load the Texas parcel CSVs into Postgres using real COPY.
 *
 *   node scripts/tx/push.mjs --schema        # create tables (prompts for the URL)
 *   node scripts/tx/push.mjs                 # load every CSV under tx-data/
 *   node scripts/tx/push.mjs --county Nueces # just one
 *   node scripts/tx/push.mjs --indexes       # AFTER loading
 *   node scripts/tx/push.mjs --verify        # counts + the comp query
 *
 * ============================================================================
 * WHY THIS EXISTS INSTEAD OF psql
 * ============================================================================
 * The runbook originally said `psql`. Checking Nathan's machine first showed
 * psql is not installed and Homebrew is not either, so "brew install libpq"
 * would have been the second failure rather than the fix. This needs no system
 * package at all — the repo is already Node.
 *
 * ============================================================================
 * WHY NOT @supabase/supabase-js, WHICH IS ALREADY A DEPENDENCY
 * ============================================================================
 * Because it speaks PostgREST, and the Florida loader records what that costs:
 * "A single county NAL runs to hundreds of thousands of rows. Driving that
 * through an ORM or the Supabase REST client takes tens of minutes and fails
 * halfway on a network blip, leaving a partial load with no clean resume."
 *
 * START_HERE also records that PostgREST silently TRUNCATES large reads unless
 * every query carries .range() — a defect that made settled orders look unpaid.
 * A bulk load is the last place to accept a client that can quietly return less
 * than you asked for.
 *
 * COPY streams the whole county in one transaction. It either lands or it does
 * not, and a failure rolls back cleanly rather than leaving a partial county.
 *
 * ============================================================================
 * INSTALL — DELIBERATELY --no-save
 * ============================================================================
 *   npm install pg pg-copy-streams --no-save
 *
 * --no-save leaves package.json and package-lock.json untouched, so Vercel never
 * installs these and the production build is byte-identical. Florida's window
 * opens in days; a bulk-load tool has no business changing what deploys.
 *
 * The cost is that `npm ci` wipes them. That is the right trade, and the error
 * below tells you the exact command to get them back.
 */

import { createReadStream, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { basename, join } from 'node:path';

let pg, copyFrom;
try {
  pg = (await import('pg')).default;
  copyFrom = (await import('pg-copy-streams')).from;
} catch {
  console.error('✗ Missing the Postgres driver. Install it without touching package.json:\n');
  console.error('    npm install pg pg-copy-streams --no-save\n');
  console.error('  --no-save is deliberate: it keeps these out of package.json so Vercel');
  console.error('  never installs them and the production build is unchanged.');
  process.exit(2);
}

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

/**
 * Ask for the connection string, with the typing hidden.
 *
 * WHY THIS PROMPTS INSTEAD OF REQUIRING AN ENV VAR.
 *
 * The first version said "set PGURL first", and the instructions to do that were
 * a two-line shell block:
 *
 *     read -rs PGURL
 *     export PGURL
 *
 * Pasted as a block, the shell hands the SECOND line to `read` as its input. So
 * PGURL becomes the literal string "export PGURL", the export never runs, and
 * the script reports "no connection string" while a variable called PGURL
 * plainly exists. START_HERE already records this exact trap costing an hour
 * once, presenting as a bad password — and it happened again anyway, because a
 * documented hazard in a runbook does not stop someone pasting two lines at once.
 *
 * The fix is not a better warning. It is not needing the incantation: ask here,
 * read from the TTY with echo off, and let the env var remain an option for
 * automation rather than a prerequisite for a human.
 */
async function promptSecret(question) {
  if (!process.stdin.isTTY) return null;
  process.stdout.write(question);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Suppressing echo by redrawing the prompt on every keystroke (the first
  // attempt) fights readline: the prompt printed twice and the paste was lost.
  // Overriding _writeToOutput is the approach that actually works — readline
  // still collects every character, it just writes none of them.
  rl._writeToOutput = () => {};
  try {
    const answer = await new Promise((res) => rl.question('', res));
    return (answer || '').trim();
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}

/**
 * Build a connection string from .env.local when one is already there.
 *
 * Supabase's REST credentials (SUPABASE_URL + SUPABASE_SERVICE_KEY) are already
 * in this repo's .env.local and already working — the app uses them every day.
 * They are NOT enough for a direct Postgres connection, because the database
 * password is a separate secret. But if someone has previously stored a real
 * connection string there, use it and skip the prompt entirely.
 */
function urlFromEnvFile() {
  try {
    const txt = readFileSync('.env.local', 'utf8');
    for (const key of ['PGURL', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL']) {
      const m = txt.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)`, 'm'));
      if (m && /^postgres(ql)?:\/\//.test(m[1])) return m[1].trim();
    }
  } catch { /* no .env.local, fine */ }
  return null;
}

let url = process.env.PGURL || process.env.DATABASE_URL || urlFromEnvFile();

// A PGURL that is not a connection string is worse than none: it fails deep
// inside the driver with a confusing message. Catch it here, name it, move on.
if (url && !/^postgres(ql)?:\/\//.test(url)) {
  console.error(`⚠️  PGURL is set but does not look like a connection string.`);
  console.error(`   It should start with postgresql:// — ignoring it and asking instead.\n`);
  url = null;
}

if (!url) {
  console.log('No connection string found in the environment or .env.local.\n');
  console.log('Supabase -> Connect -> Session pooler (NOT transaction pooler: COPY needs');
  console.log('a session, and the transaction pooler drops you mid-load). Replace the');
  console.log('[YOUR-PASSWORD] placeholder with your database password.\n');
  console.log('TIP: to avoid pasting this every time, add one line to .env.local:');
  console.log('     PGURL=postgresql://...\n');
  url = await promptSecret('Paste the connection string (nothing will appear): ');
}

if (!url) {
  console.error('\n✗ No connection string given.');
  process.exit(2);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error('\n✗ That does not start with postgresql:// — nothing was sent anywhere.');
  process.exit(2);
}
if (/\[YOUR-PASSWORD\]/i.test(url)) {
  console.error('\n✗ The string still contains the [YOUR-PASSWORD] placeholder.');
  console.error('  Supabase shows it that way; replace it with your database password.');
  process.exit(2);
}

const COLS = ['cad_id','account_number','tax_year','market_value','appraised_value',
  'homestead_cap_loss','nhs_cap_loss','land_value','improvement_value','living_area',
  'year_built','quality_class','land_size_acres','land_size_sqft','neighborhood_code',
  'abs_subdv_cd','state_class_code','situs_street','situs_city','situs_zip',
  'has_homestead','arb_protest_flag','source_format'];

/**
 * SSL is required by Supabase and impossible on a local socket, so it cannot be
 * hardcoded either way. The first version forced it on unconditionally and
 * failed immediately against a local Postgres with "The server does not support
 * SSL connections" — which would also be the error anyone gets pointing this at
 * a self-hosted or containerised database.
 *
 * rejectUnauthorized:false is needed for Supabase specifically: the pooler
 * presents a certificate Node's default trust store does not carry. That is
 * acceptable here because the connection string itself is the secret and the
 * data is public appraisal records — but it is why this is scoped to remote
 * hosts rather than applied blindly.
 */
const isLocal = /localhost|127\.0\.0\.1|host=\/|^postgres(ql)?:\/\/[^@]*@\//.test(url)
  || process.env.PGSSL === 'disable';
const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
await client.connect();
const t0 = Date.now();

try {
  if (has('schema')) {
    console.log('Creating tables from scripts/tx/schema.sql');
    await client.query(readFileSync('scripts/tx/schema.sql', 'utf8'));
    const { rows } = await client.query(
      `select table_name from information_schema.tables where table_name like 'tx_%' order by 1`);
    console.log('  tables now present: ' + rows.map(r => r.table_name).join(', '));
  }

  if (has('indexes')) {
    console.log('Building indexes (this takes a minute)');
    await client.query(readFileSync('scripts/tx/indexes.sql', 'utf8'));
    const { rows } = await client.query(
      `select indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) sz
       from pg_stat_user_indexes where relname='tx_parcels' order by pg_relation_size(indexrelid) desc`);
    for (const r of rows) console.log(`  ${r.indexrelname.padEnd(32)} ${r.sz}`);
  }

  if (has('cases')) {
    // THE COMMERCIAL QUESTION. How many parcels actually have a § 41.43(b)(3)
    // case that is worth selling?
    //
    // Four filters, and the order matters because each one removes people the
    // previous one would have sold to:
    //   1. the neighbourhood must be big enough for a median to mean anything
    //   2. the subject must sit ABOVE that median (the statutory claim)
    //   3. the indicated reduction must CLEAR the cap (or the bill cannot move)
    //   4. what is left must be worth more than the fee
    //
    // Half of everything is above its own median by definition, so step 2 is a
    // sanity check on the query rather than a finding. Steps 3 and 4 are where
    // the real filtering happens.
    const MIN_HOOD = Number(arg('min-hood', '25'));
    const RATE = Number(arg('rate', '0.022'));
    const FEE = Number(arg('fee', '89'));
    const { rows } = await client.query(`
      with base as (
        select cad_id, neighborhood_code, state_class_code, appraised_value, living_area,
               homestead_cap_loss + nhs_cap_loss as cap_gap,
               appraised_value::numeric/nullif(living_area,0) ppsf
        from tx_parcels
        where living_area > 200 and appraised_value > 0 and neighborhood_code is not null),
      hood as (
        select cad_id, neighborhood_code, state_class_code, count(*) n,
               percentile_cont(0.5) within group (order by ppsf) med
        from base group by 1,2,3),
      j as (
        select b.*, h.n, (b.ppsf - h.med) * b.living_area indicated
        from base b join hood h using (cad_id, neighborhood_code, state_class_code)
        where h.n >= $1)
      select cad_id,
        count(*)::int usable,
        count(*) filter (where indicated > 0)::int above_median,
        count(*) filter (where indicated > cap_gap)::int clears_cap,
        count(*) filter (where indicated > cap_gap and (indicated-cap_gap)*$2 > $3)::int sellable,
        round(100.0*count(*) filter (where indicated > cap_gap and (indicated-cap_gap)*$2 > $3)/count(*),1) pct,
        round(avg((indicated-cap_gap)*$2) filter (where indicated > cap_gap and (indicated-cap_gap)*$2 > $3))::int avg_saving
      from j group by cad_id order by usable desc`, [MIN_HOOD, RATE, FEE]);

    console.log(`\nADDRESSABLE MARKET — neighbourhoods of ${MIN_HOOD}+, ${(RATE*100).toFixed(1)}% rate, $${FEE} fee\n`);
    console.log('cad_id   usable  >median  clears cap  sellable    pct   avg saving');
    console.log('-'.repeat(68));
    let t = { usable: 0, sellable: 0 };
    for (const r of rows) {
      t.usable += r.usable; t.sellable += r.sellable;
      console.log(`${String(r.cad_id).padEnd(7)}${r.usable.toLocaleString().padStart(8)}`
        + `${r.above_median.toLocaleString().padStart(9)}${r.clears_cap.toLocaleString().padStart(12)}`
        + `${r.sellable.toLocaleString().padStart(10)}${(r.pct+'%').padStart(7)}`
        + `${('$'+r.avg_saving.toLocaleString()).padStart(13)}`);
    }
    console.log('-'.repeat(68));
    console.log(`TOTAL  ${t.usable.toLocaleString().padStart(8)}${''.padStart(21)}`
      + `${t.sellable.toLocaleString().padStart(10)}${((t.sellable/t.usable*100).toFixed(1)+'%').padStart(7)}`);
    console.log(`\n⚠️  avg saving uses a ${(RATE*100).toFixed(1)}% placeholder rate and IGNORES exemptions,`);
    console.log(`   so it is an UPPER bound. The $140,000 school homestead exemption will pull`);
    console.log(`   it down. Real figures need tx_parcel_entities populated.`);

    // How much of the market the neighbourhood-size floor is costing us.
    const thin = await client.query(`
      with base as (select cad_id, neighborhood_code, state_class_code from tx_parcels
                    where living_area>200 and appraised_value>0 and neighborhood_code is not null),
      hood as (select cad_id,neighborhood_code,state_class_code,count(*) n from base group by 1,2,3)
      select b.cad_id, count(*) filter (where h.n < $1)::int too_thin, count(*)::int total
      from base b join hood h using (cad_id,neighborhood_code,state_class_code)
      group by b.cad_id order by too_thin desc`, [MIN_HOOD]);
    console.log(`\nPARCELS IN NEIGHBOURHOODS TOO SMALL FOR A MEDIAN (< ${MIN_HOOD}):`);
    for (const r of thin.rows)
      console.log(`  cad_id ${r.cad_id}: ${r.too_thin.toLocaleString()} of ${r.total.toLocaleString()}`
        + ` (${(r.too_thin/r.total*100).toFixed(1)}%) — these need the subdivision/market-area fallback`);
  }

  if (!has('schema') && !has('indexes') && !has('verify') && !has('cases')) {
    const only = arg('county');
    const files = readdirSync('tx-data', { withFileTypes: true })
      .filter(d => d.isDirectory() && (!only || d.name.toLowerCase() === only.toLowerCase()))
      .flatMap(d => readdirSync(join('tx-data', d.name))
        .filter(f => f.endsWith('_parcels.csv'))
        .map(f => join('tx-data', d.name, f)));

    if (!files.length) { console.error('✗ No *_parcels.csv found under tx-data/'); process.exit(1); }

    let grand = 0;
    for (const f of files) {
      const cad = Number(readFileSync(f, 'utf8').split('\n', 2)[1].split(',')[0].replace(/"/g, ''));
      // Re-loading must be idempotent. The primary key is
      // (cad_id, account_number, tax_year), so clearing this district first makes
      // a re-run replace rather than collide — and a collision mid-COPY would
      // roll the whole county back with a message about a duplicate key that
      // tells you nothing about which county it was.
      const del = await client.query('delete from tx_parcels where cad_id = $1', [cad]);
      if (del.rowCount) console.log(`  cleared ${del.rowCount.toLocaleString()} existing rows for cad_id ${cad}`);

      process.stdout.write(`  ${basename(f).padEnd(30)} `);
      const stream = client.query(copyFrom(
        `COPY tx_parcels (${COLS.join(',')}) FROM STDIN WITH (FORMAT csv, HEADER true)`));
      await pipeline(createReadStream(f), stream);
      const { rows } = await client.query('select count(*)::int n from tx_parcels where cad_id=$1', [cad]);
      console.log(`${rows[0].n.toLocaleString().padStart(9)} rows`);
      grand += rows[0].n;
    }
    console.log(`\n  ${grand.toLocaleString()} rows in tx_parcels`);
  }

  if (has('verify')) {
    const { rows } = await client.query(`
      select cad_id, count(*)::int rows,
             count(*) filter (where homestead_cap_loss>0 or nhs_cap_loss>0)::int capped,
             round(100.0*count(*) filter (where homestead_cap_loss>0 or nhs_cap_loss>0)/count(*),1) pct_capped,
             count(distinct neighborhood_code)::int hoods,
             round(avg(living_area))::int avg_sqft
      from tx_parcels group by cad_id order by rows desc`);
    console.log('\ncad_id     rows    capped  pct_capped  hoods  avg_sqft');
    console.log('-'.repeat(56));
    for (const r of rows)
      console.log(`${String(r.cad_id).padEnd(7)}${r.rows.toLocaleString().padStart(8)}`
        + `${r.capped.toLocaleString().padStart(10)}${String(r.pct_capped).padStart(11)}%`
        + `${String(r.hoods).padStart(7)}${String(r.avg_sqft).padStart(10)}`);
    console.log('\nExpected pct_capped, computed independently by the loader:');
    console.log('  178 Nueces 24.4 | 123 Jefferson 31.5 | 129 Kaufman 14.9 | 221 Taylor 18.5 | 243 Wichita 13.2');

    // The whole product, in one query: does an equal-and-uniform case exist?
    const comp = await client.query(`
      with subject as (
        select * from tx_parcels
        where cad_id=178 and neighborhood_code='G100'
          and living_area between 1400 and 1600 and year_built is not null
        limit 1)
      select s.account_number subject, s.living_area, s.appraised_value,
             count(c.*)::int comps,
             round(percentile_cont(0.5) within group (order by c.appraised_value::numeric/nullif(c.living_area,0)))::int median_ppsf,
             round(s.appraised_value::numeric/nullif(s.living_area,0))::int subject_ppsf
      from subject s
      join tx_parcels c on c.cad_id=s.cad_id and c.tax_year=s.tax_year
        and c.neighborhood_code=s.neighborhood_code and c.state_class_code=s.state_class_code
        and c.account_number<>s.account_number
        and c.living_area between s.living_area*0.8 and s.living_area*1.2
        and c.year_built between s.year_built-10 and s.year_built+10
      group by s.account_number, s.living_area, s.appraised_value, s.year_built`);
    if (comp.rows.length) {
      const r = comp.rows[0];
      console.log(`\nEQUAL-AND-UNIFORM TEST — Nueces neighbourhood G100`);
      console.log(`  subject ${r.subject}: ${r.living_area} sqft, appraised $${Number(r.appraised_value).toLocaleString()}`);
      console.log(`  ${r.comps} comparable properties, same neighbourhood code, +/-20% size, +/-10 years`);
      console.log(`  median comp $${r.median_ppsf}/sqft vs subject $${r.subject_ppsf}/sqft`);
      console.log(r.subject_ppsf > r.median_ppsf
        ? `  -> subject is appraised ABOVE the median. This parcel has a § 41.43(b)(3) case.`
        : `  -> subject is at or below the median. No unequal-appraisal case for this one.`);
    } else {
      console.log('\n✗ comp query returned nothing — check that Nueces loaded.');
    }
  }
} finally {
  await client.end();
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
