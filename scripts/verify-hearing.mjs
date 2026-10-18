/**
 * scripts/verify-hearing.mjs — the hearing help pack (17 Oct 2026).
 *   1. the sheet states each state's published rule with its source, and never
 *      says we attend or represent
 *   2. "your case in one minute" uses only figures from the kit we built
 *   3. the date is checked; reminders two days before, a follow-up the day after,
 *      each once, none once decided
 *   4. wired: /outcome saves it and emails the sheet; the daily cron reminds
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);
const H = await import('../lib/kit/hearing.js');
const { flOrder } = await import('./kit/fl-fixture.mjs');
const { txKitOrder } = await import('./kit/tx-fixture.mjs');
const { PDFDocument } = await import('pdf-lib');

let pass = 0; const fails = [];
const t = (name, ok) => { if (ok) pass++; else fails.push(name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// INJECTION: drop a statute cite -> FAILS (a rule without its source is advice we cannot stand behind).
t('each state rule cites its source', /41\.461/.test(H.STATE_RULES.TX.join(' ')) && /194\.011\(4\)\(a\)/.test(H.STATE_RULES.FL.join(' ')) && /194\.011\(4\)\(b\)/.test(H.STATE_RULES.FL.join(' ')) && /560-11-12/.test(H.STATE_RULES.GA.join(' ')));
t('the published numbers: TX request the district\'s evidence, FL 15 and 7 days, GA 10 and 7 days', /Ask the appraisal district, in writing/.test(H.STATE_RULES.TX[0]) && /15 days/.test(H.STATE_RULES.FL[0]) && /7 days/.test(H.STATE_RULES.FL[1]) && /10 days/.test(H.STATE_RULES.GA[0]) && /7 days/.test(H.STATE_RULES.GA[0]));
const src = read('lib/kit/hearing.js');
t('it never says we attend, represent or speak for them', /We do not attend hearings or represent you/.test(src) && !/\bwe(?:'ll| will)? (?:attend|represent|appear)\b/i.test(src.replace(/do not attend|not attend hearings/g, '')));

const fl = H.caseSummary(flOrder(), 'FL');
t('Florida case figures come from the kit: roll value, qualified sales, the value asked', fl.countyValue === 412000 && fl.indicated === 357000 && fl.asked === 357000 && fl.comps === 4);
const tx = H.caseSummary(txKitOrder(), 'TX');
t('Texas case figures come from the protest packet', tx.countyValue === 300000 && tx.asked > 0);
t('unknown figures are left out, never guessed', Object.values(H.caseSummary({}, 'GA')).filter((v) => typeof v === 'number').length === 0);

const now = new Date('2027-10-10T15:00:00Z');
t('a date today or later, within a year; anything else refused', !H.cleanHearing({ date: '2027-10-10' }, now).error && H.cleanHearing({ date: '2027-10-09' }, now).error === 'date' && H.cleanHearing({ date: '2029-01-01' }, now).error === 'date' && H.cleanHearing({ date: 'soon' }, now).error === 'date');
const row = (h, patch = {}) => ({ payment_status: 'paid', dispute_status: 'kit_sent', kit_order: { after: { hearing: { date: '2027-10-20', ...h } } }, ...patch });
t('reminder two days before, once', H.hearingDue(row(), new Date('2027-10-18T15:00:00Z')) === 'reminder' && H.hearingDue(row(), new Date('2027-10-16T15:00:00Z')) === null && H.hearingDue(row({ remindedAt: 'x' }), new Date('2027-10-19T15:00:00Z')) === null);
t('follow-up the day after, once, within ten days', H.hearingDue(row({ remindedAt: 'x' }), new Date('2027-10-21T15:00:00Z')) === 'followup' && H.hearingDue(row({ followedAt: 'x' }), new Date('2027-10-22T15:00:00Z')) === null && H.hearingDue(row(), new Date('2027-11-15T15:00:00Z')) === null);
// INJECTION: drop the decided check -> FAILS (a customer would be reminded of a hearing already decided).
t('nothing once a decision is recorded', H.hearingDue(row({}, { dispute_status: 'denied' }), new Date('2027-10-18T15:00:00Z')) === null && H.hearingDue({ ...row(), kit_order: { after: { hearing: { date: '2027-10-20' }, outcome: { answer: 'lowered' } } } }, new Date('2027-10-18T15:00:00Z')) === null);

const ko = flOrder(); ko.after = { hearing: { date: '2027-10-20', time: '9:30', kind: 'hearing' } };
const pdf = await PDFDocument.load(await H.hearingSheetPdf({ state_code: 'FL', kit_order: ko }));
t('the sheet is one page', pdf.getPageCount() === 1);
const api = read('pages/api/kit/outcome.js');
t('/outcome saves the hearing, starts its reminders again on a new date, and emails the sheet', /action === 'hearing'/.test(api) && /remindedAt: null, followedAt: null/.test(api) && /hearingSheetPdf\(r2\)/.test(api) && /filename: 'Your-hearing\.pdf'/.test(api));
t('the page offers it until a decision is in', /Got a hearing or meeting date\?/.test(read('pages/outcome.js')) && /action: 'hearing'/.test(read('pages/outcome.js')));
t('the daily cron sends the reminder with the sheet and the follow-up, and records each', /hearingPass\(supabase, resend, now\)/.test(read('pages/api/cron/notice-reminder.js')) && /stage === 'reminder' \? 'remindedAt' : 'followedAt'/.test(read('pages/api/cron/notice-reminder.js')));
t('/mailed points people to it once the kit is sent', /Got a hearing date\?/.test(read('pages/mailed.js')) && /nextLink: outcomeUrl\(row\.id\)/.test(read('pages/api/kit/sent.js')));

console.log(`verify-hearing: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL: ${f}`);
if (fails.length) process.exit(1);
