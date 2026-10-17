/**
 * components/FlKitStep.js — the Florida step of the apply funnel (Kit model,
 * 16 Oct 2026; Nathan: "Kit wording everywhere").
 *
 * Asks the two things only the owner knows (the petition deadline printed on
 * their TRIM notice, and whether they will attend the hearing), runs the
 * "should you petition?" check on the server (/api/fl-kit-quote, our copy of
 * the county roll and the property appraiser's qualified sales), and only when
 * the answer is yes AND the county is open offers the $89 kit. The county's
 * filing fee is shown as the owner's own cost, paid by them to the county.
 * Checkout receives the server's kitKey, never the values themselves.
 */
import { useState } from 'react';
import { SERVICE_PRICE_DOLLARS } from '../lib/pricing';
import { C } from '../lib/theme';
import { normalizePerkCode } from '../lib/partnerPerk';
import PartnerCodeField from './PartnerCodeField';
import FreeKitField from './FreeKitField';
import NoticePhoto from './NoticePhoto';

const K = { ink: C.darkNavy, muted: C.mutedGray, line: C.cardLine, bg: C.bg, bad: C.red, btn: C.navy, off: C.mutedGray, white: C.white };
const box = { border: `1px solid ${K.line}`, borderRadius: 10, padding: 16, margin: '14px 0', background: K.white };
const label = { display: 'block', fontWeight: 600, color: K.ink, margin: '14px 0 6px' };
const input = { width: '100%', padding: '10px 12px', border: `1px solid ${K.line}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' };
const help = { fontSize: 13, color: K.muted, marginTop: 4 };
const body = { fontSize: 14.5, lineHeight: 1.7, color: K.ink, margin: '0 0 10px' };
const btn = { width: '100%', padding: '14px 16px', borderRadius: 10, border: 0, background: K.btn, color: K.white, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 16 };
const btnOff = { ...btn, background: K.off, cursor: 'not-allowed' };
const money = (n) => (n == null ? '-' : `$${Math.round(Number(n)).toLocaleString('en-US')}`);

/** Why we will not sell one, keyed by lib/kit/flQuote.js reasons. */
export const FL_NO_CASE_COPY = {
  comps_do_not_support_reduction: "Sales of similar homes near you don't show your just value is too high, so a petition is unlikely to lower it. We won't sell you a kit for that.",
  subject_sold_above_indicated_value: "Your home's own recent sale supports the county's value, so the board would be unlikely to lower it. We won't sell you a kit for that.",
  capped_beyond_reach: 'Your Save Our Homes cap already keeps your taxed value below the just value, so lowering the just value would not change your bill. We won\'t sell you a kit for that.',
  bill_wont_drop_enough: 'Your value may be a little high, but after your cap and exemptions a petition would lower your tax bill by less than it would cost you (our fee plus the county\'s filing fee). We won\'t sell you a kit for that.',
  too_few_comparable_in_size: "There aren't enough recent qualified sales of homes like yours nearby to build strong evidence, so we won't sell you a kit this year.",
  no_qualified_sales: "There aren't enough recent qualified sales near you to build strong evidence, so we won't sell you a kit this year.",
  land_value_not_comparable: "Most of your property's value is in the land, so sales of nearby homes aren't fair evidence for it. We won't sell you a kit for that.",
  subject_has_no_living_area: "The county's roll shows no living area for this home, so we can't compare it with similar homes. Email customerservice@taxappealusa.com and we'll take a look.",
  not_residential: 'This property is not residential on the county roll. We only prepare petitions for homes.',
  roll_not_this_year: "This year's values for your county aren't in our records yet, so we can't check your petition today. Please try again in a few days.",
  no_parcel: "We couldn't find this address on the county roll. Go back and check the address, or email customerservice@taxappealusa.com.",
  ambiguous: 'Several properties share this address. Go back and add your unit number.',
  insufficient_comparables: "There aren't enough recent qualified sales near you to build strong evidence, so we won't sell you a kit this year.",
};

export default function FlKitStep({ property, account, ownerMail, issues = [], costOverrides = {}, attribution = {}, refCode = '', perkCode = '' }) {
  const county = String(property?.county || '').replace(/\s+County$/i, '').trim();
  const [taxYear] = useState(new Date().getFullYear());
  const [trimDeadline, setTrimDeadline] = useState('');
  const [attend, setAttend] = useState(undefined);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [agreed, setAgreed] = useState(false);
  // What the customer typed in the partner coupon field; `perkCode` seeds it.
  const [perkInput, setPerkInput] = useState(perkCode || '');
  // Next year's free kit (lib/kit/guarantee.js): shown by FreeKitField, decided again at checkout.
  const [freeCode, setFreeCode] = useState('');
  const [freeKit, setFreeKit] = useState(false);
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(trimDeadline) && typeof attend === 'boolean';

  const runCheck = async () => {
    setBusy(true); setErr(''); setQuote(null);
    try {
      const r = await fetch('/api/fl-kit-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: { street: property.street, city: property.city, zip: property.zip },
          owner: { name: `${account.firstName} ${account.lastName}`.trim(), street: ownerMail.street, street2: ownerMail.street2 || '', city: ownerMail.city, state: ownerMail.state, zip: ownerMail.zip, phone: account.mobile || '', email: account.email },
          taxYear, trimDeadline, willNotAttend: attend === false, issues, costOverrides,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'The check failed. Please try again.');
      setQuote(j);
      if (j.decision === 'case' && !j.sellable && j.notSellableReason === 'address_not_confirmed' && account.email) {
        fetch('/api/join-waitlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: account.email, name: `${account.firstName} ${account.lastName}`.trim(), state: 'FL', county: j.county || county, propertyAddress: `${property.street}, ${property.city}, FL ${property.zip}`, blockedReason: 'fl_county_unconfirmed' }),
        }).catch(() => {});
      }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const checkout = async () => {
    if (!quote?.kitKey || !agreed) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...attribution,
          email: account.email, firstName: account.firstName, lastName: account.lastName,
          address: `${property.street}, ${property.city}, FL ${property.zip}`, county: quote.county || county,
          assessedValue: quote.justValue ?? null, targetReduction: quote.requestedValue ?? null,
          savings: quote.yearlySaving ?? null,
          ownerStreet: ownerMail.street, ownerCity: ownerMail.city, ownerState: ownerMail.state, ownerZip: ownerMail.zip,
          stateCode: 'FL', kitKey: quote.kitKey, refCode, perkCode: normalizePerkCode(perkInput) || '', freeCode,
        }),
      });
      const j = await r.json();
      if (j.url) { window.location.href = j.url; return; }
      throw new Error(j.error || 'Checkout failed.');
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const feeDollars = quote?.totalCost != null ? quote.totalCost - SERVICE_PRICE_DOLLARS : null;
  const choice = (v, text) => (
    <button type="button" onClick={() => setAttend(v)}
      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 15, cursor: 'pointer', border: `2px solid ${attend === v ? K.ink : K.line}`, background: attend === v ? K.bg : K.white, fontWeight: attend === v ? 700 : 400 }}>
      {text}
    </button>
  );

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '8px 16px 40px', color: K.ink }}>
      <h2 style={{ marginBottom: 4 }}>Let&rsquo;s check whether a petition will lower your tax bill</h2>
      <p style={{ color: K.muted, marginTop: 0 }}>
        We compare your just value with sales the property appraiser itself qualified, and run your bill through your Save Our Homes cap
        and exemptions, <b>before</b> you pay. If a petition won&rsquo;t lower your bill by more than it costs, we&rsquo;ll tell you and we won&rsquo;t sell you one.
      </p>

      <div style={box}>
        <NoticePhoto state="FL" taxYear={taxYear} label="Take a photo of your TRIM notice instead" onRead={(f) => { if (f.trimDeadline) setTrimDeadline(f.trimDeadline); }} />
        <label style={label} htmlFor="fl-deadline">Petition deadline on your TRIM notice</label>
        <input id="fl-deadline" type="date" style={input} value={trimDeadline} onChange={(e) => setTrimDeadline(e.target.value)} />
        <p style={help}>Your TRIM notice (the &ldquo;Notice of Proposed Property Taxes&rdquo;) prints the last day to file a petition with the Value Adjustment Board. Florida counts a petition when the board receives it, so we use this date to decide whether to mail your kit or email it.</p>

        <label style={label}>Will you attend the hearing?</label>
        <div style={{ display: 'flex', gap: 10 }}>{choice(true, 'Yes, I plan to attend')}{choice(false, 'No, consider my evidence without me')}</div>
        <p style={help}>Hearings are short (about 15 minutes) and many counties offer phone or video. If you won&rsquo;t attend, the form says so and your kit includes the second copy of your evidence the board then requires.</p>

        <button style={!ready || busy ? btnOff : btn} disabled={!ready || busy} onClick={runCheck}>{busy && !quote ? 'Checking…' : 'Check my petition'}</button>
        {err && !quote && <p style={{ ...body, color: K.bad, marginTop: 10 }}>{err}</p>}
      </div>

      {quote && quote.decision !== 'case' && (
        <div style={box}>
          <p style={{ fontWeight: 700, margin: '0 0 8px' }}>We won&rsquo;t sell you a petition for this home this year</p>
          <p style={body}>{FL_NO_CASE_COPY[quote.reason] || "Our check doesn't support a petition for this home, so we won't sell you one."}</p>
          <p style={{ ...body, color: K.muted, fontSize: 13.5 }}>We check before you pay, so you never buy a petition that won&rsquo;t lower your bill.</p>
        </div>
      )}

      {quote && quote.decision === 'case' && !quote.sellable && (
        <div style={box}>
          <p style={{ fontWeight: 700, margin: '0 0 8px' }}>Your petition has a case.</p>
          <p style={body}>
            {quote.notSellableReason === 'deadline_too_close'
              ? 'But your deadline is too close for us to get a kit to you in time, so we will not take your money for it.'
              : quote.notSellableReason === 'need_deadline'
              ? 'Please check the deadline you entered: it should be the petition deadline printed on this year’s TRIM notice.'
              : quote.notSellableReason === 'kit_store_unavailable'
              ? 'We can’t take orders for a few minutes. Please try again shortly; nothing has been charged.'
              : `We can’t take orders for ${county ? `${county} County` : 'your county'} yet: we only sell a kit once we have confirmed where its Value Adjustment Board takes petitions and what it charges. ${account?.email ? `We’ll email ${account.email} the moment it opens.` : ''}`}
          </p>
        </div>
      )}

      {quote && quote.decision === 'case' && quote.sellable && (
        <div style={box}>
          <p style={{ fontWeight: 700, margin: '0 0 8px', fontSize: 16 }}>
            {quote.delivery === 'pdf' ? `Your petition kit, as a PDF — $${SERVICE_PRICE_DOLLARS}` : `Your petition kit, mailed to you — $${SERVICE_PRICE_DOLLARS}`}
          </p>
          <p style={body}>
            The county&rsquo;s just value is {money(quote.justValue)}. Sales of similar homes indicate {money(quote.indicatedValue)}, so your petition asks
            for {money(quote.requestedValue)}. If the board agrees, we estimate your yearly tax bill drops by about {money(quote.yearlySaving)}.
          </p>
          {quote.delivery === 'pdf' ? (
            <p style={body}>Your deadline is close, so there isn&rsquo;t time to mail you a printed kit. We email you Form DR-486 filled in and your evidence as a PDF as soon as you pay. You print it, sign it, and hand-deliver or mail it to the Value Adjustment Board yourself.</p>
          ) : (
            <p style={body}>We mail you Form DR-486 filled in, your evidence and a return envelope addressed to the {county} County Value Adjustment Board. A PDF copy of the full kit is also emailed to you today. You sign it and send it.</p>
          )}
          <p style={body}>
            <b>The county&rsquo;s filing fee{feeDollars != null ? ` (${money(feeDollars)})` : ''} is paid by you</b>, to the county, with a check you put in the envelope. It is not part of our fee.
            The board must <b>receive</b> your petition by {quote.deadline ? new Date(`${quote.deadline}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'your deadline'}.
          </p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: K.ink, cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
            <span>I understand TaxAppeal USA prepares my petition and sends it to me. I sign it, pay the county&rsquo;s filing fee and get it to the Value Adjustment Board myself; TaxAppeal USA does not file it, pay the fee, represent me or appear for me.</span>
          </label>
          <FreeKitField kitKey={quote.kitKey} code={freeCode} onCode={setFreeCode} onFree={setFreeKit} />
          {!freeKit && <PartnerCodeField value={perkInput} onChange={setPerkInput} />}
          <button style={!agreed || busy ? btnOff : btn} disabled={!agreed || busy} onClick={checkout}>
            {busy ? 'Opening checkout…' : freeKit ? 'Get my free petition kit' : quote.delivery === 'pdf' ? `Get my petition kit (PDF) — $${SERVICE_PRICE_DOLLARS}` : `Get my petition kit — $${SERVICE_PRICE_DOLLARS}`}
          </button>
          {err && <p style={{ ...body, color: K.bad, marginTop: 10 }}>{err}</p>}
          <p style={{ ...body, color: K.muted, fontSize: 13, marginTop: 10 }}>If the board doesn&rsquo;t lower your value, next year&rsquo;s kit is free.</p>
        </div>
      )}
    </div>
  );
}
