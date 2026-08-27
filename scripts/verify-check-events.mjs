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
const { OUTCOMES, outcomeGroup, isKnownOutcome, REFUSAL_OUTCOMES, ELIGIBLE_OUTCOMES,
  OUR_FAILURE_OUTCOMES, NO_ANSWER_OUTCOMES } = outcomes;

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
/**
 * ============================================================================
 * A DATABASE FAILURE MUST NOT BE REPORTED AS A MISSING PROPERTY. 25 Aug 2026.
 * ============================================================================
 * findParcel returned null on a Supabase error — the same value a genuine miss
 * returns — so every timeout, connection failure and rate limit was told to the
 * homeowner as "We do not have a record for this address on the current tax
 * roll", and counted in the funnel as a property that does not exist.
 *
 * That made the largest bucket in the funnel unreadable: it moved when the
 * database moved and nothing said which. On 25 Aug, Supabase was measurably slow
 * twice and the no-finding share rose from 41% to 46% across the same afternoon,
 * with no way to attribute it.
 *
 * The two things asserted here are the two that were wrong: the outcome is its
 * own value, and the sentence shown to the customer is about US.
 */
{
  const parcels = readFileSync(new URL('../lib/dor/parcels.js', import.meta.url), 'utf8');
  const code = parcels.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  t('a database error no longer returns the same value as a genuine miss',
    /lookupFailed:\s*true/.test(code) && !/console\.error\('\[parcels\] lookup failed[\s\S]{0,80}return null/.test(code));
  t('it has its own outcome in the vocabulary', isKnownOutcome('lookup_failed'));
  t('and that outcome is grouped as OUR failure, not the customer\'s coverage',
    OUTCOMES.lookup_failed.group === 'our_failure');

  const msg = (code.match(/reason: 'lookup_failed'[\s\S]{0,400}?message: '([^']+)'/) || [])[1] || '';
  t('the customer is told it is OUR problem', /our problem|could not reach/i.test(msg), msg);
  t('...and is NOT told we have no record of their property',
    !/no record for this address|do not have a record/i.test(msg), msg);
}

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
  outcomeGroup('error') === 'our_failure');

/**
 * THE FIFTH GROUP, AND WHY THESE THREE ASSERTIONS EXIST. 27 Aug 2026.
 *
 * check_events_daily_split.sql grew `our_failure` on 26 Aug and lib/checkOutcomes.js
 * was not told, so outcomeGroup() returned 'no_answer' for all seven non-findings
 * while the chart drew five segments. The by-outcome table then filed "On the roll,
 * but our matcher missed it" under "No finding" -- the group whose caption reads
 * "reasons outside the code" -- directly below a chart drawing it as ours.
 *
 * A misgrouped outcome does not error. It moves a bug we caused into the bucket
 * labelled not-our-fault, which is the one reading that stops it being worked on.
 *
 * INJECTION: put no_parcel_near_miss back in 'no_answer' -> FAILS.
 */
t('the roll holding a property our matcher refused is OUR failure, not a coverage gap',
  outcomeGroup('no_parcel_near_miss') === 'our_failure');
t('a broken form is our failure too -- bad_input means nothing was submitted',
  outcomeGroup('bad_input') === 'our_failure');
t('a condo owner asked which unit is theirs is NOT filed as our failure',
  outcomeGroup('ambiguous') === 'no_answer');
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

/**
 * AND THE SAME COMPARISON FOR THE GREY SPLIT, WHICH IS HOW IT DRIFTED.
 *
 * The two checks above have compared the refusal and eligible lists since this
 * feature shipped. `our_failure` and `no_answer` were split apart in SQL on
 * 26 Aug and had no JavaScript counterpart to be compared against, so nothing
 * noticed for two days -- lib/checkOutcomes.js's own header claims the verify
 * script asserts the two sides agree, and it did, for half the vocabulary.
 *
 * INJECTION: move 'bad_input' from the SQL our_failure filter to no_answer -> FAILS.
 */
const splitSrc = read('scripts/sql/check_events_daily_split.sql');
const splitBlocks = [...splitSrc.matchAll(/filter \(where e\.outcome in \(([\s\S]*?)\)\)/g)]
  .map((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort().join(','));
t('the our-failure list in the SQL matches OUR_FAILURE_OUTCOMES exactly',
  splitBlocks.includes([...OUR_FAILURE_OUTCOMES].sort().join(',')));
t('the no-answer list in the SQL matches NO_ANSWER_OUTCOMES exactly',
  splitBlocks.includes([...NO_ANSWER_OUTCOMES].sort().join(',')));
t('every outcome in the vocabulary is in exactly one of the four SQL group lists',
  Object.keys(OUTCOMES).every((o) =>
    [REFUSAL_OUTCOMES, ELIGIBLE_OUTCOMES, OUR_FAILURE_OUTCOMES, NO_ANSWER_OUTCOMES, ['needs_condition_case']]
      .filter((l) => l.includes(o)).length === 1));

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

// ── 10. THE RATE CANNOT LIE ABOUT ITS OWN PRECISION ───────────────────────────
/**
 * COMPUTED AND COMPARED, against numbers this codebase did not produce.
 *
 * The panel's first render said "the traffic is better-qualified than a random
 * Florida homeowner, which is what good targeting looks like" — from ONE check,
 * which the session that built the feature had run itself. The verdict sentence
 * fired at any sample size. Same family as the verify script whose "earliest is
 * X" line kept printing Hillsborough after it stopped being true: a report gone
 * false while still looking like a report.
 *
 * A numerical function asserted only against its own output proves nothing, so
 * the expected bounds below were generated independently with Python's
 * statsmodels — `proportion_confint(k, n, alpha=0.05, method='wilson')` — and
 * pasted in. If lib/wilson.js is ever "simplified" into the normal
 * approximation, these stop matching.
 */
{
  const { wilsonInterval, compareToReference, Z95 } = await import('../lib/wilson.js');

  // k/n -> [lower, upper], from statsmodels. Independent of this repo.
  const REFERENCE = [
    [0, 1, 0.000000, 0.793451],
    [0, 30, 0.000000, 0.113513],
    [12, 30, 0.245906, 0.576796],
    [1, 4, 0.045587, 0.699358],
    [50, 100, 0.403832, 0.596168],
    [3, 7, 0.158220, 0.749542],
    [7, 9, 0.452589, 0.936775],
    [20, 30, 0.487801, 0.807695],
    [2, 20, 0.027866, 0.301034],
  ];
  const matches = REFERENCE.every(([k, n, lo, hi]) => {
    const iv = wilsonInterval(k, n);
    return iv && Math.abs(iv.lower - lo) < 1e-6 && Math.abs(iv.upper - hi) < 1e-6;
  });
  t(`the Wilson interval matches statsmodels on all ${REFERENCE.length} reference cases`, matches);
  t('the 95% quantile is the real one, not a rounded 1.96',
    Math.abs(Z95 - 1.959963984540054) < 1e-12);

  /**
   * THE CASE THE TEXTBOOK INTERVAL GETS CATASTROPHICALLY WRONG, asserted
   * explicitly because it is the state this panel launched in.
   *
   * At 0 refusals the normal approximation's standard error is sqrt(0·1/n) = 0,
   * so it reports 0% ± 0% — perfect certainty from one observation. Wilson gives
   * an upper bound near 79%, which is the honest reading of one check.
   */
  const oneCheck = wilsonInterval(0, 1);
  t('a single check with no refusals does NOT report certainty',
    oneCheck.upper > 0.5);
  t('the naive interval this replaces really would have collapsed to zero width',
    Math.sqrt((0 * 1) / 1) === 0);

  // Wilson cannot mathematically leave [0,1]; a "simplification" to the normal
  // approximation can, and would render as "-4.2%".
  let inBounds = true;
  for (let n = 1; n <= 60; n++) {
    for (let k = 0; k <= n; k++) {
      const iv = wilsonInterval(k, n);
      if (!iv || iv.lower < 0 || iv.upper > 1 || iv.lower > iv.upper) inBounds = false;
    }
  }
  t('no interval leaves [0,1] across every k/n up to n=60', inBounds);

  t('nothing to describe returns null rather than an interval spanning everything',
    wilsonInterval(0, 0) === null && wilsonInterval(5, 2) === null &&
    wilsonInterval(-1, 10) === null && wilsonInterval('x', 10) === null);

  /**
   * The verdict is the interval's relationship to the marker, nothing else.
   * INJECTION: make compareToReference return 'below' on overlap -> FAILS.
   */
  const ROLL = 0.387;
  t('one check is not distinguishable from the roll',
    compareToReference(wilsonInterval(0, 1), ROLL) === 'indistinguishable');
  t('a clearly worse rate reads as above once the interval clears the marker',
    compareToReference(wilsonInterval(20, 30), ROLL) === 'above');
  t('a clearly better rate reads as below once the interval clears the marker',
    compareToReference(wilsonInterval(2, 20), ROLL) === 'below');
  t('no data is its own answer, not a verdict',
    compareToReference(null, ROLL) === 'no_data');
}

/**
 * And the panel must take the verdict from that comparison rather than
 * re-deriving one from the point estimate — which is what it did before, with a
 * hardcoded ±15 point band that ignored sample size entirely.
 *
 * INJECTION: restore `h.refusalRate > h.rollPredictedRate + 15` -> FAILS.
 */
t('the roster exposes the interval and the derived verdict',
  /ciLow/.test(rosterSrc) && /ciHigh/.test(rosterSrc) &&
  /compareToReference/.test(rosterSrc) && /wilsonInterval/.test(rosterSrc));
t('the panel gates its verdict sentence on the interval, not on a point estimate',
  /h\.verdict === 'above'/.test(adminSrc) && /h\.verdict === 'below'/.test(adminSrc) &&
  !/refusalRate > h\.rollPredictedRate \+ 15/.test(adminSrc));
t('the panel shows the sample size next to the rate',
  /\{h\.findings\}<\/strong> check/.test(adminSrc));
t('the panel says plainly when the data cannot yet separate the two',
  /Not yet distinguishable from the roll/.test(adminSrc));

// ── 11. THE DAY BOUNDARY IS CENTRAL, MATCHING EVERYTHING ELSE ─────────────────
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

// ── 12. THE BREAKDOWN WINDOW IS A PARAMETER, AND A HOSTILE ONE CANNOT REACH SQL ─
/**
 * Added 27 Aug 2026, with section 13.
 *
 * The Funnel tab could not answer the question it gets opened for. The chart
 * said "6 no answer (29%)" for the day and the only named breakdown in /admin
 * was pinned to a trailing 30 days -- a window that averages away the exact
 * thing being asked about. The 26 Aug city-strip fix took no_parcel from 35% to
 * 10% in ONE DAY and the 30-day column still read 27%.
 *
 * RUN, NOT MATCHED. resolveBreakdownDays is lifted out of the real source and
 * executed, because the defect this guards is a wrong VALUE reaching Postgres
 * and a regex proving the function exists would pass on every one of them. The
 * roster module is not imported directly -- that would drag in the Supabase
 * client and adminAuth, and a guard that needs live env vars is a guard that
 * gets commented out.
 */
const dayFnSrc = (rosterSrc.match(/export function resolveBreakdownDays\(raw\)\s*\{[\s\S]*?\n\}/) || [''])[0];
const dayConstSrc = (rosterSrc.match(/^const (?:BREAKDOWN_DAYS|MAX_BREAKDOWN_DAYS) = \d+;$/gm) || []).join('\n');
t('resolveBreakdownDays and its bounds were found in the roster source (the extractor still matches)',
  dayFnSrc.length > 0 && /BREAKDOWN_DAYS = /.test(dayConstSrc) && /MAX_BREAKDOWN_DAYS = /.test(dayConstSrc));

let resolveDays = null;
try {
  resolveDays = new Function(
    `${dayConstSrc}\n${dayFnSrc.replace('export function', 'function')}\nreturn resolveBreakdownDays;`,
  )();
} catch { /* left null; the assertions below then fail rather than throw */ }

/**
 * The default holds for every shape of "nothing was asked for".
 * INJECTION: drop the `raw == null` guard -> parseInt(String(undefined)) is NaN,
 * which the next guard catches, so this pair is deliberately redundant.
 */
t('an absent ?days= falls back to the 30-day default',
  resolveDays && resolveDays(undefined) === 30 && resolveDays(null) === 30 && resolveDays('') === 30);

/**
 * THE NaN GUARD. This is the whole reason the function exists.
 *
 * A non-numeric DOR_ROLL_YEAR reached SQL as NaN once already and produced a
 * result "indistinguishable from a genuine miss, for every address in Florida"
 * (No_Finding_Three_Causes_2026-08-25.md). ?days=abc must not become
 * make_interval(days => NaN).
 *
 * INJECTION: replace the body with `return Number(raw) || BREAKDOWN_DAYS` ->
 * this one PASSES and the negative-window assertion below FAILS. Both are here
 * because neither catches that rewrite alone.
 */
t('a non-numeric ?days= cannot reach Postgres',
  resolveDays && resolveDays('abc') === 30 && resolveDays('NaN') === 30 && resolveDays({}) === 30);

/**
 * A NUMERIC PREFIX IS NOT A NUMBER.
 *
 * parseInt('7abc') is 7 and parseInt('1,90') is 1 -- it answers a question
 * nobody asked rather than falling back to a documented default, and it silently
 * made the array branch below unreachable, which is how the whole-string match
 * came to exist.
 *
 * INJECTION: swap the /^\d+$/ test for Number.parseInt(s, 10) -> FAILS.
 */
t('a partly-numeric ?days= is rejected rather than truncated to its prefix',
  resolveDays && resolveDays('7abc') === 30 && resolveDays('1.5') === 30 && resolveDays('1,90') === 30);

/**
 * A NEGATIVE WINDOW IS A WINDOW IN THE FUTURE.
 *
 * current_date - make_interval(days => -5) selects five days ahead, which
 * returns nothing and reads on the page as "nothing was recorded" rather than
 * "you asked for a nonsense window". Same failure family as every other silent
 * empty in this file.
 *
 * INJECTION: change `n < 1` to `n < 0`, or use `Number(raw) || DEFAULT` -> FAILS.
 */
t('a zero or negative ?days= falls back to the default rather than selecting the future',
  resolveDays && resolveDays('0') === 30 && resolveDays('-5') === 30 && resolveDays('-1') === 30);

/**
 * INJECTION: delete the Math.min -> FAILS.
 */
t('an absurd ?days= is clamped rather than passed through',
  resolveDays && resolveDays('99999') === 365 && resolveDays('366') === 365);

/**
 * Next parses a repeated query key into an array.
 *
 * This assertion is the reason the parse is a whole-string match. Under
 * parseInt, String(['1','90']) is "1,90" and the prefix rule returns 1 -- the
 * same answer the branch gives, so deleting the branch could not be made to
 * fail and the guard was decorative. It is load-bearing now.
 *
 * INJECTION: delete the Array.isArray branch -> FAILS.
 */
t('a repeated ?days= key takes the first value',
  resolveDays && resolveDays(['1', '90']) === 1 && resolveDays(['7', '1']) === 7);

t('ordinary windows pass through unchanged',
  resolveDays && resolveDays('1') === 1 && resolveDays('7') === 7 && resolveDays(30) === 30);

/**
 * The resolved value has to actually be USED. A sanitiser nothing calls is
 * decoration, and this is exactly how the source field nearly shipped inert.
 *
 * INJECTION: revert either RPC argument to BREAKDOWN_DAYS -> FAILS.
 */
t('both breakdown RPCs are called with the resolved window, not the constant',
  /check_events_by_outcome', \{ days: breakdownDays, src: null \}/.test(rosterSrc) &&
  /check_events_by_county', \{ days: breakdownDays \}/.test(rosterSrc) &&
  /resolveBreakdownDays\(req\.query\?\.days\)/.test(rosterSrc));

/**
 * THE CHART IS NOT NARROWED WITH THE TABLES.
 *
 * The chart is what you read to decide which day to narrow to. If the control
 * reshaped it as well, choosing a day would destroy the comparison that made
 * the day interesting -- and two readings taken a click apart would not be
 * comparable to each other.
 *
 * INJECTION: pass breakdownDays to check_events_daily -> FAILS.
 */
t('the daily chart stays pinned at CHART_DAYS regardless of ?days=',
  /check_events_daily', \{ days: CHART_DAYS \}/.test(rosterSrc) &&
  /check_events_daily_outcomes', \{ days: CHART_DAYS \}/.test(rosterSrc));

/**
 * The panel prints the window. Printing the CONSTANT while querying the
 * resolved value would label a one-day table "Last 30 days" -- a caption that
 * lies is worse than no caption, and this panel exists to inform ad spend.
 *
 * INJECTION: restore `breakdownDays: BREAKDOWN_DAYS` -> FAILS.
 */
t('the roster returns the resolved window rather than the constant',
  /\n      breakdownDays,/.test(rosterSrc) && /breakdownDaysDefault: BREAKDOWN_DAYS/.test(rosterSrc));
t('the panel prints the window it was actually given, and reads correctly at one day',
  /data\.breakdownDays === 1 \? 'Today so far'/.test(adminSrc) &&
  !/Last \{data\.breakdownDays\} days\./.test(adminSrc));
t('the window control is wired to a refetch rather than filtering client-side',
  /onWindowChange/.test(adminSrc) && /fetchFunnel\(null, days\)/.test(adminSrc) &&
  /\?days=\$\{encodeURIComponent\(days\)\}/.test(adminSrc));
/**
 * The password stays in the POST body. A secret in a query string lands in
 * server logs, browser history and any proxy in between.
 *
 * INJECTION: move password into the query string -> FAILS.
 */
t('the window rides in the query string and the password does not',
  /body: JSON\.stringify\(\{ password: pw \|\| password \}\)/.test(adminSrc) &&
  !/\?password=/.test(adminSrc));

// ── 13. THE TOOLTIP NAMES THE OUTCOMES, AND FAILS SOFT WHEN IT CANNOT ──────────
/**
 * The 26 Aug note that shipped the violet/grey split stated "the full breakdown
 * is in the tooltip". It was not. The tooltip carried five GROUP totals, so
 * "6 no answer (29%)" could not be resolved into six people asked to pick a
 * unit, six out-of-state visitors, or six misses that are really a retrieval bug
 * wearing a genuine miss's clothes -- which is what 25 Aug's 28 no_parcel rows
 * turned out to be. Three causes, three responses, one of them urgent.
 */
const dailyOutcomesSql = read('scripts/sql/check_events_daily_outcomes.sql');

/**
 * LONG FORM, so the vocabulary lives in exactly one place. A column per outcome
 * would need a DROP/CREATE migration every time lib/checkOutcomes.js grows a
 * branch -- the waitlist CHECK constraint again, in DDL.
 *
 * INJECTION: group by checked_on alone -> FAILS.
 */
t('the per-day outcome RPC is grouped by day AND outcome, so a new outcome needs no migration',
  /create or replace function check_events_daily_outcomes\(days int default 45\)/.test(dailyOutcomesSql) &&
  /returns table \(checked_on date, outcome text, checks bigint\)/.test(dailyOutcomesSql) &&
  /group by e\.checked_on, e\.outcome/.test(dailyOutcomesSql));
/**
 * INJECTION: add a `where e.outcome in (...)` allow-list -> FAILS. The function
 * that exists to surface an unknown outcome must not be able to filter one out.
 */
t('the per-day outcome RPC filters on nothing but the date window',
  !/and e\.outcome/.test(dailyOutcomesSql) && !/check\s*\(/i.test(dailyOutcomesSql) &&
  /where e\.checked_on > \(current_date - make_interval\(days => days\)\)/.test(dailyOutcomesSql));

/**
 * `days => 1` MUST MEAN TODAY, AND IT MEANT TODAY AND YESTERDAY. 27 Aug 2026.
 *
 * `checked_on >= current_date - N days` spans N+1 dates. At the 30-day default
 * that is invisible. At N=1 -- the window the Today button on the Funnel tab
 * asks for -- it doubles the answer, and the tab disagreed with itself: the
 * chart drew 8/27 at ~31 checks while the table beside it totalled 95, which is
 * 8/27 plus 8/26. Adjacent days have near-identical group SHARES, so both
 * numbers looked plausible and only the volumes disagreed.
 *
 * Asserted across every window in the feature rather than the one that was
 * noticed, because the chart and the tables reading the same word differently is
 * the whole defect.
 *
 * INJECTION: put `>=` back in any of the four functions -> FAILS.
 */
const windowsSql = read('scripts/sql/check_events_windows.sql');
const windowPredicates = [sqlSrc, splitSrc, dailyOutcomesSql, windowsSql]
  .flatMap((src) => [...src.matchAll(/where e\.checked_on (>=?) \(current_date/g)].map((m) => m[1]));
t('every date window is exclusive at the far end, so days => 1 is one day',
  windowPredicates.length >= 9 && windowPredicates.every((op) => op === '>'));

/**
 * AND THE MIGRATION THAT ACTUALLY RUNS AGAINST THE LIVE DATABASE EXISTS.
 *
 * "Re-run the three files you edited" does not work here and fails in the worst
 * available way. check_events.sql still declares the PRE-SPLIT check_events_daily,
 * returning five columns; the database has the seven-column form from
 * check_events_daily_split.sql. Postgres refuses a return-type change on `create
 * or replace` (42P13), and run-sql.mjs sends each file as one implicit
 * transaction -- so check_events.sql aborts and rolls back, silently taking the
 * window fix for check_events_by_outcome and check_events_by_county with it.
 * Those two are exactly what the Funnel tab's tables read.
 *
 * check_events_windows.sql replaces all four functions as they exist today, in
 * one transaction, and must DROP check_events_daily first for the same arity
 * reason.
 *
 * INJECTION: delete the drop from check_events_windows.sql -> FAILS.
 */
t('there is a windows migration that can run against the live database',
  /create or replace function check_events_daily\(/.test(windowsSql) &&
  /create or replace function check_events_by_outcome\(/.test(windowsSql) &&
  /create or replace function check_events_by_county\(/.test(windowsSql) &&
  /create or replace function check_events_daily_outcomes\(/.test(windowsSql));
t('it drops check_events_daily first, because a replace cannot change arity',
  windowsSql.indexOf('drop function if exists check_events_daily(int)') > -1 &&
  windowsSql.indexOf('drop function if exists check_events_daily(int)') <
    windowsSql.indexOf('create or replace function check_events_daily('));
t('it recreates the SEVEN-column daily shape, not the pre-split five',
  /our_failure  bigint/.test(windowsSql) && /no_answer    bigint/.test(windowsSql));
t('it reloads the PostgREST schema cache after the functions',
  windowsSql.indexOf("notify pgrst") > windowsSql.lastIndexOf('create or replace function'));
t('it ends with a select that proves which database it hit',
  windowsSql.lastIndexOf('select') > windowsSql.indexOf('notify pgrst') &&
  /check_events_daily\(1\)/.test(windowsSql));
t('the SQL function name matches the RPC the roster calls',
  /function (check_events_daily_outcomes)\(/.exec(dailyOutcomesSql)?.[1] ===
  /rpc\('(check_events_daily_outcomes)'/.exec(rosterSrc)?.[1]);

/**
 * Labelled and grouped server-side, from lib/checkOutcomes.js. A second copy of
 * the vocabulary in pages/admin.js is a copy that drifts -- the same shape as
 * the middleware and the purge script disagreeing about what a probe is.
 *
 * INJECTION: build the labels in admin.js from a local map -> FAILS.
 */
t('per-day outcomes are labelled and grouped from the one vocabulary, in the roster',
  /outcomesByDate/.test(rosterSrc) &&
  /group: outcomeGroup\(r\.outcome\)/.test(rosterSrc) &&
  /label: outcomeLabel\(r\.outcome\)/.test(rosterSrc) &&
  /outcomes: outcomesByDate\.get\(r\.checked_on\) \|\| \[\]/.test(rosterSrc));
/**
 * Checked against the REAL vocabulary rather than one hand-picked example, and
 * against quoted literals rather than the word "checkOutcomes" -- which appears
 * in admin.js twice as prose telling the reader where the vocabulary lives, and
 * should keep appearing.
 *
 * INJECTION: add `const LABELS = { cap_absorbs_everything: '...' }` to admin.js
 * -> FAILS, naming the outcome it found.
 */
/**
 * Matches a quoted literal OR a bare object key, because the first attempt only
 * checked for quotes and the injection `{ cap_absorbs_everything: '...' }`
 * walked straight past it.
 *
 * Restricted to the underscored outcome names. `error`, `ambiguous` and
 * `clearable` are ordinary English words that appear in this file's prose and as
 * unrelated identifiers, and a guard that cries wolf on `error:` gets deleted
 * within the week. Every realistic copy of the vocabulary carries at least one
 * underscored key, so the narrowing costs nothing a real defect would exploit.
 */
const leakedOutcomes = Object.keys(OUTCOMES).filter(
  (o) => o.includes('_') && new RegExp(`(['"\`]${o}['"\`]|\\b${o}\\s*:)`).test(adminSrc),
);
t(`pages/admin.js does not carry its own copy of the outcome vocabulary${leakedOutcomes.length ? ` — found: ${leakedOutcomes.join(', ')}` : ''}`,
  leakedOutcomes.length === 0 && !/from '.*checkOutcomes'/.test(adminSrc));
/**
 * outcomeGroup() defaults an unknown outcome to no_answer. Without this flag a
 * brand-new outcome renders in the tooltip as an ordinary grey line and reads as
 * a diagnosis instead of a gap.
 *
 * INJECTION: drop `unrecognised` from the per-day rows -> FAILS.
 */
/**
 * SCOPED TO THE PER-DAY BLOCK, not to the file.
 *
 * The `byOutcome` rows carry a character-identical `unrecognised:` line, so a
 * file-wide regex passed with the flag deleted from the per-day rows -- proven
 * by running exactly that injection. Same class as the FunnelView rename in
 * section 7: an assertion that matches somewhere else is not the assertion it
 * looks like.
 *
 * INJECTION: delete `unrecognised` from the outcomesByDate push -> FAILS.
 */
const perDayBlock = rosterSrc.slice(
  rosterSrc.indexOf('const outcomesByDate'),
  rosterSrc.indexOf('const days = (daily.data'),
);
t('the per-day block was located (the slice still matches)',
  perDayBlock.length > 100 && /outcomesByDate\.get\(r\.checked_on\)\.push\(\{/.test(perDayBlock));
t('an unrecognised outcome is marked in the tooltip rather than passing as grey',
  /unrecognised: !Object\.prototype\.hasOwnProperty\.call\(OUTCOMES, r\.outcome\)/.test(perDayBlock) &&
  /o\.unrecognised \? '  ⚠ not in the vocabulary'/.test(adminSrc));

/**
 * BOTH lines. The group counts carry the percentages and are the at-a-glance
 * read; the named lines are the diagnosis. Replacing the first with the second
 * trades one missing answer for another.
 *
 * INJECTION: delete the group-count line from the title -> FAILS.
 */
t('the tooltip keeps the group counts AND adds the named outcomes',
  /our failure \(\$\{pct\(d\.ourFailure\)\}%\) · \$\{d\.noAnswer\} no answer/.test(adminSrc) &&
  /const named = \(d\.outcomes \|\| \[\]\)\.map\(/.test(adminSrc) &&
  /o\.checks.*× \$\{o\.label\}/.test(adminSrc));

/**
 * FAILS SOFT. A missing migration must degrade the tooltip's detail, never blank
 * a day -- and must SAY so, because a tooltip quietly showing group totals looks
 * identical to a tooltip working correctly. That is the same silent degradation
 * checkCheckOutcomeCapture exists to make visible.
 *
 * INJECTION: render the named block unconditionally -> FAILS.
 * INJECTION: swallow dailyOutcomes.error -> FAILS.
 */
t('an empty per-day outcome list falls back to the old tooltip rather than rendering nothing',
  /named\.length > 0 \? `\\n\\n\$\{named\.join\('\\n'\)\}` : ''/.test(adminSrc) &&
  /if \(!dailyOutcomes\.error\) \{/.test(rosterSrc));
t('a failed per-day outcome read is reported rather than swallowed',
  /seriesOutcomesError: dailyOutcomes\.error \? dailyOutcomes\.error\.message : null/.test(rosterSrc) &&
  /data\.seriesOutcomesError && \(/.test(adminSrc) &&
  /check_events_daily_outcomes\.sql/.test(adminSrc));
/**
 * The panel's own instructions have to be true. The 26 Aug caption promised a
 * full split the tooltip did not carry, and that promise is why nobody went
 * looking for the breakdown elsewhere for a day.
 *
 * INJECTION: restore "Hover any day for the full split." -> FAILS.
 */
t('the chart caption describes the tooltip that actually exists',
  /Hover any day for the named outcomes/.test(adminSrc) &&
  !/Hover any day for the full split/.test(adminSrc));

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`verify-check-events: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-check-events: ${pass} passed`);
