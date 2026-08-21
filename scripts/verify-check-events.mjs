#!/usr/bin/env node
/**
 * BEHAVIOURAL TESTS for funnel outcome capture — added 21 Aug 2026.
 *
 * ============================================================================
 * WHY THIS FILE IS NECESSARY AND WHY IT LOOKS LIKE THIS
 * ============================================================================
 * Everything it guards fails SILENTLY. lib/recordCheck.js swallows every error
 * by design, because a counter must never break the most important endpoint in
 * the product. So a regression anywhere in this feature produces: a build that
 * passes, a /check that answers correctly, and a Funnel tab that is empty or
 * subtly wrong — with no error raised anywhere. Nothing else in the system will
 * report it.
 *
 * ASSERTIONS ARE RUN, NOT MATCHED, wherever running them is possible. Asserting
 * that a file contains the string "cap_absorbs_everything" would pass while the
 * branch that emits it was misgrouped. So the vocabulary is lifted out of the
 * REAL source of the reasons — qualify.js, parcels.js, check.js — and compared
 * against the real vocabulary module; and the SQL's own outcome lists are parsed
 * back out of the migration and compared to the JavaScript groups.
 *
 * Every guard below was proven by reintroducing the defect it targets and
 * confirming it fails. The injections are named in each block.
 *
 * ============================================================================
 * THE FAILURE THIS WHOLE FEATURE IS A RESPONSE TO
 * ============================================================================
 * waitlist.blocked_reason had a database CHECK constraint listing permitted
 * reasons. lib/waitlistReasons.js grew a third; the constraint did not. Every
 * insert carrying it failed, silently, and the leads were lost — the Save Our
 * Homes bucket, plausibly the largest capture category on the site. Third
 * recurrence of the same shape. The stated durable fix was to compare the code
 * list against the database, which the build cannot do because it has no
 * database connection.
 *
 * check_events therefore has NO constraint, and this file is the enforcement
 * instead: it runs where the build already runs, it compares code to code, and
 * it cannot lose a row when it is wrong.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

/**
 * The resolver hook, registered for ONE reason: lib/recordCheck.js.
 *
 * This file was written without it, so it would run on a fresh clone with no
 * node_modules — the reasoning being that a guard which only runs after a full
 * install is a guard that gets skipped. That was the right instinct and the
 * wrong trade here. The build-writes-rows defect on 21 Aug got past a purely
 * textual guard set, and the only assertion that would have caught it is one
 * that CALLS recordCheckOutcome and watches whether it reaches fetch. Doing that
 * means importing a module whose own imports are extensionless, which needs this
 * hook.
 *
 * lib/checkOutcomes.js is still dependency-free and imported directly.
 * `npm run build` installs before it verifies, so nothing is skipped in
 * practice.
 */
register('./resolve-extensionless.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0;
const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

const outcomes = await import('../lib/checkOutcomes.js');
const { OUTCOMES, outcomeGroup, isKnownOutcome, REFUSAL_OUTCOMES, ELIGIBLE_OUTCOMES } = outcomes;

const qualifySrc = read('lib/dor/qualify.js');
const parcelsSrc = read('lib/dor/parcels.js');
const apiSrc = read('pages/api/check.js');
const recordSrc = read('lib/recordCheck.js');
const sqlSrc = read('scripts/sql/check_events.sql');
const rosterSrc = read('pages/api/check-roster.js');
const adminSrc = read('pages/admin.js');
const healthSrc = read('lib/healthChecks.js');

// ── 1. THE VOCABULARY IS COMPLETE ─────────────────────────────────────────────
/**
 * THE ONE THAT MATTERS. This is the waitlist constraint defect, caught at build
 * time instead of at insert time.
 *
 * Every `reason: '...'` literal in the three files that can produce one is
 * extracted and required to exist in lib/checkOutcomes.js. Add a new refusal
 * branch to qualify.js and forget to name it here, and the build stops — rather
 * than the outcome landing in production as an unrecognised string that falls
 * out of the refusal rate and quietly understates the wall.
 *
 * INJECTION PROVING THIS WORKS: delete `saving_below_cost` from OUTCOMES ->
 * "every reason returned by the check pipeline has an entry in checkOutcomes"
 * FAILS. Add `reason: 'brand_new_refusal'` to qualify.js -> same failure.
 */
const reasonLiterals = new Set();
for (const src of [qualifySrc, parcelsSrc, apiSrc]) {
  for (const m of src.matchAll(/\breason:\s*'([a-z0-9_]+)'/g)) reasonLiterals.add(m[1]);
}
t('reason literals were actually found in the source (the extractor still matches)',
  reasonLiterals.size >= 10);
const missing = [...reasonLiterals].filter((r) => !isKnownOutcome(r));
t(`every reason returned by the check pipeline has an entry in checkOutcomes${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`,
  missing.length === 0);

/**
 * And the reverse: an outcome in the vocabulary that nothing can emit is dead
 * weight that makes the list look more complete than it is. `bad_input` and
 * `error` are synthesised by the handler rather than returned as `reason:`
 * literals, so they are exempt by name.
 */
const SYNTHESISED = new Set(['bad_input', 'error']);
const orphans = Object.keys(OUTCOMES).filter((o) => !reasonLiterals.has(o) && !SYNTHESISED.has(o));
t(`no outcome in the vocabulary is unreachable${orphans.length ? ` — orphaned: ${orphans.join(', ')}` : ''}`,
  orphans.length === 0);

// ── 2. THE GROUPS ARE RIGHT, AND SQL AGREES WITH JAVASCRIPT ───────────────────
/**
 * The refusal rate is the output of this whole feature, and a misgrouped outcome
 * does not error — it moves a customer from one side of that rate to the other.
 *
 * `needs_condition_case` is the one worth naming: it is NOT a refusal. Comps
 * alone fall short but a documented cost to cure may clear it, and the UI routes
 * these to the condition step. 688,497 Florida homes sit in this band, so
 * counting them as refusals would overstate the wall by a wide margin and could
 * talk somebody out of a market that is actually addressable.
 *
 * INJECTION: set needs_condition_case to group 'refused' -> FAILS.
 */
t('the Save Our Homes wall is grouped as a refusal',
  outcomeGroup('cap_absorbs_everything') === 'refused');
t('a rescuable condition case is NOT counted as a refusal',
  outcomeGroup('needs_condition_case') === 'rescuable');
t('an address we hold no parcel for is not counted as a refusal',
  outcomeGroup('no_parcel') === 'no_answer' && outcomeGroup('outside_coverage') === 'no_answer');
t('a failed lookup is not counted as a refusal',
  outcomeGroup('error') === 'no_answer');
t('both sellable outcomes are grouped as eligible',
  outcomeGroup('clearable') === 'eligible' && outcomeGroup('no_cap_differential') === 'eligible');

/**
 * check_events.sql repeats the refusal list inside its aggregate functions,
 * because a SQL function cannot import a JavaScript module. That duplication is
 * a drift risk with no natural alarm, so the lists are parsed back OUT of the
 * migration and compared. This is the same class of bug as the middleware and
 * the purge script disagreeing about what a probe is.
 *
 * INJECTION: drop 'not_residential' from the SQL filter -> FAILS.
 */
const sqlRefusalBlocks = [...sqlSrc.matchAll(/filter \(where e\.outcome in \(([\s\S]*?)\)\)/g)]
  .map((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort().join(','));
t('the SQL aggregates actually contain outcome filters', sqlRefusalBlocks.length >= 2);
const jsRefusals = [...REFUSAL_OUTCOMES].sort().join(',');
const jsEligible = [...ELIGIBLE_OUTCOMES].sort().join(',');
t('every refusal list in the SQL matches REFUSAL_OUTCOMES exactly',
  sqlRefusalBlocks.filter((b) => b !== jsEligible).every((b) => b === jsRefusals));
t('the eligible list in the SQL matches ELIGIBLE_OUTCOMES exactly',
  sqlRefusalBlocks.includes(jsEligible));

// ── 3. NO CHECK CONSTRAINT ON `outcome` ───────────────────────────────────────
/**
 * Adding one looks like an obvious improvement. It is the exact defect that cost
 * this project its largest capture category, and the value of this table is
 * disproportionately in outcomes nobody predicted — which is precisely what a
 * CHECK constraint discards.
 *
 * INJECTION: add `check (outcome in (...))` to the create table -> FAILS.
 */
const createTable = /create table if not exists check_events \(([\s\S]*?)\n\);/.exec(sqlSrc);
t('the check_events migration defines its table', !!createTable);
t('check_events has NO check constraint on outcome — see the waitlist defect',
  !!createTable && !/\bcheck\s*\(/i.test(createTable[1]));
t('the migration explains why there is no constraint, so nobody adds one back',
  /THERE IS DELIBERATELY NO CHECK CONSTRAINT/.test(sqlSrc) && /fl_not_eligible/.test(sqlSrc));

/**
 * PostgREST CACHES THE SCHEMA, AND EVERYTHING HERE GOES THROUGH PostgREST.
 *
 * lib/recordCheck.js POSTs to /rest/v1/check_events; check-roster's rpc() calls
 * resolve through the same layer. Without `notify pgrst, 'reload schema'` the
 * table and all three functions stay invisible to the API despite existing in
 * the database — the failure that cost a live order on 5 Aug 2026 against
 * waitlist.blocked_reason, a column that had been created correctly and was
 * reported as missing.
 *
 * It is worse in this feature than it was there: recordCheck swallows errors by
 * design, so the symptom is an empty Funnel tab, which is indistinguishable from
 * nobody having checked an address.
 *
 * INJECTION: delete the notify line -> FAILS.
 */
t('the migration reloads the PostgREST schema cache',
  /notify pgrst, 'reload schema'/.test(sqlSrc));

/**
 * And it must come after the objects it is announcing. A reload issued before
 * the create statements caches the OLD shape and reads as done.
 */
t('the schema reload runs after the table and functions are created',
  sqlSrc.indexOf("notify pgrst") > sqlSrc.lastIndexOf('create or replace function check_events_'));

/**
 * "applied in 0.4s" proves the transaction committed, not that the thing you
 * wanted exists — and scripts/run-sql.mjs prints whatever the file selects at
 * the end precisely so a migration can prove itself. A migration run against the
 * wrong database is the mistake that looks most like success.
 *
 * INJECTION: delete the trailing select -> FAILS.
 */
t('the migration ends with a verification select that names what it checked',
  /information_schema\.columns/.test(sqlSrc) &&
  /information_schema\.routines/.test(sqlSrc) &&
  /MISSING/.test(sqlSrc) &&
  sqlSrc.lastIndexOf('select') > sqlSrc.indexOf('notify pgrst'));

/**
 * ROW LEVEL SECURITY MUST BE ENABLED BY THE FILE, NOT BY A DASHBOARD CLICK.
 *
 * All 13 pre-existing tables in this database have RLS on (checked 21 Aug 2026).
 * Without this line check_events would be the only one without it, readable by
 * anyone holding the anon key — which ships to every browser that loads the
 * site. Nothing in the table names a person, but it is the entire funnel:
 * refusal rates, county breakdowns, volumes.
 *
 * Supabase's SQL editor offers to enable RLS for you when it sees a bare
 * `create table`. Taking that button secures production and leaves THIS FILE
 * still creating an unprotected table, so any future environment gets the
 * insecure version — the exact shape of the still-open
 * waitlist_blocked_reason.sql defect. The fix belongs in the file.
 *
 * INJECTION: delete the alter line -> FAILS. Move it above the create -> FAILS.
 */
t('the migration enables row level security on check_events',
  /alter table check_events enable row level security;/.test(sqlSrc));
t('RLS is enabled after the table exists',
  sqlSrc.indexOf('alter table check_events enable row level security')
    > sqlSrc.indexOf('create table if not exists check_events'));
/**
 * And the verification select has to prove it, because `alter table ... enable
 * row level security` is a silent no-op shape on a re-run — the file could look
 * correct while the live table was left open.
 */
t('the verification select reports the RLS state rather than assuming it',
  /relrowsecurity/.test(sqlSrc) && /anon key/.test(sqlSrc));

/**
 * And the code half of the same rule: an unrecognised outcome must be WRITTEN,
 * not dropped. Warning and returning early would be the constraint again, in
 * JavaScript, and would throw away the only evidence that the guard above missed
 * something.
 *
 * INJECTION: `if (!isKnownOutcome(outcome)) return 'skipped';` -> FAILS.
 */
t('an unrecognised outcome is still recorded rather than discarded',
  /isKnownOutcome\(outcome\)/.test(recordSrc) &&
  !/if \(!isKnownOutcome\(outcome\)\)[\s\S]{0,120}return /.test(recordSrc) &&
  recordSrc.indexOf('isKnownOutcome(outcome)') < recordSrc.indexOf('rest/v1/check_events'));
t('outcomeGroup resolves an unknown outcome instead of throwing',
  outcomeGroup('something_nobody_wrote_yet') === 'no_answer');

// ── 4. NOTHING IDENTIFYING IS STORED ──────────────────────────────────────────
/**
 * Asserted against the row LITERAL rather than the whole file, exactly as
 * verify-monitoring does for site_visits — so a comment mentioning "email"
 * cannot satisfy it and a real column cannot hide behind one.
 *
 * The check endpoint receives a street address, a ZIP and a city on every call.
 * Any of them landing in this table would turn an aggregate counter into a
 * record of who lives where and what we told them about their house.
 *
 * INJECTION: add `street: street` to the row -> FAILS.
 */
const rowLiteral = /const row = \{([\s\S]*?)\n  \};/.exec(recordSrc);
t('lib/recordCheck defines a row literal', !!rowLiteral);
t('the recorded row carries no address, email, IP or identifier',
  !!rowLiteral &&
  !/^\s*(street|address|zip|city|email|ip|ip_address|user_agent|ua|parcel|parcel_id|owner|just_value|visitor_hash|hash)\s*:/m.test(rowLiteral[1]) &&
  /outcome:/.test(rowLiteral[1]));
t('the county is recorded by NAME, not by DOR number',
  /countyName/.test(apiSrc) && /LOADED_COUNTIES\[no\]/.test(apiSrc));

// ── 5. RECORDING CANNOT BREAK OR SLOW THE CHECK ───────────────────────────────
/**
 * middleware.js uses event.waitUntil and never blocks. That is not available in
 * a Node serverless function, where work left running past res.json() may be
 * frozen — so this awaits, and the cost of awaiting is capped instead.
 *
 * A missing timeout is invisible until Supabase degrades, at which point it adds
 * its latency to every address anyone types.
 *
 * INJECTION: remove the AbortController -> FAILS.
 */
t('the insert cannot outlive its timeout',
  /AbortController/.test(recordSrc) && /signal: controller\.signal/.test(recordSrc) &&
  /TIMEOUT_MS/.test(recordSrc));
t('the timeout is short enough to be unnoticeable',
  (Number(/const TIMEOUT_MS = (\d+)/.exec(recordSrc)?.[1]) || 99999) <= 2000);
t('the recorder returns a status and never throws',
  /catch \(e\)/.test(recordSrc) && !/throw /.test(recordSrc));
/**
 * The 500 path is the one that would bite: if the handler is already failing, a
 * rejection inside the recorder would replace a clean 500 with an unhandled one.
 * INJECTION: drop the try/catch around the error-branch record -> FAILS.
 */
t('recording inside the 500 handler cannot mask the original error',
  /try \{ await recordCheckOutcome\(\{ outcome: 'error'/.test(apiSrc));

// ── 6. EVERY BRANCH RECORDS ───────────────────────────────────────────────────
/**
 * A branch that returns without recording is the silent failure this feature
 * exists to eliminate, reintroduced in one line. Counted structurally: every
 * `return res.status(...)` in the handler except the 405 must have a
 * recordCheckOutcome call before it and after the previous return.
 *
 * The 405 is exempt: a GET to a POST endpoint is not a person checking an
 * address, and recording it would put crawler noise in the funnel numbers.
 *
 * INJECTION: delete the recordCheckOutcome call from the outside_coverage
 * branch -> FAILS with a count mismatch.
 */
const handlerBody = apiSrc.slice(apiSrc.indexOf('export default async function handler'));
const returns = [...handlerBody.matchAll(/return res\.status\((\d+)\)/g)];
const recordCalls = [...handlerBody.matchAll(/recordCheckOutcome\(/g)];
t('every outcome branch records — one call per returning branch except the 405',
  returns.filter((r) => r[1] !== '405').length === recordCalls.length);
t('all six outcome families are represented',
  /'bad_input'/.test(apiSrc) && /'outside_coverage'/.test(apiSrc) &&
  /result\.reason \|\| 'no_parcel'/.test(apiSrc) &&
  /outcome: savings\.reason/.test(apiSrc) && /'error'/.test(apiSrc));

/**
 * The source field is what keeps the top-of-funnel refusal rate from being
 * diluted by /apply re-running the same endpoint for somebody already past the
 * gate. Both callers must send it or the split silently collapses to 'unknown'.
 *
 * INJECTION: remove source from either caller -> FAILS.
 */
t("pages/check.js identifies itself as source 'check'",
  /source: 'check'/.test(read('pages/check.js')));
t("pages/apply.js identifies itself as source 'apply'",
  /source: 'apply'/.test(read('pages/apply.js')));
t('the source is sanitised server-side rather than trusted from the body',
  /function safeSource/.test(recordSrc) && /=== 'check' \|\| source === 'apply'/.test(recordSrc));

// ── 7. THE PANEL CANNOT TRUNCATE OR RENDER A MISSING MIGRATION AS ZERO ────────
/**
 * Counting fetched rows in JavaScript starts understating the day checks exceed
 * the fetch cap, with no error — the settle-referrals unbounded-read defect in a
 * new place. And a migration run on one environment and not another must not
 * look like a day when nobody checked, because that is a conclusion somebody
 * could act on by changing the ad campaign.
 *
 * INJECTION: swap the RPC for .from('check_events').select() -> FAILS.
 */
t('check counts are aggregated in SQL, not by counting fetched rows',
  /rpc\('check_events_daily'/.test(rosterSrc) && !/from\('check_events'\)/.test(rosterSrc));
t('a missing migration is reported as an error rather than rendered as zero',
  /daily\.error/.test(rosterSrc) && /check_events\.sql/.test(rosterSrc));

/**
 * The refusal rate's denominator. Dividing by ALL checks rather than by checks
 * that reached a finding makes the number rise when the roll loader breaks —
 * a plumbing failure reading as the market getting worse.
 *
 * INJECTION: change the divisor to `checks` -> FAILS.
 */
t('the refusal rate divides by findings, not by all checks',
  /refusalRate: findings > 0 \? Math\.round\(\(refused \/ findings\)/.test(rosterSrc));
t('the panel states what the denominator excludes',
  /The denominator excludes/.test(adminSrc));
t('the roll-predicted rate is carried alongside the observed one',
  /rollPredictedRate/.test(rosterSrc) && /rollPredictedRate/.test(adminSrc));
/**
 * Repeat checks count as repeat checks, because nothing here identifies a
 * visitor. That caveat has to be on the page rather than in a doc nobody opens —
 * same rule as the visitor counter's "not an audience size".
 */
t('the funnel view states that repeat checks are counted as checks',
  /somebody checking three addresses is three checks/.test(rosterSrc));

/**
 * BOTH the definition and the usage. Asserting only that the string "FunnelView"
 * appears passes when the component has been renamed and only the JSX reference
 * survives — which the Next build would catch, but by then this file has already
 * told you the panel is fine. A guard that relies on a later step to notice is
 * not the guard it looks like. Proven: renaming `function FunnelView(` alone
 * passed until this was split in two.
 */
t('the admin page defines and renders the funnel view',
  /function FunnelView\(/.test(adminSrc) && /<FunnelView\b/.test(adminSrc) &&
  /check-roster/.test(adminSrc) && /'funnel'/.test(adminSrc));
t('an unrecognised outcome is surfaced in the panel rather than silently uncounted',
  /unrecognised/.test(rosterSrc) && /unrecognised/.test(adminSrc));

// ── 8. THE HEALTH CHECK WOULD CATCH A MISSING TABLE ───────────────────────────
/**
 * lib/recordCheck.js swallows errors on purpose, which means a missing table
 * produces an empty panel and nothing else. This is the only thing that makes
 * "not recording" distinguishable from "nobody checked".
 *
 * INJECTION: remove checkCheckOutcomeCapture from runAllChecks -> FAILS.
 */
t('check outcome capture is a registered health check',
  /export async function checkCheckOutcomeCapture/.test(healthSrc) &&
  /checkCheckOutcomeCapture\(\),/.test(healthSrc));
t('the health check would catch a missing check_events table',
  /select=checked_on,outcome/.test(healthSrc) &&
  /res\.status === 400 \|\| res\.status === 404/.test(healthSrc) &&
  /check_events\.sql/.test(healthSrc));
/**
 * Reachable-and-empty is its own finding. A table that exists proves the
 * migration ran; it does not prove anything writes to it. Reporting ok for that
 * is the same shape as the "earliest is X" line that kept printing Hillsborough
 * after it stopped being true.
 *
 * INJECTION: delete the rows.length === 0 branch -> FAILS.
 */
t('a reachable but empty table warns rather than reporting ok',
  /rows\.length === 0/.test(healthSrc.slice(healthSrc.indexOf('checkCheckOutcomeCapture'))));

// ── 9. THE BUILD MUST NOT WRITE INTO THE FUNNEL ───────────────────────────────
/**
 * EXERCISED, NOT MATCHED. This is the guard the 21 Aug defect earned.
 *
 * scripts/verify-routes.mjs really invokes the /api/check handler during
 * `npm run build`, and on Vercel the build environment carries production
 * database credentials — so the feature's very first deploy wrote check_events
 * id=1: a synthetic Broward `no_cap_differential`, source `unknown`, three
 * minutes before a human had touched the page. Every textual assertion in this
 * file passed while that happened, which is the whole argument for calling the
 * function instead of reading it.
 *
 * Both directions are proven, because only one of them is the dangerous one to
 * get wrong. Suppressed-when-flagged stops the build polluting the data;
 * RECORDS-WHEN-NOT-FLAGGED is what stops a stray flag silently switching off the
 * entire feature in production, which would present as an empty Funnel tab and
 * read as "nobody checked".
 */
{
  const { recordCheckOutcome } = await import('../lib/recordCheck.js');

  const realFetch = globalThis.fetch;
  const realEnv = { ...process.env };
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; return { ok: true, status: 201, text: async () => '' }; };

  // Credentials present, so a `skipped` result can only mean the suppression
  // branch fired — not that the recorder bailed for want of a URL.
  process.env.SUPABASE_URL = 'https://verify.example.invalid';
  process.env.SUPABASE_SERVICE_KEY = 'verify-only-not-a-real-key';

  process.env.SUPPRESS_CHECK_EVENTS = '1';
  const suppressed = await recordCheckOutcome({ outcome: 'clearable', source: 'check' });
  const callsWhileSuppressed = fetchCalls;

  delete process.env.SUPPRESS_CHECK_EVENTS;
  const recorded = await recordCheckOutcome({ outcome: 'clearable', source: 'check' });
  const callsAfter = fetchCalls;

  globalThis.fetch = realFetch;
  process.env = realEnv;

  t('SUPPRESS_CHECK_EVENTS stops the row being written at all',
    suppressed === 'suppressed' && callsWhileSuppressed === 0);
  t('with the flag absent the recorder still writes — the default is to record',
    recorded === 'ok' && callsAfter === 1);
}

/**
 * And the script that caused it has to set the flag, before it imports anything.
 * A handler that read the variable at module scope would capture the old value.
 *
 * INJECTION: delete the assignment -> FAILS. Move it below the dynamic imports
 * -> FAILS.
 */
{
  const routesSrc = read('scripts/verify-routes.mjs');
  t('verify-routes declares itself not a customer',
    /process\.env\.SUPPRESS_CHECK_EVENTS = '1'/.test(routesSrc));
  t('the flag is set before any route handler is imported',
    routesSrc.indexOf("process.env.SUPPRESS_CHECK_EVENTS") < routesSrc.indexOf('await import('));
  /**
   * The header claimed "needs no database, no API keys and no network", which was
   * true of what the script REQUIRES and false of what it TOUCHES on Vercel.
   * A false claim in a header is how this defect got written in the first place.
   */
  t('verify-routes no longer claims it cannot reach the database',
    /REQUIRES IS NOT THE SAME AS USES/.test(routesSrc));
}

// ── 10. THE DAY BOUNDARY IS CENTRAL, MATCHING EVERYTHING ELSE ─────────────────
/**
 * On UTC everything after 7pm Nathan's time lands on tomorrow's row, so an
 * evening ad test splits across two days and neither matches the number he
 * remembers — and worse here than for the visitor counter, because the Funnel
 * and Traffic tabs would disagree about what "today" is while sitting side by
 * side.
 *
 * INJECTION: switch recordCheck to UTC -> FAILS.
 */
t('check_events dates use the same Central boundary as site_visits',
  /America\/Chicago/.test(recordSrc) && /en-CA/.test(recordSrc) &&
  /America\/Chicago/.test(read('middleware.js')));
t('the roster reports its timezone rather than leaving it implied',
  /timezone: 'America\/Chicago'/.test(rosterSrc));

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`verify-check-events: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-check-events: ${pass} passed`);
