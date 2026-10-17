/**
 * components/GaKitStep.js — the Georgia step of the apply funnel (Kit model).
 *
 * Asks the four things only the owner knows (the value and date on the notice,
 * homestead, and any question the county's own form asks), runs the
 * "should you appeal?" check on the server (/api/ga-kit-quote), shows the
 * answer, and only when the answer is yes AND the county is open offers the
 * $89 kit. Checkout receives the server's kitKey, never the values themselves.
 */
import { useState } from 'react';
import { SERVICE_PRICE_DOLLARS } from '../lib/pricing';
import { C } from '../lib/theme';
import { normalizePerkCode } from '../lib/partnerPerk';
import PartnerCodeField from './PartnerCodeField';
import FreeKitField from './FreeKitField';

// The site palette (lib/theme.js), named for what this step uses it for.
const K = { ink: C.darkNavy, muted: C.mutedGray, line: C.cardLine, good: C.green, warn: C.navy, bg: C.bg, bad: C.red, btn: C.navy, off: C.mutedGray, white: C.white };
const box = { border: `1px solid ${K.line}`, borderRadius: 10, padding: 16, margin: '14px 0', background: K.white };
const label = { display: 'block', fontWeight: 600, color: K.ink, margin: '14px 0 6px' };
const input = { width: '100%', padding: '10px 12px', border: `1px solid ${K.line}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' };
const help = { fontSize: 13, color: K.muted, marginTop: 4 };
const btn = { width: '100%', padding: '14px 16px', borderRadius: 10, border: 0, background: K.btn, color: K.white, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 16 };
const btnOff = { ...btn, background: K.off, cursor: 'not-allowed' };
const money = (n) => (n == null ? '-' : `$${Math.round(Number(n)).toLocaleString('en-US')}`);

const NO_CASE_COPY = {
  not_over_assessed: "Recent sales of similar homes don't show your home's value is too high, so an appeal is unlikely to lower it. We won't sell you a kit for that.",
  bill_wont_drop_enough: "Your value may be a little high, but after your county's caps and exemptions an appeal would lower your tax bill by less than our $89 fee. We won't sell you a kit for that.",
  too_few_comps: "There aren't enough recent sales of similar homes near you to build strong evidence, so we won't sell you a kit this year.",
  no_property_record: "We couldn't find this home in the property records, so we can't check it automatically. Email customerservice@taxappealusa.com and we'll take a look.",
  not_georgia: 'This step is for Georgia homes.',
};

function YesNo({ value, onChange, yes = 'Yes', no = 'No' }) {
  const opt = (v, text) => (
    <button type="button" onClick={() => onChange(v)}
      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 15, cursor: 'pointer',
        border: `2px solid ${value === v ? K.ink : K.line}`, background: value === v ? K.bg : K.white, fontWeight: value === v ? 700 : 400 }}>
      {text}
    </button>
  );
  return <div style={{ display: 'flex', gap: 10 }}>{opt(true, yes)}{opt(false, no)}</div>;
}

export default function GaKitStep({ property, account, ownerMail, attribution = {}, refCode = '', perkCode = '' }) {
  const county = String(property?.county || '').replace(/\s+County$/i, '').trim();
  const isChatham = /^chatham$/i.test(county);
  const isFulton = /^fulton$/i.test(county);
  const [taxYear] = useState(new Date().getFullYear());
  const [noticeValue, setNoticeValue] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [homestead, setHomestead] = useState(undefined);
  const [ownedOnJan1, setOwnedOnJan1] = useState(undefined);
  const [fultonBilling100, setFultonBilling100] = useState(undefined);
  const [virtualHearing, setVirtualHearing] = useState(undefined);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [agreed, setAgreed] = useState(false);
  // What the customer typed in the partner coupon field; `perkCode` seeds it.
  const [perkInput, setPerkInput] = useState(perkCode || '');
  // Next year's free kit (lib/kit/guarantee.js): shown by FreeKitField, decided again at checkout.
  const [freeCode, setFreeCode] = useState('');
  const [freeKit, setFreeKit] = useState(false);
  // PRE-SALE (16 Oct 2026). Before the notice arrives, the check runs on LAST
  // year's value (lib/kit/gaQuote.js presaleGaKit) and the kit is built when the
  // notice comes in, or refunded in full.
  const [arrived, setArrived] = useState(undefined);
  const [priorValue, setPriorValue] = useState('');
  const [priorValueConfirmed, setPriorValueConfirmed] = useState(false);
  const presale = arrived === false;
  // We look last year's value up ourselves where the county publishes it
  // (lib/ga/priorValue.js); the box only appears when we could not.
  const [askPrior, setAskPrior] = useState(false);

  const ready = presale
    ? typeof homestead === 'boolean' && (!askPrior || Number(String(priorValue).replace(/[^0-9]/g, '')) > 0)
    : arrived === true && Number(String(noticeValue).replace(/[^0-9]/g, '')) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(noticeDate)
    && typeof homestead === 'boolean'
    && (!isChatham || typeof ownedOnJan1 === 'boolean')
    && (!isFulton || typeof fultonBilling100 === 'boolean');

  const runCheck = async (confirmed = priorValueConfirmed) => {
    setBusy(true); setErr(''); setQuote(null);
    try {
      const r = await fetch('/api/ga-kit-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: { street: property.street, city: property.city, state: 'GA', zip: property.zip, county },
          owner: { name: `${account.firstName} ${account.lastName}`.trim(), street: ownerMail.street, city: ownerMail.city, state: ownerMail.state, zip: ownerMail.zip, phone: account.mobile || '', email: account.email },
          taxYear, homestead, parcelId,
          ...(presale
            ? { presale: true, ...(askPrior ? { priorValue } : {}), priorValueConfirmed: confirmed === true }
            : {
              noticeValue, noticeDate,
              ...(isChatham ? { ownedOnJan1 } : {}),
              ...(isFulton ? { fultonBilling100, ...(typeof virtualHearing === 'boolean' ? { virtualHearing } : {}) } : {}),
            }),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'The check failed. Please try again.');
      setQuote(j);
      if (j.presale && j.reason === 'need_prior_value') setAskPrior(true);
      // A real case in a county we cannot sell yet: save them for the "your
      // county is open" email rather than losing them.
      if (j.decision === 'case' && !j.sellable && account.email) {
        fetch('/api/join-waitlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: account.email, name: `${account.firstName} ${account.lastName}`.trim(), state: 'GA', county, propertyAddress: `${property.street}, ${property.city}, GA ${property.zip}`, blockedReason: 'ga_county_not_open' }),
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
          address: `${property.street}, ${property.city}, GA ${property.zip}`, county,
          parcelId: parcelId || quote.subject?.parcelId || '',
          assessedValue: quote.presale ? quote.priorValue : quote.noticeValue, targetReduction: quote.requestedValue || null, // the value asked for, as target_reduction means everywhere else
          savings: quote.savings?.yearlySaving || null,
          ownerStreet: ownerMail.street, ownerCity: ownerMail.city, ownerState: ownerMail.state, ownerZip: ownerMail.zip,
          stateCode: 'GA', kitKey: quote.kitKey, refCode, perkCode: normalizePerkCode(perkInput) || '', freeCode,
        }),
      });
      const j = await r.json();
      if (j.url) { window.location.href = j.url; return; }
      throw new Error(j.error || 'Checkout failed.');
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '8px 16px 40px', color: K.ink }}>
      <h2 style={{ marginBottom: 4 }}>Let's check whether an appeal will lower your tax bill</h2>
      <p style={{ color: K.muted, marginTop: 0 }}>
        We check your value against recent sales and your bill against {county ? `${county} County's` : "your county's"} caps and exemptions <b>before</b> you pay.
        If an appeal won't lower your bill, we'll tell you and we won't sell you one.
      </p>

      <div style={box}>
        <label style={{ ...label, marginTop: 0 }}>Has your {taxYear} Notice of Assessment arrived?</label>
        <YesNo value={arrived} onChange={(v) => { setArrived(v); setQuote(null); setAgreed(false); }} yes="Yes, I have it" no="Not yet" />
        <div style={help}>Georgia counties mail notices between April and June.</div>
      </div>

      {presale && (
      <div style={box}>
        <p style={{ marginTop: 0 }}>
          Reserve now and we&rsquo;ll check your case twice: today on last year&rsquo;s value, and again the day your notice arrives.
          If an appeal still lowers your bill then, we mail you the kit. If it doesn&rsquo;t, we refund you in full before anything is mailed.
        </p>
        {askPrior && (<>
          <label style={label} htmlFor="ga-pv">Last year&rsquo;s ({taxYear - 1}) fair market value</label>
          <input id="ga-pv" style={input} inputMode="numeric" placeholder="e.g. 430,000" value={priorValue} onChange={(e) => { setPriorValue(e.target.value); setPriorValueConfirmed(false); }} />
          <div style={help}>From last year&rsquo;s notice or your tax bill, or {county ? `${county} County's` : "your county's"} property search{quote?.countySearchUrl ? <> (<a href={quote.countySearchUrl} target="_blank" rel="noopener noreferrer">look it up here</a>)</> : ''}. Use the <b>100% fair market value</b>, not the 40% assessed value.</div>
        </>)}

        <label style={label} htmlFor="ga-pid0">Parcel ID (optional)</label>
        <input id="ga-pid0" style={input} placeholder="As printed on your tax bill" value={parcelId} onChange={(e) => setParcelId(e.target.value)} />

        <label style={label}>Do you have a homestead exemption on this home?</label>
        <YesNo value={homestead} onChange={setHomestead} />

        <button style={ready && !busy ? btn : btnOff} disabled={!ready || busy} onClick={() => runCheck()}>
          {busy && !quote ? 'Checking your home…' : 'Check my home'}
        </button>
      </div>
      )}

      {arrived === true && (
      <div style={box}>
        <label style={label} htmlFor="ga-nv">Value on your {taxYear} assessment notice</label>
        <input id="ga-nv" style={input} inputMode="numeric" placeholder="e.g. 452,000" value={noticeValue} onChange={(e) => setNoticeValue(e.target.value)} />
        <div style={help}>Use the <b>current year fair market value</b> (the 100% value), not the 40% assessed value.</div>

        <label style={label} htmlFor="ga-nd">Date printed on the notice</label>
        <input id="ga-nd" style={input} type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
        <div style={help}>Your appeal must be postmarked within 45 days of this date.</div>

        <label style={label} htmlFor="ga-pid">Parcel ID (optional)</label>
        <input id="ga-pid" style={input} placeholder="As printed on the notice" value={parcelId} onChange={(e) => setParcelId(e.target.value)} />

        <label style={label}>Do you have a homestead exemption on this home?</label>
        <YesNo value={homestead} onChange={setHomestead} />

        {isChatham && (<>
          <label style={label}>Did you own this home on January 1, {taxYear}?</label>
          <YesNo value={ownedOnJan1} onChange={setOwnedOnJan1} no="No, I bought it after January 1" />
          <div style={help}>Chatham County's appeal form asks this.</div>
        </>)}
        {isFulton && (<>
          <label style={label}>While your appeal is open, how should Fulton bill you?</label>
          <YesNo value={fultonBilling100 === undefined ? undefined : !fultonBilling100} onChange={(v) => setFultonBilling100(!v)} yes="85% (the default)" no="100%" />
          <div style={help}>Georgia bills homes under appeal at 85% of the lower of this year's or last year's value unless you choose 100%. Fulton's form asks you to choose now; it can't be changed later.</div>
          <label style={label}>Would you accept a virtual hearing? (optional)</label>
          <YesNo value={virtualHearing} onChange={setVirtualHearing} />
          <div style={help}>If you don't answer, Fulton schedules an in-person hearing if one is needed.</div>
        </>)}

        <button style={ready && !busy ? btn : btnOff} disabled={!ready || busy} onClick={() => runCheck()}>
          {busy && !quote ? 'Checking your home…' : 'Check my appeal'}
        </button>
      </div>
      )}

      {err && <div style={{ ...box, borderColor: K.bad, color: K.bad }}>{err}</div>}

      {quote && quote.decision === 'no_case' && (
        <div style={{ ...box, background: K.bg }}>
          <h3 style={{ marginTop: 0 }}>We don't recommend an appeal this year</h3>
          <p>{NO_CASE_COPY[quote.reason] || "Based on what we found, an appeal isn't likely to lower your tax bill, so we won't sell you a kit."}</p>
          {quote.indicatedValue ? <p style={help}>Recent sales indicate about {money(quote.indicatedValue)}; {quote.presale ? `last year's value was ${money(quote.priorValue)}` : `your notice says ${money(quote.noticeValue)}`}.</p> : null}
          {quote.presale && <p style={help}>We don&rsquo;t take a reservation on that. If your {taxYear} notice comes in higher, check again then: it may show a case.</p>}
          <p style={help}>No charge. You're always free to appeal on your own.</p>
        </div>
      )}

      {quote && quote.decision === 'need_info' && quote.reason === 'prior_value_looks_assessed' && (
        <div style={{ ...box, borderColor: K.warn }}>
          <p style={{ marginTop: 0 }}>{money(quote.priorValue)} looks like the <b>40% assessed value</b>. Georgia notices and tax bills print both. Please check you entered the <b>100% fair market value</b>.</p>
          <button style={btn} onClick={() => { setPriorValueConfirmed(true); runCheck(true); }}>Yes, {money(quote.priorValue)} is the 100% value</button>
        </div>
      )}

      {quote && quote.decision === 'need_info' && quote.reason === 'need_prior_value' && (
        <div style={{ ...box, borderColor: K.warn }}>
          <p style={{ marginTop: 0 }}>We couldn&rsquo;t read last year&rsquo;s value for this home from {county ? `${county} County's` : "the county's"} online records, and we only take a reservation once we can check it.</p>
          <p style={{ marginBottom: 0 }}>It&rsquo;s printed on last year&rsquo;s assessment notice and on your tax bill, or you can find it on the {quote.countySearchUrl ? <a href={quote.countySearchUrl} target="_blank" rel="noopener noreferrer">county&rsquo;s property search</a> : "county's property search"}. Enter it above and check again. If you can&rsquo;t find it, come back when your {taxYear} notice arrives.</p>
        </div>
      )}

      {quote && quote.decision === 'need_info' && quote.reason !== 'prior_value_looks_assessed' && quote.reason !== 'need_prior_value' && (
        <div style={{ ...box, borderColor: K.warn }}>Please answer the question{quote.reason === 'need_homestead_answer' ? ' about your homestead exemption' : ' about your county\'s form'} above, then check again.</div>
      )}

      {quote && quote.decision === 'case' && (
        <div style={box}>
          <h3 style={{ marginTop: 0, color: K.good }}>{quote.presale ? 'Your home already looks over-valued' : 'An appeal is worth it'}</h3>
          {quote.presale && <p style={help}>On last year&rsquo;s value. Your {taxYear} notice decides it: we check again the day it arrives.</p>}
          <table style={{ width: '100%', fontSize: 15, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td>{quote.presale ? (quote.priorValueSource === 'county' ? `Value on ${county} County's records` : `Last year's value (${taxYear - 1})`) : 'Value on your notice'}</td><td style={{ textAlign: 'right' }}>{money(quote.presale ? quote.priorValue : quote.noticeValue)}</td></tr>
              <tr><td>What recent sales of similar homes indicate</td><td style={{ textAlign: 'right' }}>{money(quote.indicatedValue)}</td></tr>
              <tr><td><b>Your appeal asks for</b></td><td style={{ textAlign: 'right' }}><b>{money(quote.requestedValue)}</b></td></tr>
              <tr><td><b>Estimated yearly tax saving</b></td><td style={{ textAlign: 'right', color: K.good }}><b>about {money(quote.savings?.yearlySaving)}</b></td></tr>
            </tbody>
          </table>
          <div style={help}>An estimate for the county and school taxes only. A value lowered on appeal is generally held for the next two years too.{quote.savings?.provisional ? ' Some local caps are confirmed each spring; we re-check when your notice arrives.' : ''}</div>

          {Array.isArray(quote.comps) && quote.comps.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer' }}>See the {quote.comps.length} sales we'll use as evidence</summary>
              <table style={{ width: '100%', fontSize: 13, marginTop: 8, borderCollapse: 'collapse' }}>
                <thead><tr><th align="left">Address</th><th align="right">Sold</th><th align="right">Price</th><th align="right">Sq ft</th></tr></thead>
                <tbody>{quote.comps.map((c, i) => (
                  <tr key={i}><td>{c.address}</td><td align="right">{c.saleDate}</td><td align="right">{money(c.price)}</td><td align="right">{Number(c.sqft).toLocaleString('en-US')}</td></tr>
                ))}</tbody>
              </table>
            </details>
          )}

          {quote.sellable && quote.kitKey && quote.presale ? (<>
            <div style={{ ...box, background: K.bg }}>
              <b>Reserve your kit for ${SERVICE_PRICE_DOLLARS}.</b> When your notice arrives, enter its value from the link in your receipt and we check again.
              If an appeal still lowers your bill, we mail you your completed appeal on {county} County&rsquo;s own form, with the evidence page and a return envelope addressed to the county, and email you a PDF copy of the full kit.
              If it no longer does, we refund you in full before anything is mailed.
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I understand TaxAppeal USA prepares my appeal documents only. I sign and mail my own appeal; TaxAppeal USA does not file it, represent me or appear for me, and no outcome is guaranteed. If my notice no longer shows a case, I am refunded in full. If the county does not lower my value, next year's kit is free.</span>
            </label>
            <PartnerCodeField value={perkInput} onChange={setPerkInput} />
            <button style={agreed && !busy ? btn : btnOff} disabled={!agreed || busy} onClick={checkout}>
              {busy ? 'Opening secure checkout…' : `Reserve my appeal kit — $${SERVICE_PRICE_DOLLARS}`}
            </button>
          </>) : quote.sellable && quote.kitKey ? (<>
            <div style={{ ...box, background: K.bg }}>
              {quote.delivery === 'pdf' ? (<>
                <b>Your deadline is close, so this is the PDF kit (${SERVICE_PRICE_DOLLARS}):</b> your completed appeal on {county} County's own form with the evidence page, emailed to you as soon as you pay. There isn't time to mail you a printed kit, so you print it, sign it and mail it to the county yourself.
              </>) : (<>
                <b>What you get for ${SERVICE_PRICE_DOLLARS}:</b> your completed appeal on {county} County's own form, with the evidence page and a return envelope already addressed to the county, mailed to you — plus a PDF copy of the full kit, emailed to you today. You sign it, add postage and mail it.
              </>)}
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I understand TaxAppeal USA prepares my appeal documents only. I sign and mail my own appeal; TaxAppeal USA does not file it, represent me or appear for me, and no outcome is guaranteed. If the county does not lower my value, next year's kit is free.</span>
            </label>
            <FreeKitField kitKey={quote.kitKey} code={freeCode} onCode={setFreeCode} onFree={setFreeKit} />
            {!freeKit && <PartnerCodeField value={perkInput} onChange={setPerkInput} />}
            <button style={agreed && !busy ? btn : btnOff} disabled={!agreed || busy} onClick={checkout}>
              {busy ? 'Opening secure checkout…' : freeKit ? 'Get my free appeal kit' : quote.delivery === 'pdf' ? `Get my appeal kit (PDF) — $${SERVICE_PRICE_DOLLARS}` : `Get my appeal kit — $${SERVICE_PRICE_DOLLARS}`}
            </button>
          </>) : (
            <div style={{ ...box, borderColor: K.warn }}>
              <b>Your case looks good, but we aren't taking orders for {county} County yet.</b> We only sell a kit once we've confirmed the county's appeal address and form. We've saved your details and will email {account.email} when {county} County opens. No charge.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
