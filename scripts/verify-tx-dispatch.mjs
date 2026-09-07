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

// ── 4. THE DOCUMENT ROUTING ─────────────────────────────────────────────────
/**
 * generate-50132 WAS ORPHANED. 7 Sept 2026.
 *
 * pages/apply.js branched FL -> generate-dr486, GA -> generate-pt311a, and
 * EVERYTHING ELSE -> generate-letter, a free-form letter written by a model.
 * So the Form 50-132, the § 41.43(b)(3) equity grid and the condition exhibit
 * built that morning were never reachable: a Texas order produced prose.
 *
 * The difference is not stylistic. A paragraph about comparables is argument; a
 * grid of the district's own parcels, with their own account numbers, is
 * evidence, and (b)(3) turns on exactly that median.
 *
 * INJECTION: point the TX branch back at generate-letter -> FAILS.
 */
{
  const apply = readFileSync(new URL('../pages/apply.js', import.meta.url), 'utf8');
  /**
   * Window widened from 900 to 3000 on first run: the explanatory comment
   * between the branch and the fetch is longer than the gap allowed, so a
   * correct file failed. A regex whose window is tuned to today's comment
   * length is a test that breaks when someone documents their work.
   */
  /**
   * MATCH THE CALL, NOT A MENTION.
   *
   * The first version searched for `/api/generate-50132` anywhere after the TX
   * branch. Swapping the actual fetch to generate-letter left it PASSING —
   * because the comment above the call names the route in prose, and the regex
   * matched the documentation. That is the fourth guard today caught testing
   * for a mention instead of the thing.
   */
  const txFetch = /fetch\(\s*["']\/api\/generate-50132["']/.test(apply);
  t('apply.js actually calls the 50-132 generator for Texas', txFetch);
  t('...and no longer sends Texas to the free-form letter',
    txFetch && /stateCode === 'TX'/.test(apply));
  // `filable === false` no longer exists — buildProtest does not refuse on the
  // merits. What used to be a refusal arrives as cautions and is surfaced by the
  // review screen instead.
  t('a weak case from the generator is surfaced, not silently sold',
    /Array\.isArray\(txJson\.cautions\)/.test(apply)
    && !/txJson\.filable === false/.test(apply));

  /**
   * The route takes the account number and CAD and re-reads the roll itself. If
   * it ever accepted values from the client, a browser could assert its own
   * comparables into a filed document.
   */
  const route = readFileSync(new URL('../pages/api/generate-50132.js', import.meta.url), 'utf8');
  t('generate-50132 reads the parcel from the roll, not from the request',
    /from\('tx_parcels'\)/.test(route));

  /**
   * AND IT RESOLVES THE ADDRESS ITSELF.
   *
   * apply.js was wired to send pd.cadId and pd.parcelId. Neither existed —
   * `cadId` appeared in exactly one place in that file, the line reading it,
   * and parcelId comes from the Florida property lookup, which holds no Texas
   * account number. Every Texas order would have arrived as
   * `{ accountNumber: '', cadId: null }` and been refused with a 400.
   *
   * Caught by grepping for what SET the field rather than what read it — the
   * same check that found lib/appealAddresses.js imported by nothing.
   *
   * INJECTION: remove the street fallback from the route -> FAILS.
   */
  t('generate-50132 accepts an address when no account number is supplied',
    /const street = typeof b\.street === 'string'/.test(route)
    && /findParcel\(\{ street, cadId/.test(route));
  t('...and apply.js sends the address rather than a client-held account number',
    /street: addr,/.test(apply) && !/accountNumber: pd\.parcelId/.test(apply));
  t('...and refuses rather than guessing when the roll does not resolve it',
    /found\.status !== TX_LOOKUP\.MATCHED/.test(route));
  t('...and refuses a district we do not hold before querying anything',
    /isCovered\(cadId\)/.test(route));
}

/**
 * And the funnel vocabulary: a Texas verdict must record as an outcome the
 * admin screens already understand, or every Texas check colours grey.
 */
{
  const { TX_REASON_TO_OUTCOME } = await import('../lib/tx/lookup.js');
  const { isKnownOutcome } = await import('../lib/checkOutcomes.js');
  const unmapped = Object.values(TX_REASON_TO_OUTCOME).filter((o) => !isKnownOutcome(o));
  t(`every Texas verdict maps onto the funnel vocabulary${unmapped.length ? ` — unknown: ${unmapped.join(', ')}` : ''}`,
    unmapped.length === 0);

  const qualifySrc = readFileSync(new URL('../lib/tx/qualify.js', import.meta.url), 'utf8');
  const emitted = [...new Set([...qualifySrc.matchAll(/reason: '([a-z_]+)'/g)].map((m) => m[1]))];
  const missing = emitted.filter((r) => !(r in TX_REASON_TO_OUTCOME));
  t(`every reason lib/tx/qualify.js can emit is mapped${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`,
    missing.length === 0);
}

/**
 * WHAT ONE SIDE SENDS, THE OTHER SIDE MUST READ.
 *
 * apply.js has posted `issues` and `costOverrides` to /api/generate-50132 since
 * the Texas branch was written. The route never read either — neither word
 * appeared in the file — so every defect a Texas customer reported was posted,
 * received and dropped, and the condition exhibit lived only in the preview
 * script. Third instance of this shape (see `pd.cadId`), so it gets a guard
 * that checks the RECEIVER, not the sender.
 *
 * INJECTION: drop `issues` from the buildProtest call in generate-50132 -> FAILS.
 */
{
  const route = readFileSync(new URL('../pages/api/generate-50132.js', import.meta.url), 'utf8');
  const apply = readFileSync(new URL('../pages/apply.js', import.meta.url), 'utf8');

  for (const field of ['issues', 'costOverrides']) {
    t(`apply.js still sends ${field} to generate-50132`,
      new RegExp(`${field}:`).test(apply));
    t(`and generate-50132 reads ${field} off the body`,
      new RegExp(`b\\.${field}`).test(route));
    t(`and passes ${field} into buildProtest`,
      new RegExp(`buildProtest\\(\\{[^}]*${field}`, 's').test(route));
  }

  /**
   * A WEAK CASE PAUSES THE FLOW; IT NEVER ENDS IT.
   *
   * This branch has been three things in one day: a thrown Error rendering
   * "Lookup failed" over a Try Again button; a finding screen that was still a
   * dead end; and now a review screen with two equal buttons. buildProtest no
   * longer refuses on the merits, so a Texas order can always be completed.
   *
   * INJECTION: restore the throw, or drop the Continue button -> FAILS.
   */
  const branch = apply.slice(apply.indexOf('if (Array.isArray(txJson.cautions)'), apply.indexOf('} else if (stateCode === \'GA\')'));
  t('cautions are routed to state, not thrown as an error',
    /setTxReview\(/.test(branch) && !/throw/.test(branch));
  t('and a clean packet goes straight through without stopping',
    /applyTxPacket\(txJson, pd\)/.test(branch));

  const screen = apply.slice(apply.indexOf('if (txReview) {'), apply.indexOf('if (errMsg) {'));
  t('there is a review screen for it', screen.length > 500);
  t('which is not styled as a failure', !/Lookup failed|Try Again/.test(screen));
  t('and offers to continue with the protest anyway',
    /applyTxPacket\(txReview\)/.test(screen) && /Continue with my protest/.test(screen));
  t('and says plainly that the decision is the owner’s',
    /decision to file is yours/.test(screen));

  /**
   * ONE FUNCTION BUILDS THE ORDER ON BOTH PATHS.
   *
   * Straight-through and Proceed must produce the same order. Two copies of the
   * assignment would drift, and the drift would only show up in the half of the
   * funnel that carries the weakest cases.
   */
  t('both paths go through applyTxPacket',
    (apply.match(/applyTxPacket\(/g) || []).length >= 2
    && /applyTxPacket\(txJson, pd\)/.test(apply)
    && /applyTxPacket\(txReview\)/.test(apply));

  // Every field the response sends must be read somewhere in apply.js.
  const sent = [...new Set([...route.slice(route.indexOf('success: true, filable: true'))
    .matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]))]
    .filter((f) => !['success', 'filable', 'isTX', 'letterKey', 'confidence'].includes(f));
  const unread = sent.filter((f) => !apply.includes(`txReview.${f}`) && !apply.includes(`j.${f}`)
    && !apply.includes(`txJson.${f}`));
  t(`every field the packet response sends is read${unread.length ? ` — unread: ${unread.join(', ')}` : ''}`,
    unread.length === 0);
}

/**
 * THE CONSENT RECORD SURVIVES THE WHOLE CHAIN.
 *
 * The "we told them, they decided" model is only as good as the evidence that we
 * told them. Five hops have to hold: the review screen shows cautions -> the
 * packet response carries their codes -> applyTxPacket puts them on the order ->
 * checkout sends them as Stripe metadata -> fulfillOrder writes the column.
 *
 * A break anywhere is silent and only discovered in a dispute. This was found by
 * grepping for what READS `txCautions` after I added it: at that point the
 * answer was nothing, in any file. Fourth instance of that shape today.
 *
 * INJECTION: drop txCautions from the checkout body in apply.js -> FAILS.
 */
{
  const apply = readFileSync(new URL('../pages/apply.js', import.meta.url), 'utf8');
  const checkout = readFileSync(new URL('../pages/api/checkout.js', import.meta.url), 'utf8');
  const fulfil = readFileSync(new URL('../lib/fulfillOrder.js', import.meta.url), 'utf8');
  const cols = readFileSync(new URL('../lib/orderColumns.js', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../pages/admin.js', import.meta.url), 'utf8');
  const getOrders = readFileSync(new URL('../pages/api/get-orders.js', import.meta.url), 'utf8');

  t('applyTxPacket records the cautions on the order',
    /txCautions:\s*\(j\.cautions/.test(apply));
  t('and the checkout body carries them', /txCautions:\s*pd\.txCautions/.test(apply));
  t('checkout accepts the field rather than dropping it silently',
    /^txCautions,$/m.test(checkout) && /txCautions:\s*Array\.isArray/.test(checkout));
  t('fulfillOrder writes them to the column',
    /tx_cautions:\s*m\.txCautions/.test(fulfil));
  t('the column is declared, so verify-schema and checkSchema know about it',
    /'tx_cautions'/.test(cols));
  t('get-orders selects it', /'tx_cautions'/.test(getOrders));
  t('and admin shows an operator what the customer was warned about',
    /tx_cautions/.test(admin));

  // Codes only. A caution MESSAGE is prose we may reword; a code is stable and
  // is what a dispute would actually turn on.
  t('what is stored is codes, not the sentences shown',
    /\.map\(\(c\) => c\.code\)/.test(apply));

  const migration = new URL('../scripts/migrations/2026-09-07-tx-cautions.sql', import.meta.url);
  let sql = '';
  try { sql = readFileSync(migration, 'utf8'); } catch { /* reported below */ }
  t('the migration that creates the column is in the repo', sql.length > 0);
  t('and it is safe to re-run', /ADD COLUMN IF NOT EXISTS tx_cautions/.test(sql));
}

console.log(failures.length
  ? `verify-tx-dispatch: ${failures.length} FAILED, ${pass} passed\n  ✗ ` + failures.join('\n  ✗ ')
  : `verify-tx-dispatch: ${pass} passed — no TX/GA protest can be mailed to an unconfirmed address`);
process.exit(failures.length ? 1 : 0);
