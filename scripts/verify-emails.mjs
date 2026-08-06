#!/usr/bin/env node
/**
 * WHAT THE CUSTOMER IS TOLD, AND WHETHER IT IS TRUE.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * Three separate times now, a parameter has been passed into the receipt pipeline
 * and silently dropped on the floor by a destructure that did not list it:
 *
 *   customerName  -> every receipt read "Hi undefined,"
 *   stateCode     -> every Florida buyer was told a CERTIFIED letter was on its way
 *                    to their APPRAISAL DISTRICT. Florida mails first class, to a
 *                    Value Adjustment Board.
 *   orderStatus   -> every receipt said "Your Dispute Has Been Filed", including
 *                    pre-orders that would not be mailed for another nineteen days.
 *
 * None of these throw. None fail a build. The email sends, looks handsome, and is
 * wrong. The only way to catch them is to render the thing and read it, which is
 * what this does.
 *
 * The orderStatus one is the reason this is not merely cosmetic. Florida's deadline
 * is satisfied by physical RECEIPT, not postmark. A customer told their petition is
 * already filed has no reason to chase it, so if anything downstream fails they
 * discover it after the window has closed — and a missed year cannot be recovered.
 *
 * Also guards the fulfillOrder queueing bug found by the same live test, because
 * the receipt and the status are two halves of one promise.
 */

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

register('./resolve-extensionless.mjs', import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} — got: ${JSON.stringify(got)}`));

const { confirmationEmailTemplate, confirmationSubject } = await import('../pages/api/email-templates.js');

/** The real fixture from the 5 Aug live purchase, values exactly as stored. */
const ORDER = {
  firstName: 'Nathan',
  lastName: 'Emms',
  address: '1130 GLENWOOD CT, WESTON, FL 33326',
  // Stored WITH the suffix, which is what produced "Broward County County".
  county: 'Broward County',
  stateCode: 'FL',
  amountPaid: 11400,
  vabFee: 2500,
  // Postgres timestamptz shape: "+00", not "+00:00". new Date() rejects it.
  scheduledFileDate: '2026-08-24T05:00:00+00',
};

const render = (orderStatus) => confirmationEmailTemplate({ ...ORDER, orderStatus });

const CLAIMS_FILED = /Has Been Filed|is on its way|has been prepared and dispatched/i;

// ── A queued pre-order must not claim to be filed ─────────────────────────────
{
  const html = render('queued');
  t('queued receipt does not claim the petition is filed', !CLAIMS_FILED.test(html));
  t('queued receipt says it is reserved', /Reserved|held ready/i.test(html));
  t('queued receipt names the date it will be filed', html.includes('August 24, 2026'));
  t('queued subject does not say filed', !/Has Been Filed/.test(confirmationSubject({ stateCode: 'FL', orderStatus: 'queued' })),
    confirmationSubject({ stateCode: 'FL', orderStatus: 'queued' }));
  t('queued receipt does not promise arrival in 3-7 days from now',
    !/arrives at the .* \(3-7 business days\)/.test(html));
}

// ── awaiting_signature must ask for the signature, not announce a filing ──────
{
  const html = render('awaiting_signature');
  t('unsigned receipt does not claim filed', !CLAIMS_FILED.test(html));
  t('unsigned receipt asks for a signature', /signature|sign it/i.test(html));
}

// ── An UNKNOWN status must never render as filed ──────────────────────────────
// The default branch is the one that protects against the next status we add.
for (const status of [undefined, null, '', 'needs_review', 'mailed_unrecorded', 'wat']) {
  t(`status ${JSON.stringify(status)} does not claim filed`, !CLAIMS_FILED.test(render(status)));
}

// ── filed SHOULD say filed. The fix must not break the true case ──────────────
{
  const html = render('filed');
  t('filed receipt does claim filed', CLAIMS_FILED.test(html));
  t('filed subject says filed', /Has Been Filed/.test(confirmationSubject({ stateCode: 'FL', orderStatus: 'filed' })));
}

// ── County name is not doubled ────────────────────────────────────────────────
for (const status of ['queued', 'filed', 'awaiting_signature']) {
  t(`no "County County" in the ${status} receipt`, !/County County/.test(render(status)));
}
t('the VAB is still named correctly', /Broward County Value Adjustment Board/.test(render('filed')));

// ── No unformatted or invalid dates reach a customer ──────────────────────────
for (const status of ['queued', 'filed', 'awaiting_signature']) {
  const html = render(status);
  t(`no "Invalid Date" in the ${status} receipt`, !/Invalid Date/.test(html));
  t(`no raw ISO timestamp in the ${status} receipt`, !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(html));
}
t('a malformed date degrades to no date rather than "Invalid Date"',
  !/Invalid Date/.test(confirmationEmailTemplate({ ...ORDER, scheduledFileDate: 'not-a-date', orderStatus: 'queued' })));

// ── Money is described honestly ───────────────────────────────────────────────
{
  const html = render('queued');
  t('total is shown as Total Paid, not "Filing Fee Paid"',
    html.includes('Total Paid') && !html.includes('Filing Fee Paid'));
  t('the $114 total appears', html.includes('$114.00'));
  t('the $89 service fee is broken out', html.includes('$89.00'));
  t('the $25 county fee is broken out', html.includes('$25.00'));
  t('the county fee is labelled as paid on the customer behalf', /we pay this for you/i.test(html));

  // With no vabFee we must NOT invent a split.
  const noFee = confirmationEmailTemplate({ ...ORDER, vabFee: null, amountPaid: 8900, orderStatus: 'queued' });
  t('no fee breakdown invented when vabFee is absent', !/service fee/i.test(noFee));
  t('total still correct without a breakdown', noFee.includes('$89.00'));
}

// ── Non-Florida wording is untouched ──────────────────────────────────────────
{
  const tx = confirmationEmailTemplate({ ...ORDER, stateCode: 'TX', county: 'Tarrant County', orderStatus: 'filed' });
  t('TX still says certified mail', /certified mail/i.test(tx));
  t('TX still says appraisal district', /Tarrant Appraisal District/.test(tx));
  t('TX is not called a petition', !/your petition/i.test(tx));
  t('TX county name is not doubled', !/County County/.test(tx));
}

// ── The parameter must actually be plumbed, or all of the above is theatre ────
{
  const sendEmail = read('pages/api/send-email.js');
  t('send-email destructures orderStatus', /^\s*orderStatus,/m.test(sendEmail));
  t('send-email forwards orderStatus to the template', /orderStatus[,\s}]/.test(sendEmail.slice(sendEmail.indexOf('confirmationEmailTemplate({'))));
  t('send-email derives the subject from status', sendEmail.includes('confirmationSubject('));

  const fulfil = read('lib/fulfillOrder.js');
  t('fulfillOrder sends orderStatus', /orderStatus: status/.test(fulfil));
  t('fulfillOrder sends vabFee for the breakdown', /vabFee:/.test(fulfil));
}

// ── Regression guard for the queueing bug found by the same live test ─────────
// attemptMail's `!canFile` branch used to RETURN status queued without WRITING it,
// so signed orders stayed awaiting_signature and process-queued-orders — which
// selects on dispute_status = 'queued' — would never have mailed them.
{
  const fulfil = read('lib/fulfillOrder.js');
  const i = fulfil.indexOf('if (ws && !ws.canFile)');
  t('the !canFile branch still exists', i > -1);
  const branch = fulfil.slice(i, i + 2600);
  t('the !canFile branch WRITES the queued status, not just returns it',
    /\.update\(\{\s*dispute_status:\s*ORDER_STATUS\.QUEUED/.test(branch));
  t('it only advances from awaiting_signature',
    /\.eq\('dispute_status',\s*ORDER_STATUS\.AWAITING_SIGNATURE\)/.test(branch));
  t('it refuses to queue an unsigned petition',
    /\.not\('signed_at',\s*'is',\s*null\)/.test(branch));
  t('a failure to queue a paid, signed order pages someone', /pageOps\(/.test(branch));
}

if (failures.length) {
  console.error(`verify-emails: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-emails: ${pass} passed — receipts say only what is true for the order's actual status`);
