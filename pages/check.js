import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/**
 * THE FREE SAVINGS CHECK — public page.
 *
 * ============================================================================
 * THE REFUSAL IS THE PRODUCT
 * ============================================================================
 * Roughly 42% of Florida residential parcels cannot benefit from an appeal at
 * all: Save Our Homes (Fla. Stat. § 193.155) has capped their assessed value so
 * far below market that reducing the market value changes nothing. Measured
 * across the 13 largest counties, that is about two million households.
 *
 * Every competitor charges those households anyway, because knowing requires
 * per-parcel just AND assessed values and no commercial data provider sells
 * that — we tested one and it returned the capped assessed value, a year stale,
 * with no way to tell which figure you had. We hold the county roll, so we can
 * answer it for free and say no.
 *
 * This page therefore leads with the "no". A refusal that the homeowner can
 * verify against their own TRIM notice is the only claim in this market that
 * survives being checked, which is what makes it worth more than any assertion
 * we could make about ourselves.
 *
 * ============================================================================
 * FACTS AND ESTIMATES ARE VISUALLY SEPARATE, NOT JUST WORDED DIFFERENTLY
 * ============================================================================
 * Two categorically different kinds of statement appear here:
 *
 *   FACTS      just value, assessed value, the differential, the required
 *              reduction. Straight off the county's published roll. Stated
 *              flatly, with the parcel number so it can be checked.
 *
 *   ESTIMATES  projected dollar savings. These depend on a millage rate we do
 *              not yet hold per-district, so they carry ±30% and are labelled
 *              as approximate every single time they appear.
 *
 * They get different backgrounds, different labels and different language. This
 * is not decoration: presenting an estimate as a computed figure is how a
 * document-preparation service starts making claims that look like unlicensed
 * appraisal (Fla. Stat. § 475.611/612 — see the counsel memo, question 3).
 *
 * NOTHING ON THIS PAGE IS AN OPINION OF VALUE. We report what the county says
 * and do arithmetic on it. Whether comparable sales support a reduction is a
 * separate question this page does not answer.
 */

const C = {
  navy: '#1B3A6B', darkNavy: '#0F1F3D', gold: '#FFC940', bg: '#F4F7FC',
  white: '#FFFFFF', border: '#E8EDF4', body: '#5A6B82', muted: '#8596AF',
  green: '#2E7D52', amber: '#B8860B', amberBg: '#FFF8E6',
};

const fmt = (n) => (n || n === 0 ? `$${Number(n).toLocaleString()}` : '—');

export default function CheckPage() {
  const [form, setForm] = useState({ street: '', zip: '' });
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState('idle');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function runCheck(e) {
    e.preventDefault();
    if (!form.street.trim() || !form.zip.trim()) return;
    setState({ status: 'loading', data: null, error: null });
    try {
      const r = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ street: form.street.trim(), zip: form.zip.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Something went wrong.');
      setState({ status: 'done', data: d, error: null });
    } catch (err) {
      setState({ status: 'idle', data: null, error: err.message });
    }
  }

  // Email capture runs for BOTH outcomes. A homeowner who cannot appeal this
  // year is not a dead lead — a sale resets the cap, and a falling market pulls
  // just value down toward the capped assessed value. Florida condo values are
  // doing exactly that right now. Telling them the truth today is how we earn
  // the right to email them when it changes.
  async function joinList(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailState('loading');
    try {
      const r = await fetch('/api/join-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          state: 'FL',
          county: state.data?.parcel?.coNo ? String(state.data.parcel.coNo) : '',
          propertyAddress: state.data?.parcel?.address || `${form.street}, ${form.zip}`,
        }),
      });
      setEmailState(r.ok ? 'done' : 'error');
    } catch {
      setEmailState('error');
    }
  }

  const d = state.data;

  return (
    <>
      <Head>
        <title>Will a property tax appeal actually save you money? — Free check | TaxAppeal USA</title>
        <meta
          name="description"
          content="Most Florida homeowners cannot save money by appealing their property taxes, because Save Our Homes already caps their assessment. Check your property free, using the county's own records."
        />
      </Head>

      <main style={{ fontFamily: 'DM Sans, sans-serif', background: C.bg, minHeight: '100vh', color: C.darkNavy }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px' }}>

          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 40, lineHeight: 1.15, margin: '0 0 16px' }}>
            Will an appeal actually lower your tax bill?
          </h1>

          <p style={{ fontSize: 18, lineHeight: 1.6, color: C.body, margin: '0 0 8px' }}>
            For most Florida homeowners, the honest answer is no — and the companies charging
            them to file know it.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: C.body, margin: '0 0 32px' }}>
            Save Our Homes caps how fast your assessed value can rise. Once that cap opens a
            gap, winning a reduction in market value doesn&rsquo;t change what you pay. We check
            your property against your county&rsquo;s own tax roll and tell you either way.
            Free, no account, no card.
          </p>

          {/* ── Input ─────────────────────────────────────────────────────── */}
          <form onSubmit={runCheck} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                value={form.street}
                onChange={set('street')}
                placeholder="8023 Marbella Creek Ave"
                aria-label="Street address"
                style={{ flex: '3 1 260px', padding: '13px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: 'inherit' }}
              />
              <input
                value={form.zip}
                onChange={set('zip')}
                placeholder="ZIP"
                inputMode="numeric"
                aria-label="ZIP code"
                style={{ flex: '1 1 110px', padding: '13px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: 'inherit' }}
              />
            </div>
            <button
              type="submit"
              disabled={state.status === 'loading'}
              style={{
                marginTop: 14, width: '100%', padding: '15px 20px', fontSize: 17, fontWeight: 600,
                background: C.navy, color: C.white, border: 'none', borderRadius: 8,
                cursor: state.status === 'loading' ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {state.status === 'loading' ? 'Checking the county roll…' : 'Check my property — free'}
            </button>
            <p style={{ fontSize: 13, color: C.muted, margin: '12px 0 0' }}>
              Currently covering 13 Florida counties: Brevard, Broward, Duval, Hillsborough, Lee,
              Miami-Dade, Orange, Palm Beach, Pasco, Pinellas, Polk, Seminole and Volusia.
            </p>
          </form>

          {state.error && (
            <p style={{ color: C.amber, fontSize: 15 }}>{state.error}</p>
          )}

          {/* ── No record ─────────────────────────────────────────────────── */}
          {d && !d.found && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>We couldn&rsquo;t find that property</h2>
              <p style={{ color: C.body, lineHeight: 1.6, margin: 0 }}>{d.message}</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                Check the street number and spelling. New construction and recently split parcels
                sometimes aren&rsquo;t on the current roll yet, and we only cover the 13 counties
                listed above so far.
              </p>
            </div>
          )}

          {/* ── Result ───────────────────────────────────────────────────── */}
          {d && d.found && (
            <>
              {/* Verdict. The refusal gets the same prominence as the good news —
                  it is the more useful answer and the reason to trust the other one. */}
              <div style={{
                background: d.eligible ? '#F0F9F4' : C.amberBg,
                border: `1px solid ${d.eligible ? '#BFE3CE' : '#F0DFB0'}`,
                borderRadius: 12, padding: 24, marginBottom: 20,
              }}>
                <div style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: d.eligible ? C.green : C.amber, fontWeight: 700, marginBottom: 8 }}>
                  {d.eligible ? 'An appeal could lower your bill' : 'An appeal would not lower your bill'}
                </div>
                <p style={{ fontSize: 17, lineHeight: 1.6, margin: 0, color: C.darkNavy }}>
                  {d.message || d.facts.statement}
                </p>
                {d.disclosure && (
                  <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 14, color: C.body, borderTop: `1px solid ${d.eligible ? '#BFE3CE' : '#F0DFB0'}`, paddingTop: 14 }}>
                    {d.disclosure}
                  </p>
                )}
              </div>

              {/* FACTS. County figures, stated flatly, with the parcel number so
                  the homeowner can pull it up themselves. */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>What the county says</h2>
                <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
                  Straight from the {d.parcel.rollYear} Florida Department of Revenue assessment roll.
                  Check it against your TRIM notice — these should match exactly.
                </p>

                <Row label="Property" value={d.parcel.address} />
                <Row label="Parcel number" value={d.parcel.parcelId} mono />
                <Row label="Market (just) value" value={fmt(d.parcel.justValue)} strong />
                <Row label="Assessed value" value={fmt(d.parcel.assessedValue.nonSchool)} />
                <Row label="Taxable value" value={fmt(d.parcel.taxableValue.nonSchool)} />
                <Row label="Homestead exemption" value={d.parcel.homesteaded ? 'Yes' : 'No'} />
                <Row
                  label="Capped below market by"
                  value={d.facts.differential > 0 ? fmt(d.facts.differential) : 'Not capped'}
                  strong
                />
                <Row
                  label="Reduction needed before your bill changes"
                  value={d.facts.requiredReductionPct > 0 ? `${d.facts.requiredReductionPct}%` : 'Any reduction helps'}
                  strong
                  last
                />
              </div>

              {/* ESTIMATES. Visually separated, and every figure carries the
                  approximation. The millage rate is not yet held per-district,
                  so these are ±30% and must never read as computed for them. */}
              {d.estimates && (
                <div style={{ background: '#FAFBFD', border: `1px dashed ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>Rough savings estimate</h2>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
                    Approximate only. These use an average Florida tax rate, not your exact
                    district&rsquo;s, so treat them as a rough scale rather than a quote.
                  </p>
                  <Row label="If a 10% reduction is won" value={`about ${fmt(d.estimates.conservative)}/yr`} />
                  <Row label="If a 15% reduction is won" value={`about ${fmt(d.estimates.likely)}/yr`} />
                  <Row label="If a 25% reduction is won" value={`about ${fmt(d.estimates.optimistic)}/yr`} last />
                </div>
              )}

              {/* Next step. Different for each outcome, honest in both. */}
              {d.eligible ? (
                <div style={{ background: C.navy, borderRadius: 12, padding: 24, color: C.white }}>
                  <h2 style={{ fontSize: 20, margin: '0 0 8px', color: C.white }}>Your property looks worth appealing</h2>
                  <p style={{ lineHeight: 1.6, margin: '0 0 16px', color: '#C5D3E8' }}>
                    Flat $89 plus your county&rsquo;s filing fee. No percentage of your savings.
                    You sign the petition — we prepare it and mail it certified.
                  </p>
                  <Link
                    href="/apply"
                    onClick={() => stashProperty(state.data?.parcel)}
                    style={{ display: 'inline-block', background: C.gold, color: C.darkNavy, padding: '13px 24px', borderRadius: 8, fontWeight: 700, textDecoration: 'none' }}
                  >
                    Get started →
                  </Link>
                </div>
              ) : (
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                  <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>We&rsquo;ll tell you when that changes</h2>
                  <p style={{ color: C.body, lineHeight: 1.6, margin: '0 0 16px' }}>
                    This can change. Buying or selling resets the cap, and if market values fall
                    far enough, your just value drops toward your assessed value and an appeal
                    starts to be worth filing. We re-check every roll and will email you the year
                    yours crosses that line. Nothing else — no marketing.
                  </p>
                  {emailState === 'done' ? (
                    <p style={{ color: C.green, fontWeight: 600, margin: 0 }}>
                      Done. We&rsquo;ll be in touch only if it becomes worth filing.
                    </p>
                  ) : (
                    <form onSubmit={joinList} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        aria-label="Email address"
                        style={{ flex: '2 1 240px', padding: '13px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: 'inherit' }}
                      />
                      <button
                        type="submit"
                        disabled={emailState === 'loading'}
                        style={{ flex: '1 1 150px', padding: '13px 20px', fontSize: 16, fontWeight: 600, background: C.navy, color: C.white, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {emailState === 'loading' ? 'Saving…' : 'Watch my assessment'}
                      </button>
                    </form>
                  )}
                  {emailState === 'error' && (
                    <p style={{ color: C.amber, fontSize: 14, marginTop: 10 }}>That didn&rsquo;t save — please try again.</p>
                  )}
                </div>
              )}

              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginTop: 24 }}>
                We report the county&rsquo;s own figures and the arithmetic that follows from them.
                We are a document preparation service, not appraisers, attorneys or tax advisers,
                and nothing here is an opinion of what your property is worth.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Row({ label, value, strong = false, mono = false, last = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 0',
      borderBottom: last ? 'none' : `1px solid ${C.border}`, alignItems: 'baseline',
    }}>
      <span style={{ color: C.body, fontSize: 15 }}>{label}</span>
      <span style={{
        fontWeight: strong ? 700 : 500, fontSize: strong ? 17 : 15,
        color: C.darkNavy, textAlign: 'right',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
      }}>
        {value}
      </span>
    </div>
  );
}
