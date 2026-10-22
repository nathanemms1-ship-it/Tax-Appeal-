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
 * The letter-era receipts (queued / awaiting_signature / filed) and the
 * fulfillOrder queueing guard were removed on 17 Oct 2026 with the letter model.
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
};

const render = (orderStatus) => confirmationEmailTemplate({ ...ORDER, orderStatus });

const CLAIMS_FILED = /Has Been Filed|is on its way to the|has been prepared and dispatched|we (?:have )?(?:filed|mailed it to the county)/i;

/**
 * 17 Oct 2026: the letter/e-sign model was deleted. The receipts it had —
 * queued, awaiting_signature, filed, and the Florida VAB-fee breakdown — went with
 * it, and so did their assertions. The live receipts are the kit ones
 * (kit_queued, kit_pdf, awaiting_notice), whose wording is asserted in
 * verify-kit-dispatch.mjs. What stays here holds for EVERY receipt.
 */
const KIT_STATUSES = ['kit_queued', 'kit_pdf', 'awaiting_notice'];

// ── An UNKNOWN status must never render as filed ──────────────────────────────
// The default branch is the one that protects against the next status we add.
// The retired letter statuses are in the list on purpose: an old row replayed
// through the receipt must not suddenly claim a filing we never make.
for (const status of [undefined, null, '', 'needs_review', 'mailed_unrecorded', 'wat', 'queued', 'awaiting_signature', 'filed']) {
  t(`status ${JSON.stringify(status)} does not claim filed`, !CLAIMS_FILED.test(render(status)));
  t(`status ${JSON.stringify(status)} subject does not say filed`,
    !/Has Been Filed/.test(confirmationSubject({ stateCode: 'FL', orderStatus: status })));
}
// ...and no kit receipt claims a filing either: we never file.
for (const status of KIT_STATUSES) {
  for (const st of ['FL', 'GA', 'TX']) {
    t(`${st} ${status} receipt does not claim filed`,
      !CLAIMS_FILED.test(confirmationEmailTemplate({ ...ORDER, stateCode: st, orderStatus: status })));
  }
}

// ── County name is not doubled ────────────────────────────────────────────────
for (const status of KIT_STATUSES) {
  t(`no "County County" in the ${status} receipt`, !/County County/.test(render(status)));
}

// ── No unformatted or invalid dates reach a customer ──────────────────────────
for (const status of KIT_STATUSES) {
  const html = render(status);
  t(`no "Invalid Date" in the ${status} receipt`, !/Invalid Date/.test(html));
  t(`no raw ISO timestamp in the ${status} receipt`, !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(html));
}

// ── Money is described honestly ───────────────────────────────────────────────
{
  const html = render('kit_queued');
  t('total is shown as Total Paid, not "Filing Fee Paid"',
    html.includes('Total Paid') && !html.includes('Filing Fee Paid'));
  t('the real amount charged appears ($114)', html.includes('$114.00'));
}

// ── No document is re-sent in the receipt ─────────────────────────────────────
// Removed 6 Aug 2026: the receipt used to carry the full petition — name, home
// address, parcel number and signature — into a message that gets forwarded and
// kept. The kit PDF goes out in its own email; the receipt must stay a receipt.
{
  const withLetter = confirmationEmailTemplate({
    ...ORDER,
    orderStatus: 'kit_queued',
    letter: 'PETITION BODY THAT MUST NOT BE REPRODUCED IN THE EMAIL',
  });
  t('a document body is not reproduced even when passed',
    !withLetter.includes('PETITION BODY THAT MUST NOT BE REPRODUCED'));
  t('the "For Your Records" block is gone', !/For Your Records/i.test(withLetter));
  t('the receipt does not call itself the official record',
    !/official record of the protest/i.test(withLetter));
  // The summary still has to be there — we removed the document, not the receipt.
  t('the order summary survives', /ORDER SUMMARY/i.test(withLetter));
  t('the total paid survives', withLetter.includes('$114.00'));
}

// ── The parameter must actually be plumbed, or all of the above is theatre ────
{
  const sendEmail = read('pages/api/send-email.js');
  t('send-email destructures orderStatus', /^\s*orderStatus,/m.test(sendEmail));
  t('send-email forwards orderStatus to the template', /orderStatus[,\s}]/.test(sendEmail.slice(sendEmail.indexOf('confirmationEmailTemplate({'))));
  t('send-email derives the subject from status', sendEmail.includes('confirmationSubject('));
  t('send-email destructures and forwards noticeUrl',
    /^\s*noticeUrl,/m.test(sendEmail) && /noticeUrl/.test(sendEmail.slice(sendEmail.indexOf('confirmationEmailTemplate({'))));

  const fulfil = read('lib/fulfillOrder.js');
  t('fulfillOrder sends orderStatus', /orderStatus: status/.test(fulfil));
  t('fulfillOrder sends the real Stripe amount', /amountPaid: session\.amount_total/.test(fulfil));
}

/**
 * ============================================================================
 * EVERY WAITLIST REASON MUST HAVE A BRANCH IN THE CRON THAT EMAILS THEM
 * ============================================================================
 * A row in `waitlist` is a promise to email somebody, and blocked_reason decides
 * WHICH promise. join-waitlist.js writes it; cron/notify-waitlist.js reads it. The
 * two disagreed: `fl_no_parcel_record` was an accepted reason with no branch in the
 * cron, so those rows — people the funnel had already refused because their
 * property is not on the DOR roll — fell through to the ordinary "🎉 your filing
 * window just opened, file today" email with a $89 buy button. Clicking it gets
 * them refused a second time.
 *
 * That is silent by construction: the writer looks right on its own, the reader
 * looks right on its own, and nothing reads both. A reason with no branch is not a
 * missing feature, it is the wrong email to a real person.
 *
 * The check is deliberately crude — the reason string must appear in the cron's
 * source. A branch that merely mentions it and does nothing would pass. It costs
 * one line to satisfy honestly and it makes adding a reason a two-file change,
 * which is the property that was missing.
 */
{
  const { WAITLIST_BLOCKED_REASONS } = await import('../lib/waitlistReasons.js');
  const cron = read('pages/api/cron/notify-waitlist.js');
  t('there is at least one waitlist reason to check', WAITLIST_BLOCKED_REASONS.length > 0);
  for (const reason of WAITLIST_BLOCKED_REASONS) {
    t(`notify-waitlist branches on "${reason}" instead of letting it reach the generic reminder`,
      new RegExp(`blocked_reason\\s*===\\s*['"]${reason}['"]`).test(cron));
  }
}

/**
 * ============================================================================
 * THE CODE LIST AND THE DATABASE CONSTRAINT MUST AGREE. 7 Sept 2026.
 * ============================================================================
 * This is the defect scripts/sql/check_events.sql's header is written about, and
 * which it calls "still-open" — because it was, until today.
 *
 *   waitlist.blocked_reason carries a CHECK constraint listing permitted
 *   reasons. lib/waitlistReasons.js grew a third, `fl_not_eligible`; the
 *   constraint did not. Every insert carrying it failed and the leads were lost
 *   — the Save Our Homes bucket, plausibly the largest capture category on the
 *   site.
 *
 * `fl_not_eligible` is the DEFAULT argument of joinList() in pages/check.js, so
 * it is what the email box writes on the Save Our Homes refusal and on the
 * out-of-state branch — the two places a refused visitor is asked to stay in
 * touch.
 *
 * check_events has no constraint at all precisely to avoid this shape, and moved
 * enforcement to where the build can see it. The waitlist kept its constraint,
 * so the comparison has to happen here instead: the permitted values are parsed
 * back OUT of the migration and compared to the module.
 *
 * INJECTION: add a fourth reason to lib/waitlistReasons.js without touching the
 * SQL -> FAILS, naming it.
 */
{
  const { WAITLIST_BLOCKED_REASONS } = await import('../lib/waitlistReasons.js');

  /**
   * The LAST matching constraint across the migrations wins, because a later
   * file drops and re-adds it. Reading only the original would compare against a
   * list that is no longer in force.
   */
  const sqlFiles = [
    'scripts/sql/waitlist_blocked_reason.sql',
    'scripts/sql/waitlist_blocked_reason_fl_not_eligible.sql',
    'scripts/sql/waitlist_blocked_reason_ga_county_not_open.sql',
    'scripts/sql/waitlist_blocked_reason_tx_county_not_open.sql',
    'scripts/sql/waitlist_blocked_reason_tx_awaiting_data.sql',
  ];
  let permitted = null; let fromFile = null;
  for (const f of sqlFiles) {
    let src; try { src = read(f); } catch { continue; }
    const blocks = [...src.matchAll(/blocked_reason\s+in\s*\(([^)]*)\)/gi)];
    if (!blocks.length) continue;
    permitted = [...blocks[blocks.length - 1][1].matchAll(/'([a-z0-9_]+)'/gi)].map((m) => m[1]);
    fromFile = f;
  }

  t('a blocked_reason CHECK constraint was found in the migrations', Array.isArray(permitted));

  if (permitted) {
    const missingInSql = WAITLIST_BLOCKED_REASONS.filter((r) => !permitted.includes(r));
    const missingInCode = permitted.filter((r) => !WAITLIST_BLOCKED_REASONS.includes(r));

    t(`every waitlist reason the code can emit is permitted by the constraint${
      missingInSql.length ? ` — rejected by the database: ${missingInSql.join(', ')}` : ''}`,
      missingInSql.length === 0);

    t(`the constraint permits nothing the code cannot emit${
      missingInCode.length ? ` — dead values in ${fromFile}: ${missingInCode.join(', ')}` : ''}`,
      missingInCode.length === 0);

    /**
     * Named explicitly as well as compared, because this is the one that was
     * actually lost and a generic set-difference failure reads as a chore.
     */
    t('fl_not_eligible — the default reason on the /check email box — is permitted',
      permitted.includes('fl_not_eligible'));
  }
}

if (failures.length) {
  console.error(`verify-emails: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-emails: ${pass} passed — receipts say only what is true for the order's actual status`);
