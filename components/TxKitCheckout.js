/**
 * components/TxKitCheckout.js — the buying decision on the Texas review screen
 * (Kit model, 15 Oct 2026; Nathan: "Yes, follow GA").
 *
 * pages/apply.js still shows the roll record so the owner confirms it is their
 * house. This component replaces the old "sign and continue to payment" button
 * with the kit answer from /api/generate-50132 (lib/kit/txQuote.js):
 *
 *   no_case                  we say why and sell nothing
 *   case, county not open    we say so and add them to the waitlist
 *   case, sellable           documents-only acknowledgment, then $89 checkout
 *                            with the server's kitKey (never the values)
 */
import { useEffect, useState } from 'react';
import { SERVICE_PRICE_DOLLARS } from '../lib/pricing';
import { C } from '../lib/theme';

const K = { ink: C.darkNavy, muted: C.mutedGray, line: C.cardLine, bg: C.bg, btn: C.navy, off: C.mutedGray, white: C.white, bad: C.red };
const panel = { border: `1px solid ${K.line}`, borderRadius: 10, padding: 18, margin: '14px 0', background: K.white };
const head = { fontSize: 16, fontWeight: 700, color: K.ink, margin: '0 0 8px' };
const body = { fontSize: 14.5, lineHeight: 1.7, color: K.ink, margin: '0 0 10px' };
const btn = { width: '100%', padding: '14px 16px', borderRadius: 10, border: 0, background: K.btn, color: K.white, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 12 };
const btnOff = { ...btn, background: K.off, cursor: 'not-allowed' };

/** Why we will not sell one, keyed by lib/kit/txQuote.js reasons (buildProtest's caution codes). */
export const TX_NO_CASE_COPY = {
  not_over_appraised: "Your home is appraised at or below similar homes nearby, so the district's own roll gives a protest nothing to argue from. We won't sell you a kit for that.",
  capped_beyond_reach: "Your homestead cap already keeps your taxed value below the district's market value, so a protest would have to win more than that gap before your bill moved at all. We won't sell you a kit for that.",
  saving_below_fee: `A protest here would lower your tax bill by less than our $${SERVICE_PRICE_DOLLARS} fee. We won't sell you a kit for that.`,
  bill_wont_drop_enough: `A protest here would lower your tax bill by less than our $${SERVICE_PRICE_DOLLARS} fee. We won't sell you a kit for that.`,
  insufficient_comparables: "There aren't enough similar homes nearby on the district's roll to build strong evidence, so we won't sell you a kit this year.",
  cap_artifact_only: "Your neighbours look lower mainly because their values are capped, not because yours is too high. That is not a case we would sell you.",
  nothing_to_ask_for: "The comparison doesn't support asking for a lower value, so we won't sell you a kit for this home.",
  no_value_on_roll: "The district's roll has no value for this property yet, so there is nothing to protest. We won't sell you a kit for that.",
  no_packet: 'We could not build a protest for this property.',
};

export default function TxKitCheckout({ review, property, account, ownerMail, attribution = {}, refCode = '', perkCode = '', previewUrl = null }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [waitlisted, setWaitlisted] = useState(false);
  const county = String(review?.county || property?.county || '').replace(/\s+County$/i, '').trim();
  const isCase = review?.kitDecision === 'case';

  // A real case in a district we cannot sell yet: save them for the "your
  // county is open" email rather than losing them (same as Georgia).
  useEffect(() => {
    if (!isCase || review?.sellable || waitlisted || !account?.email) return;
    setWaitlisted(true);
    fetch('/api/join-waitlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, name: `${account.firstName || ''} ${account.lastName || ''}`.trim(), state: 'TX', county, propertyAddress: review?.situsAddress || '', blockedReason: 'tx_county_not_open' }),
    }).catch(() => {});
  }, [isCase, review?.sellable, waitlisted, account?.email]);

  const checkout = async () => {
    if (!review?.kitKey || !agreed) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...attribution,
          email: account.email, firstName: account.firstName, lastName: account.lastName,
          address: review.situsAddress || '', county,
          parcelId: review.accountNumber || '',
          assessedValue: review.appraisedValue ?? null, targetReduction: review.requestedValue ?? null,
          savings: review.estimatedSaving ?? null,
          // The consent record (verify-tx-dispatch): codes, never sentences. A
          // sellable kit has none — any caution is a no-sale — so this is [] on
          // every order; it stays wired so the record cannot silently break.
          txCautions: (review.cautions || []).map((c) => c.code),
          ownerStreet: ownerMail?.street, ownerCity: ownerMail?.city, ownerState: ownerMail?.state, ownerZip: ownerMail?.zip,
          stateCode: 'TX', kitKey: review.kitKey, refCode, perkCode,
        }),
      });
      const j = await r.json();
      if (j.url) { window.location.href = j.url; return; }
      throw new Error(j.error || 'Checkout failed.');
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  if (!isCase) {
    return (
      <div style={panel}>
        <p style={head}>We won&rsquo;t sell you a protest for this home this year</p>
        <p style={body}>{TX_NO_CASE_COPY[review?.kitReason] || TX_NO_CASE_COPY.nothing_to_ask_for}</p>
        <p style={{ ...body, color: K.muted, fontSize: 13.5 }}>We check before you pay, so you never buy a protest that won&rsquo;t lower your bill.</p>
      </div>
    );
  }

  if (!review?.sellable && review?.notSellableReason === 'kit_store_unavailable') {
    return (
      <div style={panel}>
        <p style={head}>Your protest has a case.</p>
        <p style={body}>We can&rsquo;t take orders for a few minutes. Please try again shortly; nothing has been charged.</p>
      </div>
    );
  }

  if (!review?.sellable) {
    return (
      <div style={panel}>
        <p style={head}>Your protest has a case. We can&rsquo;t take orders for {county ? `${county} County` : 'your county'} yet.</p>
        <p style={body}>
          We only sell a kit once we have confirmed where your appraisal district takes protests, so the envelope we send you is
          addressed correctly. {account?.email ? `We'll email ${account.email} the moment ${county || 'your county'} opens.` : "Leave your email and we'll write when it opens."}
        </p>
      </div>
    );
  }

  return (
    <div style={panel}>
      <p style={head}>Your protest kit, mailed to you &mdash; ${SERVICE_PRICE_DOLLARS}</p>
      <p style={body}>
        We mail you the Comptroller&rsquo;s Form 50-132 filled in, the comparison of similar homes from the district&rsquo;s own roll,
        and a return envelope addressed to the appraisal district. We email you the same kit as a PDF today. You sign it,
        add postage and mail it.
      </p>
      {previewUrl && (
        <p style={body}><a href={previewUrl} target="_blank" rel="noopener noreferrer">See page one of your filled Form 50-132 (preview)</a></p>
      )}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: K.ink, cursor: 'pointer' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
        <span>I understand TaxAppeal USA prepares my protest and mails it to me. I sign and mail it myself; TaxAppeal USA does not file it, represent me or appear for me.</span>
      </label>
      <button style={!agreed || busy ? btnOff : btn} disabled={!agreed || busy} onClick={checkout}>
        {busy ? 'Opening checkout…' : `Get my protest kit — $${SERVICE_PRICE_DOLLARS}`}
      </button>
      {err && <p style={{ ...body, color: K.bad, marginTop: 10 }}>{err}</p>}
      <p style={{ ...body, color: K.muted, fontSize: 13, marginTop: 10 }}>
        If the district doesn&rsquo;t lower your value, next year&rsquo;s kit is free.
      </p>
    </div>
  );
}
