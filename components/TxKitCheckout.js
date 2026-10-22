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
import { normalizePerkCode } from '../lib/partnerPerk';
import PartnerCodeField from './PartnerCodeField';
import FreeKitField from './FreeKitField';

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

/**
 * THE HEARING DISCLOSURE, on the screen where the Texas kit is bought (17 Oct
 * 2026: it lived on the old letter screen, which kit buyers never reached).
 * verify-tx-form holds every element: boards' practice, not statute; the
 * four-day s. 41.45(e-1) cure beside the dismissal risk; who gets the notice.
 */
function HearingNote() {
  return (
    <p style={{ ...body, color: K.muted, fontSize: 13, marginTop: 10 }}>
      <strong style={{ color: K.ink }}>Most protests never reach a hearing.</strong>{' '}
      Your form asks the appraisal district for an informal conference, which is where most are settled.
      If your district does set a hearing, it is yours to attend &mdash; in person, by phone or by video &mdash; or you can
      deliver a sworn affidavit with your evidence before it begins. Appraisal review boards generally dismiss a protest
      when the owner does neither, though Texas law lets you request a new hearing if you file a written statement showing
      good cause within four days of the missed hearing. TaxAppeal does not attend hearings, and your appraisal district
      sends the hearing notice to you, not to us.
    </p>
  );
}

export default function TxKitCheckout({ review, property, account, ownerMail, attribution = {}, refCode = '', perkCode = '', previewUrl = null }) {
  const [agreed, setAgreed] = useState(false);
  // What the customer typed in the partner coupon field; `perkCode` seeds it.
  const [perkInput, setPerkInput] = useState(perkCode || '');
  // Next year's free kit (lib/kit/guarantee.js): shown by FreeKitField, decided again at checkout.
  const [freeCode, setFreeCode] = useState('');
  const [freeKit, setFreeKit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [waitlisted, setWaitlisted] = useState(false);
  const county = String(review?.county || property?.county || '').replace(/\s+County$/i, '').trim();
  const isCase = review?.kitDecision === 'case';

  // A real case in a district we cannot sell yet: save them for the "your
  // county is open" email rather than losing them (same as Georgia).
  // No data before the deadline last year (lib/tx/inSeason.js): a different
  // promise, "we'll write if your district publishes in time". Past the cut-off
  // there is nothing to wait for, so no waitlist.
  const noSeasonData = review?.notSellableReason === 'no_season_data';
  const pastCutoff = review?.notSellableReason === 'past_data_cutoff';
  const deadlineText = review?.timing?.deadlineText || 'your deadline';
  useEffect(() => {
    if (!isCase || review?.sellable || pastCutoff || waitlisted || !account?.email) return;
    setWaitlisted(true);
    fetch('/api/join-waitlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, name: `${account.firstName || ''} ${account.lastName || ''}`.trim(), state: 'TX', county, propertyAddress: review?.situsAddress || '', blockedReason: noSeasonData ? 'tx_awaiting_data' : 'tx_county_not_open' }),
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
          stateCode: 'TX', kitKey: review.kitKey, refCode, perkCode: normalizePerkCode(perkInput) || '', freeCode,
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

  if (!review?.sellable && noSeasonData) {
    return (
      <div style={panel}>
        <p style={head}>Your protest has a case. We can&rsquo;t take an order for {county ? `${county} County` : 'your county'} yet.</p>
        <p style={body}>
          We build your kit from the appraisal district&rsquo;s own data for this year. Last year {county ? `the ${county} County district` : 'your district'} did
          not publish that data until after the protest deadline, so we can&rsquo;t promise you a kit in time, and we won&rsquo;t take your money for one.
          {account?.email ? ` If it publishes in time this year, we'll email ${account.email} and you can order then.` : ' Leave your email and we will write if it publishes in time this year.'}
        </p>
        <p style={{ ...body, color: K.muted, fontSize: 13.5 }}>
          Either way you can protest on your own: file the Comptroller&rsquo;s{' '}
          <a href="https://comptroller.texas.gov/forms/50-132.pdf" target="_blank" rel="noopener noreferrer">Form 50-132</a> with the appraisal district by {deadlineText}.
        </p>
      </div>
    );
  }

  if (!review?.sellable && pastCutoff) {
    return (
      <div style={panel}>
        <p style={head}>Your protest has a case, but it is too late for us to build your kit.</p>
        <p style={body}>
          Your appraisal district hasn&rsquo;t published this year&rsquo;s data yet, and the {deadlineText} deadline is too close to wait for it.
          We won&rsquo;t take payment for a kit we can&rsquo;t send in time.
        </p>
        <p style={body}>
          You can still protest: file the Comptroller&rsquo;s{' '}
          <a href="https://comptroller.texas.gov/forms/50-132.pdf" target="_blank" rel="noopener noreferrer">Form 50-132</a> with the appraisal district,
          postmarked by {deadlineText}. Tick box 1 in Section 3 and ask for an informal conference; you can bring your evidence to that conference.
        </p>
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

  // PRE-SALE (16 Oct 2026): screened on last year's roll; built on this year's
  // when the district publishes it (lib/kit/txPresale.js), or refunded in full.
  if (review?.presale) {
    return (
      <div style={panel}>
        <p style={head}>Reserve your protest kit &mdash; ${SERVICE_PRICE_DOLLARS}</p>
        <p style={body}>
          On last year&rsquo;s values your home already looks over-appraised.
        </p>
        <p style={body}>
          <strong>When your kit goes out.</strong>{' '}
          {review?.timing?.paragraph || `We build your kit from your appraisal district's ${review.taxYear} data file, not from your notice, so it does not go out the day notices arrive.`}
        </p>
        <p style={body}>
          When the data is loaded, we check your protest again on the new values, automatically. If it still lowers your bill, we mail you
          the Comptroller&rsquo;s Form 50-132 filled in, the comparison of similar homes and a return envelope addressed to the
          appraisal district, and email you a PDF copy of the full kit the same day. If it no longer does, we refund you in full before anything is mailed.
          You don&rsquo;t need to do anything until then.
        </p>
        <HearingNote />
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: K.ink, cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
          <span>I understand TaxAppeal USA prepares my protest and mails it to me. I sign and mail it myself; TaxAppeal USA does not file it, represent me or appear for me. If this year&rsquo;s values no longer show a case, I am refunded in full.</span>
        </label>
        <PartnerCodeField value={perkInput} onChange={setPerkInput} />
        <button style={!agreed || busy ? btnOff : btn} disabled={!agreed || busy} onClick={checkout}>
          {busy ? 'Opening checkout\u2026' : `Reserve my protest kit \u2014 $${SERVICE_PRICE_DOLLARS}`}
        </button>
        {err && <p style={{ ...body, color: K.bad, marginTop: 10 }}>{err}</p>}
      </div>
    );
  }

  return (
    <div style={panel}>
      {review?.delivery === 'pdf' ? (<>
        <p style={head}>Your protest kit, as a PDF &mdash; ${SERVICE_PRICE_DOLLARS}</p>
        <p style={body}>
          Your deadline is close, so there isn&rsquo;t time to mail you a printed kit. We email you the Comptroller&rsquo;s Form 50-132
          filled in and the comparison of similar homes as a PDF as soon as you pay. You print it, sign it and mail it to the
          appraisal district yourself.
        </p>
      </>) : (<>
        <p style={head}>Your protest kit, mailed to you &mdash; ${SERVICE_PRICE_DOLLARS}</p>
        <p style={body}>
          We mail you the Comptroller&rsquo;s Form 50-132 filled in, the comparison of similar homes from the district&rsquo;s own roll,
          and a return envelope addressed to the appraisal district. A PDF copy of the full kit is also emailed to you today. You sign it,
          add postage and mail it.
        </p>
      </>)}
      {previewUrl && (
        <p style={body}><a href={previewUrl} target="_blank" rel="noopener noreferrer">See page one of your filled Form 50-132 (preview)</a></p>
      )}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: K.ink, cursor: 'pointer' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
        <span>I understand TaxAppeal USA prepares my protest and mails it to me. I sign and mail it myself; TaxAppeal USA does not file it, represent me or appear for me.</span>
      </label>
      <FreeKitField kitKey={review.kitKey} code={freeCode} onCode={setFreeCode} onFree={setFreeKit} />
      {!freeKit && <PartnerCodeField value={perkInput} onChange={setPerkInput} />}
      <button style={!agreed || busy ? btnOff : btn} disabled={!agreed || busy} onClick={checkout}>
        {busy ? 'Opening checkout…' : freeKit ? 'Get my free protest kit' : review?.delivery === 'pdf' ? `Get my protest kit (PDF) — $${SERVICE_PRICE_DOLLARS}` : `Get my protest kit — $${SERVICE_PRICE_DOLLARS}`}
      </button>
      {err && <p style={{ ...body, color: K.bad, marginTop: 10 }}>{err}</p>}
      <p style={{ ...body, color: K.muted, fontSize: 13, marginTop: 10 }}>
        If the district doesn&rsquo;t lower your value, next year&rsquo;s kit is free.
      </p>
      <HearingNote />
    </div>
  );
}
