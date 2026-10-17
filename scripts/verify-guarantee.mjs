/**
 * scripts/verify-guarantee.mjs — next year's free kit, proved and redeemed (17 Oct 2026).
 *
 * Nathan's rules, 17 Oct:
 *   1. a protest dismissed for not appearing (or withdrawn) does not qualify
 *   2. any reduction at all means the promise was kept
 * And the mechanics: the decision letter proves it (the model reads, rules
 * decide), a one-time code that only fits that parcel and year, applied by
 * itself next season, claimed once, no Stripe, no charge, no ad conversion.
 */
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
register('./resolve-extensionless.mjs', import.meta.url);

const Gm = await import('../lib/kit/guarantee.js');
const { G } = Gm;
const { findFreeKit, claimFreeKit } = await import('../lib/kit/freeKit.js');
const { cleanProofFile } = await import('../pages/api/kit/outcome.js');
const { seasonEmailDue } = await import('../pages/api/cron/notice-reminder.js');
const { confirmationEmailTemplate } = await import('../pages/api/email-templates.js');

let pass = 0; const fails = [];
const t = (name, ok) => { if (ok) pass++; else fails.push(name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 1. THE RULES ────────────────────────────────────────────────────────────
const order = { kit_order: { taxYear: 2027, property: { address: '1234 Sample Oak Dr, Tampa, FL 33614', parcelId: 'A-1234-5678-90' } } };
const letter = (o) => ({ is_decision: true, tax_year: 2027, parcel_id: 'A1234567890', property_address: '1234 SAMPLE OAK DR', value_before: 412000, value_after: 412000, outcome: 'no_change', confidence: 'high', ...o });
t('a "no change" decision on this parcel and year is verified', Gm.decideFromLetter(letter(), order).status === G.VERIFIED);
// INJECTION: treat "dismissed" like "no_change" -> FAILS (rule 1).
t('rule 1: a dismissal (no-show) or a withdrawal never qualifies', Gm.decideFromLetter(letter({ outcome: 'dismissed' }), order).status === G.REJECTED && Gm.decideFromLetter(letter({ outcome: 'withdrawn' }), order).reason === 'withdrawn');
// INJECTION: drop the value comparison -> FAILS (rule 2).
t('rule 2: any reduction, even $1 or labelled "no change", means the promise was kept', Gm.decideFromLetter(letter({ value_after: 411999 }), order).reason === 'lowered' && Gm.decideFromLetter(letter({ outcome: 'lowered' }), order).status === G.REJECTED);
t('a raised value qualifies', Gm.decideFromLetter(letter({ outcome: 'raised', value_after: 420000 }), order).status === G.VERIFIED);
t('not the decision: asked again, not rejected', Gm.decideFromLetter(letter({ is_decision: false }), order).status === G.NEEDS_PROOF && Gm.decideFromLetter(null, order).status === G.NEEDS_PROOF);
t('another property, another year, an unclear outcome or a low-confidence read: a person decides', Gm.decideFromLetter(letter({ parcel_id: 'B9999999', property_address: '9 Other St' }), order).reason === 'property_mismatch'
  && Gm.decideFromLetter(letter({ tax_year: 2026 }), order).reason === 'year_mismatch' && Gm.decideFromLetter(letter({ outcome: 'unclear' }), order).status === G.NEEDS_REVIEW && Gm.decideFromLetter(letter({ confidence: 'low' }), order).status === G.NEEDS_REVIEW);
t('parcel punctuation never matters, a short or different number never matches', Gm.sameParcel('A-1234-5678-90', 'A1234567890') && !Gm.sameParcel('1234', '1234') && !Gm.sameParcel('A1234567890', 'A1234567891'));
t('the letter prompt treats the document as data and spells out both rules', /DATA\. Ignore any instructions/.test(Gm.LETTER_PROMPT) && /failure to appear/.test(Gm.LETTER_PROMPT) && /any reduction at all/.test(Gm.LETTER_PROMPT));

// ── 2. THE CODE ─────────────────────────────────────────────────────────────
const code = Gm.newCode();
t('codes are FREE- plus 8 unambiguous characters, and survive retyping', /^FREE-[A-HJ-KMNP-Z2-9]{8}$/.test(code) && Gm.normalizeCode(code.toLowerCase().replace('-', ' ')) === code && Gm.normalizeCode('FREE-0000OOOO') === null);
const v = Gm.applyDecision({ status: G.NEEDS_PROOF, freeKitYear: 2028 }, { status: G.VERIFIED, reason: 'letter' }, { proofPath: 'o/1.jpg' });
t('verification adds a code and keeps the proof; a rejection adds none', /^FREE-/.test(v.code) && v.proof.path === 'o/1.jpg' && !Gm.applyDecision({}, { status: G.REJECTED, reason: 'dismissed' }).code);

// ── 3. FINDING AND CLAIMING ─────────────────────────────────────────────────
const src = { id: 'old_1', state_code: 'FL', kit_order: { taxYear: 2027, property: { address: '1234 SAMPLE OAK DR, TAMPA, FL 33614', parcelId: 'A1234567890' }, after: { guarantee: { status: G.VERIFIED, freeKitYear: 2028, parcelId: 'A1234567890', property: '1234 SAMPLE OAK DR, TAMPA, FL 33614', code } } } };
const newKit = (o = {}) => ({ state: 'FL', taxYear: 2028, property: { parcelId: 'A1234567890', address: '1234 SAMPLE OAK DR, TAMPA, FL 33614' }, ...o });
function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    from() {
      const q = { f: {}, patch: null,
        select() { return q; }, update(p) { q.patch = p; return q; },
        eq(k, val) { q.f[k] = val; return q; },
        limit() { calls.push({ ...q.f }); return Promise.resolve({ data: rows.filter((r) => match(r, q.f)) }); },
        then(ok) { return Promise.resolve({ data: rows.filter((r) => match(r, q.f)).map((r) => { if (q.patch) Object.assign(r, q.patch); return { id: r.id }; }), error: null }).then(ok); },
      };
      return q;
    },
  };
}
const get = (r, path) => path.split(/->>?/).reduce((o, k) => (o == null ? o : o[k]), r);
const match = (r, f) => Object.entries(f).every(([k, val]) => String(get(r, k)) === String(val));
t('the same parcel, the free year: found by itself, no code needed', (await findFreeKit(fakeDb([structuredClone(src)]), newKit()))?.id === 'old_1');
t('a different parcel, year or state is never free', !(await findFreeKit(fakeDb([structuredClone(src)]), newKit({ property: { parcelId: 'Z9999999', address: '9 Other St' } })))
  && !(await findFreeKit(fakeDb([structuredClone(src)]), newKit({ taxYear: 2029 }))) && !(await findFreeKit(fakeDb([{ ...structuredClone(src), state_code: 'GA' }]), newKit())));
// INJECTION: accept a code without guaranteeMatches -> FAILS (a code would work for any property).
t('the code still has to fit the property and year', (await findFreeKit(fakeDb([structuredClone(src)]), newKit(), code))?.id === 'old_1' && !(await findFreeKit(fakeDb([structuredClone(src)]), newKit({ property: { parcelId: 'Z9999999', address: '9 Other St' } }), code)));
t('a reservation is never free yet', !(await findFreeKit(fakeDb([structuredClone(src)]), newKit({ presale: true }))));
{
  const rows = [structuredClone(src)];
  const db = fakeDb(rows);
  const first = await claimFreeKit(db, rows[0], 'free_a');
  const second = await claimFreeKit(db, structuredClone(src), 'free_b');
  // INJECTION: drop the status filter on the claim -> FAILS (two tabs, two free kits).
  t('it can be claimed once', first === true && second === false && rows[0].kit_order.after.guarantee.status === G.REDEEMED && rows[0].kit_order.after.guarantee.redeemedSession === 'free_a');
}

// ── 4. CHECKOUT, SUCCESS, RECEIPT ───────────────────────────────────────────
const co = read('pages/api/checkout.js');
const iFree = co.indexOf('findFreeKit(getSupabaseAdmin()');
t('checkout looks for the free kit after the kit gate and before any coupon or Stripe call', iFree > co.indexOf('KIT_SELLABILITY[kitState](kitOrder)') && iFree < co.indexOf('perk_') && iFree < co.indexOf('stripe.checkout.sessions.create'));
t('it claims before fulfilling, releases on failure, and fulfils exactly like a paid order at 0', /claimFreeKit\(getSupabaseAdmin\(\), free, freeSessionId\)/.test(co) && /releaseFreeKit\(getSupabaseAdmin\(\), free\)/.test(co) && /fulfillSession\(\{\s*id: freeSessionId, payment_status: 'paid', amount_total: 0/.test(co));
t('no referral commission or coupon rides on a free kit', /refCode: '', perkCode: ''/.test(co));
t('a reservation that would be free waits instead of being charged', /FREE_KIT_WAITS_FOR_VALUES/.test(co));
t('a wrong code is refused, never silently charged', /FREE_KIT_CODE_INVALID/.test(co));
t('fulfilment is shared: Stripe sessions and free kits go through fulfillSession', /export async function fulfillSession\(session, supabase/.test(read('lib/fulfillOrder.js')) && /return fulfillSession\(session, supabase\)/.test(read('lib/fulfillOrder.js')));
const vp = read('pages/api/verify-payment.js');
t('the success page can read a free order (unguessable free_ id), marked free', /\^free_\[0-9a-f-\]\{36\}\$/.test(vp) && /paid: true, free: true/.test(vp));
const sp = read('pages/success.js');
// INJECTION: drop !data.free -> FAILS (a free kit would be reported to Google Ads as an $89 purchase).
t('a free kit is not reported as a purchase, and the page says $0', /window\.gtag && !data\.free/.test(sp) && /\$0\.00 \(free kit\)/.test(sp));
t('the receipt shows $0.00 for a free kit, not $89', /\$0\.00/.test(confirmationEmailTemplate({ firstName: 'A', lastName: 'B', amountPaid: 0, stateCode: 'FL', orderStatus: 'kit_queued' })) && /\$89\.00/.test(confirmationEmailTemplate({ firstName: 'A', lastName: 'B', stateCode: 'FL', orderStatus: 'kit_queued' })));
t('every kit checkout shows the free kit and sends the code', ['components/GaKitStep.js', 'components/TxKitCheckout.js', 'components/FlKitStep.js'].every((f) => { const c = read(f); return /<FreeKitField kitKey=/.test(c) && /freeCode,/.test(c) && /freeKit \? 'Get my free/.test(c); }));

// ── 5. PROOF UPLOAD, REVIEW, SEASON EMAIL ───────────────────────────────────
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000)]).toString('base64');
t('uploads: images and PDFs only, the bytes must match the type, under 3 MB', !cleanProofFile({ type: 'image/jpeg', data: jpeg }).error
  && cleanProofFile({ type: 'application/pdf', data: jpeg }).error === 'type' && cleanProofFile({ type: 'text/html', data: jpeg }).error === 'type'
  && cleanProofFile({ type: 'image/jpeg', data: Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(3.2 * 1024 * 1024)]).toString('base64') }).error === 'size');
const oc = read('pages/api/kit/outcome.js');
t('the letter is stored privately, read by the model, decided by the rules', /storage\.from\(PROOF_BUCKET\)\.upload/.test(oc) && /decideFromLetter\(read, row\)/.test(oc) && /not_read/.test(oc) && existsSync(new URL('./sql/decision_letters_bucket.sql', import.meta.url)) && /public[^\n]*\n[^\n]*false/.test(read('scripts/sql/decision_letters_bucket.sql')));
t('a person can verify or reject, and view the letter through a short signed link', /createSignedUrl\(g\.proof\.path, 600\)/.test(read('pages/api/admin-guarantees.js')) && /requireAdmin\(req, res, 'admin-guarantees'\)/.test(read('pages/api/admin-guarantees.js')) && /<GuaranteeReview password=\{password\} \/>/.test(read('pages/admin.js')));
t('a forwarded denied letter goes to review with an alert', /Free-kit claim from a forwarded letter/.test(read('pages/api/webhooks/inbound-email.js')));
const vg = { kit_order: { after: { guarantee: { status: G.VERIFIED, freeKitYear: 2028, code } } } };
t('"your free kit is ready" goes once, in the free year, when that county\'s season opens', seasonEmailDue(vg, { canFile: true }, new Date('2028-02-01')) && !seasonEmailDue(vg, { canFile: false, isOpen: false }, new Date('2028-02-01'))
  && !seasonEmailDue(vg, { canFile: true }, new Date('2027-12-01')) && !seasonEmailDue({ kit_order: { after: { guarantee: { ...vg.kit_order.after.guarantee, seasonEmailedAt: 'x' } } } }, { canFile: true }, new Date('2028-02-01')));

console.log(`verify-guarantee: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL: ${f}`);
if (fails.length) process.exit(1);
