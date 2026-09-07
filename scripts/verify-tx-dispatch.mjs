#!/usr/bin/env node
/**
 * THE TX / GA MAILING GATE — added 7 Sept 2026.
 *
 * ============================================================================
 * A SAFETY RAIL THAT NOTHING IMPORTS IS NOT A SAFETY RAIL
 * ============================================================================
 * lib/appealAddresses.js holds every Texas and Georgia appeal address, and
 * around it: `confirmed` requires two independent official sources of different
 * type, CASS validation, a verifiedOn date that goes stale at 330 days, a
 * blocked-domain list against look-alikes, and 25 guard behaviours proven by
 * reintroducing each bug.
 *
 * On 7 Sept 2026, `grep -rln appealAddresses pages lib` returned one file:
 * itself. The address pages/api/send-letter.js actually mailed to came from the
 * REQUEST BODY — a property-data lookup's `mailingAddress`, carried through
 * checkout metadata. Florida refused to mail on an unconfirmed fee; Texas and
 * Georgia had no gate at all.
 *
 * That is the St. Lucie failure — a petition mailed to the wrong office is not
 * filed, and a missed § 41.44 deadline has no cure — with the rail built,
 * tested, and never bolted on.
 *
 * These assertions exist so it stays bolted on. They are source-level because
 * the alternative is a live Lob call.
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

const { getAppealAddress, isMailable, APPEAL_ADDRESSES, MAX_VERIFIED_AGE_DAYS } =
  await import('../lib/appealAddresses.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

const src = readFileSync(new URL('../pages/api/send-letter.js', import.meta.url), 'utf8');

// ── 1. THE RAIL IS CONNECTED ────────────────────────────────────────────────
/** INJECTION: delete the import from send-letter.js -> all four FAIL. */
t('send-letter imports the verified address table', /from '\.\.\/\.\.\/lib\/appealAddresses'/.test(src));
t('...and looks the county up in it', /getAppealAddress\(stateCode, county\)/.test(src));
t('...and gates on isMailable, not on the caller\'s say-so', /isMailable\(verifiedRow\)/.test(src));
t('...and refuses rather than mailing when the row is not mailable',
  /reason: 'address_not_confirmed'/.test(src));

/**
 * The address MAILED must come from the table, not the body. Checking the row
 * and then using the caller's address would leave the verification decorative —
 * which is a subtler version of the bug this file exists for.
 */
t('the envelope is built from the verified row, not the request body',
  /toName = verifiedRow\.addressee/.test(src) && /address_line1: toLine1/.test(src));
t('the request body no longer addresses the envelope directly',
  !/address_line1: districtAddress/.test(src));

// ── 2. THE GATE ACTUALLY REJECTS WHAT IT SHOULD ─────────────────────────────
/**
 * isMailable is the whole gate, so its refusals are asserted directly rather
 * than trusted. Each mirrors a real failure: St. Lucie (wrong address),
 * Charlotte (a `confirmed` with no date behind it), Richmond (missing city/ZIP).
 */
const good = {
  addressee: 'X', line1: '1 MAIN ST', city: 'Y', stateAbbr: 'TX', zip: '79925',
  confidence: 'confirmed', verifiedOn: '2026-09-01', cassValidated: true,
};
t('a complete, confirmed, CASS-validated, freshly dated row is mailable', isMailable(good));
t('unverified is refused', !isMailable({ ...good, confidence: 'unverified' }));
t('confirmed with no date is refused — the Charlotte shape',
  !isMailable({ ...good, verifiedOn: null }));
t('not CASS-validated is refused', !isMailable({ ...good, cassValidated: false }));
t('missing city or ZIP is refused — the Richmond shape',
  !isMailable({ ...good, city: '' }) && !isMailable({ ...good, zip: '' }));
t(`a row older than ${MAX_VERIFIED_AGE_DAYS} days is refused`,
  !isMailable({ ...good, verifiedOn: '2020-01-01' }));
t('a missing row is refused', !isMailable(null));

// ── 3. THE STATE OF THE TABLE, STATED OUT LOUD ──────────────────────────────
/**
 * Not a pass/fail on coverage — seeding unverified rows is allowed and correct.
 * This prints what is actually mailable so nobody plans a launch against a
 * table that cannot mail, and it names El Paso because that is the county the
 * whole Texas build is aimed at.
 */
for (const state of ['TX', 'GA']) {
  const rows = Object.entries(APPEAL_ADDRESSES[state] || {});
  const mailable = rows.filter(([, r]) => isMailable(r));
  console.log(`  ${state}: ${mailable.length}/${rows.length} counties mailable today`);
}
const elPaso = getAppealAddress('TX', 'El Paso');
t('El Paso has a seeded row to verify against', !!elPaso);
if (elPaso && !isMailable(elPaso)) {
  console.log(`  El Paso is seeded but NOT mailable (${elPaso.confidence}) — one phone call: ${elPaso.phone}`);
}

console.log(failures.length
  ? `verify-tx-dispatch: ${failures.length} FAILED, ${pass} passed\n  ✗ ` + failures.join('\n  ✗ ')
  : `verify-tx-dispatch: ${pass} passed — no TX/GA protest can be mailed to an unconfirmed address`);
process.exit(failures.length ? 1 : 0);
