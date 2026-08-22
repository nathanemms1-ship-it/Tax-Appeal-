import { useState, useEffect } from 'react';
import { LOADED_COUNTIES } from '../lib/dor/coverage';
import Head from 'next/head';
import Link from 'next/link';
import AddressAutocomplete from '../components/AddressAutocomplete';
import ContactModal from '../components/ContactModal';
import { getFilingWindowStatus } from '../lib/filingWindows';

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
  // Matches C.lightBlue in pages/apply.js. The condition invitation appears on
  // both pages and must not change colour halfway through the funnel.
  lightBlue: '#EEF3FB', lightBlueBorder: '#C5D3E8',
};

const fmt = (n) => (n || n === 0 ? `$${Number(n).toLocaleString()}` : '—');

/**
 * CONCRETE, BECAUSE "CONDITION" IS AN ABSTRACTION AND A DEAD ROOF IS NOT.
 *
 * A homeowner does not scan this list and think about valuation methodology;
 * they recognise their own house in one of these lines. Recognition is what
 * makes them click.
 *
 * Shown on BOTH sides of the verdict. Wording deliberately mirrors the labels in
 * StepIssues on pages/apply.js, so what they are promised here is what they are
 * asked for on the next screen.
 */
const DEFECTS = [
  'Roof at the end of its life',
  'Failed air conditioning',
  'Original kitchen or baths',
  'Active damage or leaks',
  'Foundation or plumbing trouble',
];

function DefectChips() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 16px' }}>
      {DEFECTS.map((t) => (
        <span key={t} style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 999, padding: '7px 13px', fontSize: 13.5, color: C.white }}>
          {t}
        </span>
      ))}
    </div>
  );
}

/**
 * The middle third of a property handoff that shipped with its middle missing.
 *
 * The other two thirds were already built and built carefully. /api/check returns
 * `parcel.situs` — street/city/state/zip already split apart, with a comment in
 * lib/dor/parcels.js:355 saying it exists precisely so the next page does not make
 * the customer type the address twice. pages/apply.js:2764 reads sessionStorage
 * 'ta_property', prefills every field, and removes the key immediately so someone
 * appealing a second house cannot inherit the first one's address onto a sworn
 * petition. Only the function that writes the key was never defined.
 *
 * So `onClick={() => stashProperty(...)}` threw ReferenceError on the single
 * highest-intent click on the site — the "Get started" button shown to a customer
 * we have just told their property is worth appealing. Two consequences: nothing
 * was ever stored, so the apply form opened blank and asked for the address they
 * had typed a screen earlier; and because the throw happened inside the handler,
 * next/link's client-side navigation was cancelled and the browser fell back to a
 * full document load.
 *
 * Never throws. sessionStorage.setItem raises in private-mode Safari and when the
 * quota is full, and a prefill is not worth blocking a purchase over — failing
 * quietly here costs exactly what the bug already cost, which is retyping.
 */
function stashProperty(parcel) {
  try {
    const s = parcel?.situs;
    // apply.js bails unless `street` is present, so writing a partial record here
    // would only put a value in storage that the reader discards.
    if (!s?.street) return;
    sessionStorage.setItem('ta_property', JSON.stringify({
      street: s.street,
      city: s.city || '',
      state: s.state || 'FL',
      zip: s.zip || '',
    }));
  } catch {
    // Storage unavailable. The customer types the address again, as before.
  }
}

/**
 * WHY THIS PERSON IS WALKING INTO /apply, not just which house they own.
 *
 * A `needs_condition_case` visitor has already been asked the condition question
 * here and has already said yes by clicking. Without this flag /apply re-runs
 * /api/check at the `florida-check` step, gets the same rescuable answer, and
 * asks them the identical question a second time — the funnel telling somebody
 * who just volunteered to describe their broken roof that an appeal would not be
 * worth filing, before letting them describe it. Answered once, acted on once.
 *
 * Read and cleared by ApplyFunnel in the same effect that consumes 'ta_property',
 * so a later visit cannot inherit an intent belonging to a different property.
 *
 * Never throws, for the same reason stashProperty does not: a lost prefill costs
 * a repeated question, and a raised exception inside a next/link onClick cancels
 * the navigation entirely. That is the exact defect this file already carries a
 * comment about.
 */
function stashConditionIntent() {
  try {
    sessionStorage.setItem('ta_intent', 'condition');
  } catch {
    // Storage unavailable. /apply asks the condition question again — which is
    // the behaviour before this flag existed, not a broken funnel.
  }
}

export default function CheckPage() {
  const [form, setForm] = useState({ street: '', zip: '' });

  /**
   * ZIP carried from the landing page, so a Florida visitor types it once.
   * Read once and cleared — a stale ZIP on a later visit would quietly point the
   * lookup at the wrong county.
   */
  useEffect(() => {
    try {
      const z = sessionStorage.getItem('ta_zip');
      if (!z) return;
      sessionStorage.removeItem('ta_zip');
      setForm((f) => (f.zip ? f : { ...f, zip: z }));
    } catch { /* private mode — the field just starts empty */ }
  }, []);
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState('idle');
  const [contactOpen, setContactOpen] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function runCheck(e) {
    e.preventDefault();
    /*
     * ZIP WAS REQUIRED HERE AND NOTHING SAID SO.
     *
     * The field is labelled "ZIP" with no required marker, and this line returned
     * silently when it was empty — so the button appeared dead. Worse, supplying it
     * was actively harmful until today: lib/dor/parcels.js filtered the roll on an
     * exact ZIP match, and a homeowner whose USPS ZIP differs from the county's
     * recorded one was told we had no record of their property.
     *
     * ZIP is now a hint that narrows and never excludes, so the honest requirement
     * is the street alone.
     */
    if (!form.street.trim()) return;
    setState({ status: 'loading', data: null, error: null });
    try {
      const r = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `source` tells check_events which page ran this. /apply runs the SAME
        // endpoint again at the property step, for somebody already inside the
        // funnel — blending the two would dilute the top-of-funnel refusal rate
        // with re-checks from people who had already cleared the gate.
        body: JSON.stringify({ street: form.street.trim(), zip: form.zip.trim(), source: 'check' }),
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
  /**
   * `reason` defaults to the Save Our Homes case because that is what this form
   * originally served. It is now passed explicitly as null by the eligible-but-closed
   * branch, whose row must be an ORDINARY waitlist entry — see the comment there.
   * A wrong reason here does not error; it sends a specific person a specific email
   * contradicting what the page just told them.
   */
  async function joinList(e, reason = 'fl_not_eligible') {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailState('loading');
    try {
      const r = await fetch('/api/join-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
         * Two fields here were wrong in ways that only show up 24 August.
         *
         * `county` sent the DOR county NUMBER as a string — "29", not
         * "Hillsborough". Everything downstream expects a name:
         * getFilingWindowStatus() looks the value up in FL_COUNTY_DATES, misses,
         * and falls back to the statewide 5 September rather than that county's
         * real deadline. LOADED_COUNTIES is the number -> name table the roll
         * loader already maintains.
         *
         * `blockedReason` was absent, so these rows stored blocked_reason = null
         * and were indistinguishable from someone who asked to be told when
         * Florida opens. They are the opposite: /check has just told them, truly,
         * that an appeal would NOT lower their bill, because their Save Our Homes
         * capped assessment already sits below market value. The reminder cron
         * only knows how to say "your window is open, file today, $89" — which
         * would point them at a purchase that saves them nothing, which is the
         * exact outcome this page exists to prevent. Tagged so the cron skips
         * them until something computes the trigger they were actually promised:
         * their just value falling toward the capped one.
         */
        body: JSON.stringify({
          email: email.trim(),
          state: 'FL',
          county: LOADED_COUNTIES[Number(state.data?.parcel?.coNo)] || '',
          propertyAddress: state.data?.parcel?.address || `${form.street}, ${form.zip}`,
          blockedReason: reason,
        }),
      });
      setEmailState(r.ok ? 'done' : 'error');
    } catch {
      setEmailState('error');
    }
  }

  const d = state.data;

  /**
   * THE COUNTY'S WINDOW, RESOLVED ONCE AND USED BY EVERYTHING BELOW.
   *
   * This was computed inside the deadline callout, which meant the callout could say
   * "Okaloosa County has closed for 2026" while the gold "Get started" button
   * underneath it stayed exactly where it was. Checkout would then refuse the order
   * at pages/api/checkout.js — after the customer had committed. Telling somebody it
   * is closed and then inviting them to buy is worse than either message alone.
   *
   * `canOrder` is deliberately false ONLY when we positively know the window is shut.
   * An unresolved county leaves it true and lets the real gate in checkout decide —
   * blocking a valid customer on missing data would be the more expensive mistake,
   * and with no county we render no deadline claim to contradict.
   */
  const checkedCounty = d && d.found ? (LOADED_COUNTIES[Number(d.parcel?.coNo)] || '') : '';
  let win = null;
  if (checkedCounty) {
    try { win = getFilingWindowStatus('FL', checkedCounty); } catch { win = null; }
  }
  const canOrder = !win || win.canFile || win.canPreOrder;
  const fmtDay = (dt) => dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

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

        {/*
          HEADER. This page is becoming the paid-traffic front door, and it was
          arriving with no branding at all — a bare headline on a grey field, with
          nothing telling a stranger whose site they had landed on. Matches the bar
          on /apply so the funnel does not appear to change hands halfway through.
        */}
        <div style={{ background: C.navy, color: C.white, textAlign: 'center', padding: '10px 20px', fontSize: 13 }}>
          Check your property free — <strong style={{ color: C.gold }}>no account, no card, no phone call.</strong>
        </div>

        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, background: C.navy, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏠</div>
            <div>
              <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 19, color: C.darkNavy, lineHeight: 1 }}>TaxAppeal</div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: C.muted }}>Property Tax Dispute</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            style={{ fontSize: 15, fontWeight: 500, color: C.white, background: C.navy, fontFamily: 'inherit', padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${C.navy}`, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Need help? Contact us
          </button>
        </div>

        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>

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
              {/*
                Suggestions come from OUR roll, not Google — see the header of
                components/AddressAutocomplete.js. Picking one writes the roll's own
                spelling and ZIP back into the form, which is the single query
                guaranteed to resolve.
              */}
              <AddressAutocomplete
                value={form.street}
                onChange={(v) => setForm((f) => ({ ...f, street: v }))}
                onSelect={(s) => setForm({ street: s.street || '', zip: s.zip || '' })}
                zip={form.zip}
                colors={C}
                style={{ flex: '3 1 260px' }}
              />
              <input
                value={form.zip}
                onChange={set('zip')}
                placeholder="ZIP (optional)"
                inputMode="numeric"
                aria-label="ZIP code, optional"
                style={{ flex: '1 1 130px', padding: '13px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: 'inherit' }}
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
              Covering all 67 Florida counties — we hold the current Department of Revenue
              roll for every one of them.
            </p>
          </form>

          {/*
            TRUST ROW. Three objections a stranger has before typing an address into a
            box on a site they reached from an ad: what is this going to cost me, are
            you about to ask for my details, and where do your numbers come from.
            Answered before the fold rather than in a FAQ nobody scrolls to.
          */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 40 }}>
            {[
              ['Free', 'No account, no card'],
              ['County records', "Your county's own tax roll"],
              ['Straight answer', 'We say no when it is no'],
            ].map(([head, sub]) => (
              <div key={head} style={{ flex: '1 1 190px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 15px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.darkNavy }}>{head}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {state.error && (
            <p style={{ color: C.amber, fontSize: 15 }}>{state.error}</p>
          )}

          {/* ── No record ─────────────────────────────────────────────────── */}
          {/* OUTSIDE FLORIDA — a closed filing window, not a missing property.
              These two were one branch, so a Texas homeowner was told
              "We couldn't find that property" above a message explaining their
              filing window. Two different facts, and the wrong one on top. */}
          {d && !d.found && d.reason === 'outside_coverage' && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Your filing window is closed right now</h2>
              <p style={{ color: C.body, lineHeight: 1.6, margin: '0 0 16px' }}>{d.message}</p>
              {emailState === 'done' ? (
                <p style={{ color: C.green, fontWeight: 600, margin: 0 }}>
                  Done. We&rsquo;ll email you when your window opens.
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
                    {emailState === 'loading' ? 'Saving…' : 'Email me when it opens'}
                  </button>
                </form>
              )}
              {emailState === 'error' && (
                <p style={{ color: C.amber, fontSize: 14, marginTop: 10 }}>That didn&rsquo;t save — please try again.</p>
              )}
            </div>
          )}

          {/* A genuine miss inside Florida. */}
          {d && !d.found && d.reason !== 'outside_coverage' && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>We couldn&rsquo;t find that property</h2>
              <p style={{ color: C.body, lineHeight: 1.6, margin: 0 }}>{d.message}</p>

              {/*
                THE SERVER ALREADY KNEW. /api/check returns `candidates` on a miss and
                this page threw them away, so a near-match was rendered as a dead end.
                Offering them costs nothing — they are parcels we hold, so clicking one
                cannot lead anywhere we lack data.
              */}
              {Array.isArray(d.candidates) && d.candidates.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Did you mean one of these?</p>
                  {d.candidates.slice(0, 5).map((c, i) => (
                    <button
                      key={c.parcelId || i}
                      type="button"
                      onClick={() => {
                        setForm({ street: c.street || c.full || '', zip: c.zip || '' });
                        setState({ status: 'idle', data: null, error: null });
                        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', marginBottom: 8,
                        padding: '11px 14px', fontSize: 15, fontFamily: 'inherit', cursor: 'pointer',
                        background: C.white, color: C.darkNavy,
                        border: `1px solid ${C.border}`, borderRadius: 8,
                      }}
                    >
                      {c.full || [c.street, c.city, 'FL', c.zip].filter(Boolean).join(', ')}
                    </button>
                  ))}
                </div>
              )}

              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                {/*
                  This paragraph used to assert new construction or a recent split as the
                  likely cause. It was confident and, in the case that sent me here, false:
                  the parcel was on the roll, and an exact-match ZIP filter was hiding it.
                  ZIP is a hint now, not a gate — so a genuine miss is genuinely rarer, and
                  the copy no longer diagnoses a cause it cannot know.
                */}
                Check the street number and spelling — the ZIP is optional, and leaving it out
                searches wider. We hold the current roll for all 67 Florida counties, so a real
                miss is usually a very new build or a parcel split that this year&rsquo;s roll
                has not caught up with.
              </p>
            </div>
          )}

          {/* ── Result ───────────────────────────────────────────────────── */}
          {d && d.found && (
            <>
              {/* Verdict. The refusal gets the same prominence as the good news —
                  it is the more useful answer and the reason to trust the other one.

                  THREE OUTCOMES, NOT TWO. `rescuable` is the band where comparable
                  sales alone fall short but a documented cost to cure may carry the
                  parcel — 688,497 Florida homes on the 2026 roll. /api/check has
                  returned `rescuable: true` and a `conditionPrompt` for it since
                  7 Aug and this page read neither, so every one of them was shown
                  the flat amber refusal below. That headline is not merely
                  discouraging, it is WRONG: qualify.js has not refused these people,
                  it has asked them a question. */}
              <div style={{
                background: d.eligible ? '#F0F9F4' : d.rescuable ? C.lightBlue : C.amberBg,
                border: `1px solid ${d.eligible ? '#BFE3CE' : d.rescuable ? C.lightBlueBorder : '#F0DFB0'}`,
                borderRadius: 12, padding: 24, marginBottom: 20,
              }}>
                <div style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: d.eligible ? C.green : d.rescuable ? C.navy : C.amber, fontWeight: 700, marginBottom: 8 }}>
                  {d.eligible
                    ? 'An appeal could lower your bill'
                    : d.rescuable
                      ? 'One more question before we answer'
                      : 'An appeal would not lower your bill'}
                </div>
                {/* Wording matched to StepFloridaCheck in pages/apply.js so the two
                    screens cannot drift into telling the same person two different
                    things about the same parcel. */}
                {d.rescuable && (
                  <p style={{ fontSize: 19, lineHeight: 1.45, margin: '0 0 10px', color: C.darkNavy, fontWeight: 700, fontFamily: '"DM Serif Display", serif' }}>
                    On comparable sales alone, an appeal wouldn&rsquo;t be worth filing — but
                    your home&rsquo;s condition can change that.
                  </p>
                )}
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

                  {/*
                    THE DEADLINE, AT THE MOMENT IT DECIDES SOMETHING.
                    Someone has just been told their property is worth appealing. Until
                    now the page did not mention that their county might close within
                    the week — the strongest reason to act, absent from the one screen
                    where acting is the ask.

                    SHOWN AS THE LAST ORDER DAY, NEVER THE COUNTY'S DEADLINE. Florida is
                    satisfied by receipt, so the petition and the cheque need minDays of
                    travel first; quoting the county's own date would promise up to
                    twelve days that do not exist. getFilingWindowStatus computes it —
                    see lastOrderDate there.
                  */}
                  {win && (
                    <p style={{ background: 'rgba(255,201,64,0.14)', border: `1px solid ${C.gold}`, borderRadius: 8, padding: '11px 14px', margin: '0 0 16px', fontSize: 15, lineHeight: 1.55, color: C.white }}>
                      {win.canFile ? (
                        <>
                          <strong style={{ color: C.gold }}>{checkedCounty} County closes {fmtDay(win.lastOrderDate)}.</strong>{' '}
                          {win.daysUntilLastOrder <= 1
                            ? 'That is today — the last day we can accept an order for this county.'
                            : `That is ${win.daysUntilLastOrder} days from now. After that we cannot get your petition there in time, and Florida counts receipt, not postmark.`}
                        </>
                      ) : win.canPreOrder ? (
                        <>
                          <strong style={{ color: C.gold }}>{checkedCounty} County opens {fmtDay(win.openDate)} and closes {fmtDay(win.lastOrderDate)}.</strong>{' '}
                          Order now and we prepare everything today, then file the morning the window opens.
                        </>
                      ) : (
                        <>
                          <strong style={{ color: C.gold }}>{checkedCounty} County has closed for 2026.</strong>{' '}
                          Nothing can be filed there until it reopens {fmtDay(win.openDate)}.
                        </>
                      )}
                    </p>
                  )}

                  {canOrder ? (
                    <>
                      <p style={{ lineHeight: 1.6, margin: '0 0 16px', color: '#C5D3E8' }}>
                        Flat $89 plus your county&rsquo;s filing fee. No percentage of your savings.
                        You sign the petition — we prepare it, pay your county filing fee, and mail it with tracking.
                        {/* Fla. Stat. s. 194.014(2). It is on the Brevard guide and was missing
                            from the one screen where somebody is deciding whether to pay. */}
                        {' '}If the Board reduces your value, Florida law requires the county to refund that filing fee.
                      </p>

                      {/*
                        ELIGIBLE, BUT THE CUT IS AMBITIOUS — DO NOT LEAVE THEM WITH
                        THE NUMBER AND NO WAY TO REACH IT.
                        ====================================================================
                        `disclosure` is present exactly when qualify.js rated the
                        confidence 'marginal' or 'long_shot' — the required cut is above a
                        plausible 15% result. Read on its own it is a discouraging
                        sentence: "That is an ambitious reduction… if it falls short your
                        bill will not change and the filing fee is not refundable." True,
                        and it stays exactly where it is, in the verdict panel at the top of
                        the result. The problem was that nothing between it and the buy
                        button offered any way to reach the number — a hard target stated
                        once and never answered.

                        The means already exists and they walk into it two screens later:
                        StepIssues prices a documented cost to cure through
                        lib/costToCure.js, and that evidence goes into the petition on top
                        of whatever comparable sales support — additive, per the note on
                        qualify.js's `cureDollars`. Saying so here costs nothing and turns
                        a number that reads as a wall into a number with a route through it.

                        SCOPED TO `disclosure`, deliberately. A parcel rated 'good' needs a
                        reduction comps alone reach comfortably; showing this there would be
                        manufacturing a worry to sell the answer to it.

                        NOT A ROUTING CHANGE. Eligible visitors already reach the issues
                        step by the ordinary path — account, property, the check, then
                        issues — so no intent flag is stashed here. This is the promise;
                        StepIssues is where it is kept.
                      */}
                      {d.disclosure && (
                        <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 10, padding: '18px 20px', margin: '0 0 18px' }}>
                          <p style={{ fontSize: 16.5, fontWeight: 700, color: C.white, margin: '0 0 10px', lineHeight: 1.45 }}>
                            {d.facts?.requiredReductionPct > 0
                              ? <>A {d.facts.requiredReductionPct}% reduction is ambitious on comparable sales alone — so don&rsquo;t rely on them alone.</>
                              : <>Comparable sales are only half the case you can make.</>}
                          </p>
                          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: '#C5D3E8', margin: '0 0 14px' }}>
                            That figure assumes your home is in average condition for its
                            neighbourhood. If it is not, every documented defect argues the value
                            down <strong style={{ color: C.white }}>on top of</strong> what comparable
                            sales show — and counts toward the reduction you need.
                          </p>

                          <DefectChips />

                          <p style={{ fontSize: 14, lineHeight: 1.65, color: '#C5D3E8', margin: 0 }}>
                            You pick these on the next step and we price each one from published
                            repair-cost data, or you enter your own quote if you have it. It goes
                            into the petition as evidence.
                            {' '}<strong style={{ color: C.white }}>It takes about a minute, and it is the part most people skip.</strong>
                          </p>
                        </div>
                      )}

                      <Link
                        href="/apply"
                        onClick={() => stashProperty(state.data?.parcel)}
                        style={{ display: 'inline-block', background: C.gold, color: C.darkNavy, padding: '13px 24px', borderRadius: 8, fontWeight: 700, textDecoration: 'none' }}
                      >
                        Get started →
                      </Link>
                    </>
                  ) : (
                    /*
                      ELIGIBLE, BUT THE WINDOW IS SHUT.
                      The best lead on the site and the one we can do least with today:
                      the arithmetic says an appeal would work, and there is no lawful way
                      to file it this year. No buy button — checkout would refuse it, and
                      being invited to pay after being told it is closed is how a customer
                      decides you are careless.

                      Captured as an ORDINARY waitlist row, blocked_reason null, on purpose.
                      The reminder cron's default message — "your filing window just opened,
                      file today" — is exactly what this person is owed, and it is the only
                      branch that already sends it. A new blocked_reason would need a branch
                      in notify-waitlist.js, an entry in lib/waitlistReasons.js and a third
                      widening of the CHECK constraint, to say something the default already
                      says correctly.
                    */
                    <>
                      <p style={{ lineHeight: 1.6, margin: '0 0 16px', color: '#C5D3E8' }}>
                        Your assessment is worth challenging — we just cannot file it until the
                        window reopens. Leave your email and we will tell you the day it does,
                        with time to spare before the deadline. Nothing else.
                      </p>
                      {emailState === 'done' ? (
                        <p style={{ color: C.gold, fontWeight: 700, margin: 0 }}>
                          Done. We&rsquo;ll email you the day {checkedCounty} County reopens.
                        </p>
                      ) : (
                        <form onSubmit={(e) => joinList(e, null)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            aria-label="Email address"
                            style={{ flex: '2 1 240px', padding: '13px 14px', fontSize: 16, border: 'none', borderRadius: 8, fontFamily: 'inherit' }}
                          />
                          <button
                            type="submit"
                            disabled={emailState === 'loading'}
                            style={{ flex: '1 1 170px', padding: '13px 20px', fontSize: 16, fontWeight: 700, background: C.gold, color: C.darkNavy, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {emailState === 'loading' ? 'Saving…' : 'Tell me when it opens'}
                          </button>
                        </form>
                      )}
                      {emailState === 'error' && (
                        <p style={{ color: C.gold, fontSize: 14, marginTop: 10 }}>That didn&rsquo;t save — please try again.</p>
                      )}
                    </>
                  )}
                </div>
              ) : d.rescuable ? (
                /*
                  RESCUABLE — A QUESTION, AND THE ONLY SCREEN THAT CAN ANSWER IT.
                  ==============================================================
                  Comparable sales alone fall short, but the required cut is within
                  MAX_CURE_REACH_PCT of what a documented cost to cure can reach, so
                  qualify.js returned `rescuable: true` INSTEAD of a refusal. Its own
                  comment on that branch reads: "the UI must route this to the
                  condition step, not to a dead end."

                  /apply has honoured that since 7 Aug. /check never did — it fell
                  through to the Save Our Homes watch card below, which tells these
                  people to wait for the market to move. They do not need the market
                  to move. They need to tick four boxes.

                  Deliberately styled like the eligible branch — navy, gold button —
                  not like a consolation. This is a live path to a sale, and the
                  visitor should be able to tell that from across the room.

                  NO EMAIL BOX HERE, ON PURPOSE. The old one tagged these leads
                  `fl_not_eligible`, which is the bucket notify-waitlist is built to
                  SKIP, so the capture promised an email nothing would ever send. The
                  button below captures better anyway: step one of /apply is the
                  account step, so clicking through asks for their email before
                  anything else. A proper `fl_condition_case` reason is a separate
                  change — it needs the CHECK constraint widened BEFORE the code
                  ships, or it repeats the defect of 20 Aug for a fourth time.
                */
                <div style={{ background: C.navy, borderRadius: 12, padding: 24, color: C.white }}>
                  <h2 style={{ fontSize: 21, margin: '0 0 10px', color: C.white }}>
                    Tell us what&rsquo;s wrong with it — that could put you over the line
                  </h2>

                  {/* From qualify.js so the wording cannot drift apart from the
                      arithmetic that produced it. The fallback is only reachable if
                      an older /api/check is deployed against this page. */}
                  <p style={{ lineHeight: 1.7, margin: '0 0 16px', fontSize: 15.5, color: C.white }}>
                    {d.conditionPrompt || 'This answer assumes your home is in average condition for its neighbourhood. If it is not — a roof at the end of its life, a failed air conditioner, an original kitchen, active damage — those reduce what your property is worth on top of what comparable sales show, and they can change this answer.'}
                  </p>

                  <DefectChips />

                  <p style={{ lineHeight: 1.65, margin: '0 0 18px', fontSize: 14.5, color: '#C5D3E8' }}>
                    Each one you document lowers what your property is worth on top of what
                    comparable sales show. Enough of them and the numbers work —
                    {' '}<strong style={{ color: C.white }}>we re-run the arithmetic with your repair costs before you are asked to pay anything.</strong>
                  </p>

                  {/* THE DEADLINE, ONLY WHERE IT IS TRUE AND ONLY WHERE IT DECIDES
                      SOMETHING. Same rule as the eligible branch: the LAST ORDER DAY,
                      never the county's own date, because Florida counts receipt and
                      the petition needs minDays of travel first. */}
                  {win && win.canFile && (
                    <p style={{ background: 'rgba(255,201,64,0.14)', border: `1px solid ${C.gold}`, borderRadius: 8, padding: '11px 14px', margin: '0 0 16px', fontSize: 14.5, lineHeight: 1.55, color: C.white }}>
                      <strong style={{ color: C.gold }}>{checkedCounty} County closes {fmtDay(win.lastOrderDate)}.</strong>{' '}
                      {win.daysUntilLastOrder <= 1
                        ? 'That is today — the last day we can accept an order for this county.'
                        : `That is ${win.daysUntilLastOrder} days from now, so it is worth answering this while you are here.`}
                    </p>
                  )}

                  {canOrder ? (
                    <>
                      <Link
                        href="/apply"
                        onClick={() => { stashProperty(state.data?.parcel); stashConditionIntent(); }}
                        style={{ display: 'inline-block', background: C.gold, color: C.darkNavy, padding: '14px 26px', borderRadius: 8, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}
                      >
                        Tell us what&rsquo;s wrong with the property →
                      </Link>
                      <p style={{ fontSize: 13.5, color: '#C5D3E8', lineHeight: 1.6, margin: '14px 0 0' }}>
                        Takes about a minute, and nothing is charged. If your condition case still
                        does not clear the bar, we will tell you plainly and you walk away — that is
                        the whole reason this check exists.
                      </p>
                    </>
                  ) : (
                    /*
                      The condition case may well work and there is no lawful way to
                      file it this year, so there is no honest button to show. Captured
                      as an ORDINARY waitlist row — blocked_reason null — for exactly
                      the reason the eligible-but-closed branch gives: the reminder
                      cron's default "your filing window just opened" is the message
                      this person is owed, and it is the only branch that already
                      sends it.
                    */
                    <>
                      <p style={{ lineHeight: 1.6, margin: '0 0 16px', color: '#C5D3E8', fontSize: 14.5 }}>
                        {checkedCounty ? `${checkedCounty} County has closed for 2026` : 'Your county has closed for 2026'} — so
                        there is nothing we can file yet. Leave your email and we will tell you the day
                        it reopens, and pick this up with you then.
                      </p>
                      {emailState === 'done' ? (
                        <p style={{ color: C.gold, fontWeight: 700, margin: 0 }}>
                          Done. We&rsquo;ll email you the day {checkedCounty || 'your county'} reopens.
                        </p>
                      ) : (
                        <form onSubmit={(e) => joinList(e, null)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            aria-label="Email address"
                            style={{ flex: '2 1 240px', padding: '13px 14px', fontSize: 16, border: 'none', borderRadius: 8, fontFamily: 'inherit' }}
                          />
                          <button
                            type="submit"
                            disabled={emailState === 'loading'}
                            style={{ flex: '1 1 170px', padding: '13px 20px', fontSize: 16, fontWeight: 700, background: C.gold, color: C.darkNavy, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {emailState === 'loading' ? 'Saving…' : 'Tell me when it opens'}
                          </button>
                        </form>
                      )}
                      {emailState === 'error' && (
                        <p style={{ color: C.gold, fontSize: 14, marginTop: 10 }}>That didn&rsquo;t save — please try again.</p>
                      )}
                    </>
                  )}
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

          {/*
            HOW IT WORKS — shown only BEFORE a check has run.
            Once there is a verdict on screen, the verdict is the page and a generic
            process block competes with it. This is here for the visitor still
            deciding whether to type an address at all.
          */}
          {!d && (
            <div style={{ marginTop: 8 }}>
              <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 26, margin: '0 0 6px' }}>
                If it turns out you can save
              </h2>
              <p style={{ fontSize: 15, color: C.body, lineHeight: 1.6, margin: '0 0 22px' }}>
                Nothing below happens until you decide to go ahead. The check itself asks
                for nothing but an address.
              </p>

              {[
                ['1', 'We read your county record',
                  'Your assessed value, your Save Our Homes cap, and comparable sales from the same roll your county assessed you from.'],
                ['2', 'We draft the petition',
                  'The DR-486, filled in with the evidence — you read it before anything is filed.'],
                ['3', 'You sign it, not us',
                  'Florida law requires the owner to sign. It is filed in your name, and we never appear before the Board as your representative.'],
                ['4', 'We pay the county and mail it tracked',
                  'Your county filing fee is paid on your behalf, and the petition goes by tracked mail at least seven days early — Florida counts receipt, not postmark.'],
              ].map(([n, head, body]) => (
                <div key={n} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
                  <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: C.navy, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{n}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.darkNavy, marginBottom: 3 }}>{head}</div>
                    <div style={{ fontSize: 14.5, color: C.body, lineHeight: 1.6 }}>{body}</div>
                  </div>
                </div>
              ))}

              <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', margin: '22px 0 0' }}>
                <strong style={{ color: C.darkNavy }}>Flat $89 plus your county&rsquo;s filing fee</strong>{' '}
                (set by the county, $15–$50). Never a percentage of your savings — and if the
                Board reduces your value, Florida law requires the county to refund the filing fee.
              </p>
            </div>
          )}
        </div>

        <ContactModal
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          context={{
            step: 'check',
            address: [form.street, form.zip].filter(Boolean).join(', '),
            county: LOADED_COUNTIES[Number(d?.parcel?.coNo)] || '',
            state: 'FL',
          }}
        />
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
