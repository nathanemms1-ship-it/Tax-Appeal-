import { useState, useEffect } from 'react';
import { LOADED_COUNTIES } from '../lib/dor/coverage';
import { getCountyPortal } from '../lib/countyPortals';
import Head from 'next/head';
import Link from 'next/link';
import AddressAutocomplete from '../components/AddressAutocomplete';
import ContactModal from '../components/ContactModal';
import { getFilingWindowStatus } from '../lib/filingWindows';
/**
 * THE VERDICT WE JUST RENDERED, carried into /apply so it is not asked again.
 *
 * 21-23 Aug: 17 visitors were told "an appeal could lower your bill", 12 landed
 * on /apply, and 3 ran a check there. The other 9 quit at a screen that asked
 * them to type the address they had typed a moment earlier, so that qualify()
 * could be run a second time against the same roll row and print the same answer.
 *
 * `stashProperty` below already carried the address. It could not carry the
 * ANSWER, so ApplyFunnel had no way to know a check had been run and routed every
 * eligible arrival to `florida-check` regardless. The rescuable branch got an
 * exemption via `ta_intent`; the eligible branch — the larger one, and the only
 * one with a sale at the end of it — never did.
 *
 * The record is a PREFILL and never a permission: /apply re-tests the filing
 * window, the VAB address and the fee confidence on arrival, and /api/checkout
 * tests all three again. See the header of lib/checkHandoff.js.
 */
import { stashVerdict } from '../lib/checkHandoff';

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
 * A refusal that the homeowner can verify against their own TRIM notice is the
 * only claim in this market that survives being checked, which is what makes it
 * worth more than any assertion we could make about ourselves.
 *
 * UNTIL 24 AUG THIS PAGE LED WITH THE "NO". It does not any more, and the reason
 * is placement rather than a change of heart — the refusal is still the product
 * and the verdict screens below are untouched. A headline that answered itself
 * "no" before the visitor had typed anything was measured turning ~98 real
 * arrivals into ~28 checks. The full argument, with the research it rests on, is
 * in the hero comment further down this file. Read that before restoring it.
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
  // ZIP is disclosed on demand rather than shown by default — see the comment at
  // the field itself. Reset to closed when a suggestion supplies the roll's own ZIP.
  const [zipOpen, setZipOpen] = useState(false);

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
  /*
    THE COUNTY'S OWN PROPERTY APPRAISER, for the "check us against your county"
    link on the refusal screen. Reuses checkedCounty above rather than adding a
    field to /api/check. Null for the 27 counties with no portal on file, and the
    link is then simply not rendered — see the warning in lib/countyPortals.js
    about guessing a URL on the one invitation that asks to be verified.
  */
  const checkedPortal = checkedCounty ? getCountyPortal('FL', checkedCounty) : null;
  /**
   * THE SECOND REASON WE CANNOT SELL, AND IT IS NOT THE CALENDAR.
   *
   * Eight Florida counties have no VAB mailing address we have confirmed directly
   * with the county, and three more (Nassau, Columbia, Levy) have a good address
   * and a fee that is still a $50 guess. send-letter.js refuses both, and it
   * refuses AFTER the card has been charged — which is why apply.js diverts to
   * FloridaCountyUnavailable before checkout.
   *
   * Until today this page knew nothing about either. It told an owner in one of
   * those eleven counties that their property was worth appealing, showed them the
   * gold button, and let them pick and price their defects across three more
   * screens before the funnel said no. The refusal was right and it was in the
   * wrong place.
   *
   * `countyFilable` comes from /api/check because the tables that answer it belong
   * on the server — see the note beside the field there.
   *
   * SHAPED LIKE canOrder, DELIBERATELY: false ONLY when we positively know we
   * cannot file. `null` (county not derived) leaves it true and lets the real gates
   * in checkout and send-letter decide, because refusing a valid customer on
   * missing data is the more expensive of the two mistakes.
   */
  const countyFilable = d?.countyFilable !== false;
  const windowOpen = !win || win.canFile || win.canPreOrder;
  const canOrder = windowOpen && countyFilable;

  /**
   * WHICH refusal, so the sentence matches the reason.
   *
   * "We'll email you the day your county reopens" is the right promise for a
   * closed window and the wrong one for an unconfirmed county — that county has
   * not closed, we simply cannot address the envelope yet. Sending the calendar
   * message to those eleven counties would promise a date that is not the thing
   * they are waiting for.
   *
   * The window is tested first because it is the harder stop: if the season is
   * over, confirming the county's address changes nothing this year.
   */
  const blockedBy = canOrder ? null : (!windowOpen ? 'window' : 'county');
  // Tagged so cron/notify-waitlist sends the county's own promise — "your county
  // is confirmed and there is still time" — instead of the 24 August "your window
  // just opened", which for these eleven counties would not be true.
  const blockedReason = blockedBy === 'county' ? 'fl_county_unconfirmed' : null;
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
        {/*
          THE TOP RIBBON IS GONE, DELIBERATELY.

          It read "Check your property free — no account, no card, no phone call."
          All three promises now sit as chips attached to the button, which is where
          the objection is actually felt. On a 375px phone the ribbon spent ~40px of
          the only screenful that matters repeating words that appear again 300px
          lower. See the fold arithmetic in the hero comment below.
        */}

        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, background: C.navy, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏠</div>
            <div>
              <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 19, color: C.darkNavy, lineHeight: 1 }}>TaxAppeal</div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: C.muted, whiteSpace: 'nowrap' }}>Property Tax Dispute</div>
            </div>
          </Link>
          {/*
            THE CONTACT CONTROL IS A LINK NOW, NOT A FILLED NAVY BUTTON.

            Found by screenshotting the page at 375px rather than by any check. It was
            rendering as the single loudest element on the first screen — same navy
            fill, same weight and a larger tap target than "Check my property", which
            sits 400px lower. The most prominent button on a page whose only job is
            getting an address typed was a support link. It stays reachable; it stops
            competing.
          */}
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            style={{ fontSize: 14, fontWeight: 500, color: C.navy, background: 'transparent', fontFamily: 'inherit', padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Need help?
          </button>
        </div>

        <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(20px, 5vw, 40px) 20px 80px' }}>

          {/*
            ============================================================================
            THE HERO IS 21 WORDS. IT USED TO BE 74. THAT WAS THE BUG.
            ============================================================================
            21-23 Aug: 116 landings on this page produced 46 checks. Net of ~18 checks
            that were our own testing — testing runs checks, it barely touches landings
            — that is roughly 28 real strangers out of ~98 who typed anything at all.
            About 71% left without using the one control on the page. Zuko's form
            benchmark has ~68% of people who SEE a form start filling it in; the
            healthy number here is ~30% walking away, not 71%.

            The copy was not the jargon problem it looked like. Measured 24 Aug, the
            old hero scored Flesch-Kincaid grade 5.5 — plainer by syllable count than
            Ownwell, Redux, Opendoor and King County. It was 74 words against their
            17-33. So: not harder words. Three times too many of them, and pointed the
            wrong way.

            Two things were actually wrong.

            (1) THE FOLD. h1 at a hardcoded fontSize: 40 wraps to four or five lines on
            a 375px screen. Header 110px + padding 40 + h1 ~200 + lead ~123 + the Save
            Our Homes paragraph ~237 put the address box near 700px — at or past the
            fold on a phone, which is where paid traffic overwhelmingly is. The h1 now
            uses clamp() and the paragraph below it is one line.

            (2) THE DIRECTION. "Will an appeal actually lower your tax bill?" is a
            question whose very next sentence answered "no". Nobody types an address
            into a page that has just talked them out of it. That opening was a
            deliberate choice — see THE REFUSAL IS THE PRODUCT in the file header — and
            the choice was right about the product and wrong about the placement.

            The refusal has not been softened and nothing about what we sell has
            changed. It moved. Two-sided messages work when the drawback FOLLOWS the
            promise and fail when it leads: Eisend's meta-analysis finds a curvilinear
            optimum, the blemishing effect (Ein-Gar/Shiv/Tormala) requires the negative
            to come second under low-effort processing, the pratfall effect makes
            admitting flaws a privilege of established competence an unknown site has
            not banked yet, and GOV.UK's "check a service is suitable" pattern is blunt
            that users do not read eligibility prose placed before the start button —
            it belongs in the questions and in the result.

            So the honesty now sits in three places that are all AFTER the box: the
            "4 in 10" line under the form, the "Why we sometimes say no" block below
            it, and — the one that matters — the refusal verdict itself, which is
            unchanged and is still the product.

            Whoever edits this hero next: the constraint is a word count, not a tone.
            Keep it at or under ~25 words to the top of the form, and keep every
            concept that needs a definition below the box.
          */}
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 'clamp(1.85rem, 6.4vw, 2.5rem)', lineHeight: 1.14, margin: '0 0 14px', textWrap: 'balance' }}>
            Is your Florida tax bill too high?
          </h1>

          <p style={{ fontSize: 'clamp(16px, 4.2vw, 18px)', lineHeight: 1.55, color: C.body, margin: '0 0 20px' }}>
            Type your address. We check your county&rsquo;s own records and give you a
            straight answer.
          </p>

          {/* ── Input ─────────────────────────────────────────────────────── */}
          <form onSubmit={runCheck} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
            {/*
              A VISIBLE LABEL, NOT A PLACEHOLDER DOING A LABEL'S JOB.

              At 375px the field rendered as a lone box containing "8023 Marbella Creek
              Ave", which reads as a value already filled in rather than an instruction.
              Baymard puts placeholder-as-label at 38% of mobile checkouts and finds it
              fails; on a single-field page the label is the only instruction there is.
              The example address stays as the placeholder — 60% of sites give no format
              example at all and this one is genuinely useful.
            */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 7 }}>
              <label htmlFor="ta-check-street" style={{ fontSize: 14, fontWeight: 600, color: C.darkNavy }}>
                Your home address
              </label>
              {!zipOpen && (
                <button
                  type="button"
                  onClick={() => setZipOpen(true)}
                  style={{ padding: 0, fontSize: 13, color: C.navy, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}
                >
                  Add a ZIP
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {/*
                Suggestions come from OUR roll, not Google — see the header of
                components/AddressAutocomplete.js. Picking one writes the roll's own
                spelling and ZIP back into the form, which is the single query
                guaranteed to resolve.
              */}
              <AddressAutocomplete
                id="ta-check-street"
                value={form.street}
                onChange={(v) => setForm((f) => ({ ...f, street: v }))}
                onSelect={(s) => { setForm({ street: s.street || '', zip: s.zip || '' }); setZipOpen(false); }}
                zip={form.zip}
                colors={C}
                style={{ flex: '1 1 100%' }}
              />
            </div>

            {/*
              ZIP IS BEHIND A LINK NOW. It was a full-width box under the address,
              captioned "(optional)" and looking exactly as mandatory as the field
              above it — a second ask on a page selling "all we need is an address".

              It is not removed, because it still disambiguates. It is not needed by
              default, because picking a suggestion writes the roll's own ZIP back
              (see AddressAutocomplete's header) and a genuine ambiguity already comes
              back from /api/check as `candidates`, which this page renders as "Did you
              mean one of these?" — a better disambiguation than asking 100% of
              visitors for a ZIP to help the few percent who need it.
            */}
            {zipOpen && (
              <div style={{ marginTop: 10 }}>
                <label htmlFor="ta-check-zip" style={{ display: 'block', fontSize: 13, color: C.body, marginBottom: 6 }}>
                  ZIP code <span style={{ color: C.muted }}>(optional)</span>
                </label>
                <input
                  id="ta-check-zip"
                  value={form.zip}
                  onChange={set('zip')}
                  placeholder="33064"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  autoCorrect="off"
                  style={{ width: 150, maxWidth: '100%', padding: '13px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: 'inherit' }}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={state.status === 'loading'}
              style={{
                marginTop: 14, width: '100%', padding: '15px 20px', fontSize: 17, fontWeight: 600,
                background: C.navy, color: C.white, border: 'none', borderRadius: 8,
                cursor: state.status === 'loading' ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {state.status === 'loading' ? 'Checking your county records…' : 'Check my property'}
            </button>

            {/*
              FOUR CHIPS, ONE OBJECTION EACH — cost, time, commitment, contact.
              This is the pattern every converting address-first funnel in this market
              uses (Ownwell: "Only pay if you save / No upfront costs"; Opendoor: "No
              obligation. Takes 5 minutes. Your information stays private."). It
              replaces the old top ribbon and the "Department of Revenue roll" line,
              which answered a question nobody standing at this box was asking.
            */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '13px 0 0' }}>
              {['Free', 'About 20 seconds', 'No account, no card', 'No phone calls'].map((t) => (
                <span key={t} style={{ fontSize: 12.5, color: C.body, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap' }}>
                  {t}
                </span>
              ))}
            </div>

            {/*
              WHY WE WANT THE ADDRESS, next to the box that wants it. Baymard finds
              65% of mobile checkouts create privacy anxiety purely by not saying what
              a field is for, and that test subjects respond by abandoning or typing
              rubbish. One sentence removes it.
            */}
            <p style={{ fontSize: 12.5, color: C.muted, margin: '11px 0 0', lineHeight: 1.5 }}>
              We use your address to pull your county&rsquo;s public record. That&rsquo;s all
              it&rsquo;s for — we don&rsquo;t sell it and we won&rsquo;t call you.
            </p>
          </form>

          {/*
            TRUST ROW. Three objections a stranger has before typing an address into a
            box on a site they reached from an ad: what is this going to cost me, are
            you about to ask for my details, and where do your numbers come from.
            Answered before the fold rather than in a FAQ nobody scrolls to.
          */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 26 }}>
            {[
              ['$89 flat', 'Never a percentage of your savings'],
              ['All 67 counties', "We hold every Florida county's roll"],
              ['We say no', "About 4 in 10 homes can't be helped"],
            ].map(([head, sub]) => (
              <div key={head} style={{ flex: '1 1 190px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 15px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.darkNavy }}>{head}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/*
            THE PRICE, ON THE FIRST SCREEN. Of seven live competitors read on 24 Aug,
            the three that disclose a rate charge 30-50% OF SAVINGS (O'Connor 50%,
            prptytax 45%, FTAPS $20 + 30%) and the two modern ones (Ownwell, Redux)
            hide the percentage entirely until deep in the funnel. A flat $89 stated
            up front is the strongest competitive fact we own and it was three scrolls
            down. It is shown only before a check has run — once there is a verdict on
            screen the verdict carries its own pricing.
          */}
          {!d && (
            <p style={{ fontSize: 14.5, color: C.body, lineHeight: 1.6, marginBottom: 34 }}>
              On top of the $89 there is your county&rsquo;s own filing fee — <strong style={{ color: C.darkNavy }}>$15
              to $50</strong>, set by the county, not by us. The county keeps that fee either way,
              which is why we tell you whether an appeal can lower your bill before you pay.
            </p>
          )}

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
              {/*
                ON A CAPPED-OUT PARCEL ALL THREE SCENARIOS ARE ZERO, AND THIS PANEL
                LABELLED THEM "Approximate only". 25 Aug.

                The panel was gated on `d.estimates` alone, so a refused homeowner read
                "Rough savings estimate / Approximate only / about $0/yr" three times.
                That $0 is not approximate — it is exact at any millage, which is the
                whole reason the refusal holds. Labelling the one certain number on the
                page as a rough guess undercut the finding it was there to prove.

                Gated on the figures rather than on d.eligible, deliberately: a
                saving_below_cost verdict has small but real estimates and should still
                show the scale it is refusing on.
              */}
              {d.estimates && (d.estimates.conservative > 0 || d.estimates.likely > 0 || d.estimates.optimistic > 0) ? (
                <div style={{ background: '#FAFBFD', border: `1px dashed ${C.border}`, borderRadius: 12, padding: 'clamp(18px, 4vw, 24px)', marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>Rough savings estimate</h2>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
                    Approximate only. These use an average Florida tax rate, not your exact
                    district&rsquo;s, so treat them as a rough scale rather than a quote.
                  </p>
                  <Row label="If a 10% reduction is won" value={`about ${fmt(d.estimates.conservative)}/yr`} />
                  <Row label="If a 15% reduction is won" value={`about ${fmt(d.estimates.likely)}/yr`} />
                  <Row label="If a 25% reduction is won" value={`about ${fmt(d.estimates.optimistic)}/yr`} last />
                </div>
              ) : d.estimates ? (
                <div style={{ background: '#FAFBFD', border: `1px dashed ${C.border}`, borderRadius: 12, padding: 'clamp(18px, 4vw, 24px)', marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>What a win would be worth</h2>
                  <p style={{ fontSize: 14.5, color: C.body, lineHeight: 1.6, margin: 0 }}>
                    <strong style={{ color: C.darkNavy }}>Nothing — $0 a year</strong>, at a 10%,
                    15% or 25% reduction alike. That is not an estimate and it does not depend on
                    your tax rate. Your bill is calculated from the smaller capped figure above, and
                    none of those reductions gets the county&rsquo;s market value below it.
                  </p>
                </div>
              ) : null}

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
                        {/* WHAT WAS HERE, AND WHY IT IS NOT: 25 Aug 2026.
                            ================================================================
                            "If the Board reduces your value, Florida law requires the county
                            to refund that filing fee." It cited Fla. Stat. s. 194.014(2),
                            which requires a refund WITH INTEREST of overpaid *taxes* — a
                            different thing, and the only refund in chapter 194.

                            s. 194.013 is the section that governs this fee and it has four
                            subsections: the $50 cap, the hardship waiver, pay-at-filing-or-
                            be-rejected, and (4), which says collected fees "shall be
                            allocated and utilized to defray... the costs incurred in
                            connection with the administration and operation of the value
                            adjustment board". No refund provision, including in the current
                            text as amended by HB 7031 in 2025 — the amendment that raised
                            the cap $15 -> $50 and is therefore the version worth checking.
                            Fla. Admin. Code R. 12D-9.015 does not contain the word.

                            The counties say the opposite in their own words. Lee: "a
                            non-refundable $30.00 per petition". Orange: "the non-refundable
                            $50 filing fee". lib/flCountyFees.js already quotes Flagler —
                            "A nonrefundable filing fee of $50 per parcel must accompany each
                            petition" — so this file and that one contradicted each other, and
                            the false half was the one on the screen where money is decided.

                            Found because a customer read the same claim on the VAB fee blog
                            post, where it also said the county "will mail it to the address
                            on file", and wrote in to ask whether a cheque was coming and
                            which address it would go to. He owns a rental.

                            Do not reinstate without a citation that survives reading. */}
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

                      {/*
                        THE VERDICT GOES WITH THEM. Without stashVerdict this click
                        landed on the account step, then the property step, then
                        `florida-check` — which re-ran the identical query against
                        the identical roll row to print the identical sentence they
                        are reading right now. 9 of 12 never got past it.
                      */}
                      <Link
                        href="/apply"
                        onClick={() => { stashProperty(state.data?.parcel); stashVerdict(state.data, checkedCounty); }}
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
                        {blockedBy === 'county' ? (
                          <>
                            Your assessment is worth challenging. {checkedCounty ? `${checkedCounty} County` : 'Your county'} has
                            not confirmed the details we need to file there — the address its Value
                            Adjustment Board takes petitions at, or the exact fee it charges — and we
                            will not post a petition to an address we are guessing at. Florida counts a
                            petition as filed when it is RECEIVED with the correct fee, so a wrong
                            envelope is not a late filing, it is no filing. We are chasing them.
                            Leave your email and we will tell you the moment it is settled, if there is
                            still time to file this year.
                          </>
                        ) : (
                          <>
                            Your assessment is worth challenging — we just cannot file it until the
                            window reopens. Leave your email and we will tell you the day it does,
                            with time to spare before the deadline. Nothing else.
                          </>
                        )}
                      </p>
                      {emailState === 'done' ? (
                        <p style={{ color: C.gold, fontWeight: 700, margin: 0 }}>
                          {blockedBy === 'county'
                            ? <>Done. We&rsquo;ll email you as soon as {checkedCounty || 'your county'} County is confirmed.</>
                            : <>Done. We&rsquo;ll email you the day {checkedCounty} County reopens.</>}
                        </p>
                      ) : (
                        <form onSubmit={(e) => joinList(e, blockedReason)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
                        onClick={() => { stashProperty(state.data?.parcel); stashConditionIntent(); stashVerdict(state.data, checkedCounty); }}
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
                        {blockedBy === 'county' ? (
                          <>
                            {checkedCounty ? `${checkedCounty} County` : 'Your county'} has not yet confirmed
                            the filing address or the fee its Value Adjustment Board requires, and we will
                            not post a petition to an address we are guessing at. Leave your email and we
                            will pick this up with you the moment that is settled.
                          </>
                        ) : (
                          <>
                            {checkedCounty ? `${checkedCounty} County has closed for 2026` : 'Your county has closed for 2026'} — so
                            there is nothing we can file yet. Leave your email and we will tell you the day
                            it reopens, and pick this up with you then.
                          </>
                        )}
                      </p>
                      {emailState === 'done' ? (
                        <p style={{ color: C.gold, fontWeight: 700, margin: 0 }}>
                          {blockedBy === 'county'
                            ? <>Done. We&rsquo;ll email you as soon as {checkedCounty || 'your county'} is confirmed.</>
                            : <>Done. We&rsquo;ll email you the day {checkedCounty || 'your county'} reopens.</>}
                        </p>
                      ) : (
                        <form onSubmit={(e) => joinList(e, blockedReason)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
                /*
                  ============================================================================
                  THE REFUSAL SCREEN. NO EMAIL CAPTURE. 25 AUG.
                  ============================================================================
                  This card used to read "We'll tell you when that changes" over an email box
                  and the promise "We re-check every roll and will email you the year yours
                  crosses that line."

                  Nothing kept that promise. The form wrote blocked_reason 'fl_not_eligible'
                  (the default at :260, since joinList was called with no second argument), and
                  cron/notify-waitlist.js:315 hard-skips exactly that reason. Nothing anywhere
                  computes "just value falling toward the capped value". So the largest single
                  outcome this product produces — about 4 in 10 Florida homes — ended in a
                  promise with no implementation behind it, on the one page whose whole claim
                  is that we tell people the truth.

                  It was removed rather than implemented, on Nathan's call, 25 Aug, and the
                  reasoning is worth keeping because it is the right reasoning: the gap closes
                  three ways and none of them is a business. Market values falling far enough
                  is rare. A sale resets the cap but hands the opportunity to the NEXT owner,
                  not this one. And assessed value grinding up 3%/CPI a year against flat
                  market values takes six or seven years to close a typical gap. A list of
                  people waiting on that is not an asset, which is presumably why nothing was
                  ever built to send to it.

                  What replaces it costs us nothing and is actually useful to someone we have
                  just turned away: where the money really is for a capped-out homeowner
                  (exemptions, which their county administers free), permission to do nothing,
                  and the means to check our arithmetic against the county's own record.

                  DO NOT add a capture back here without building the thing it promises first.
                */
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 'clamp(18px, 4vw, 24px)' }}>
                  <h2 style={{ fontSize: 'clamp(1.15rem, 4.4vw, 1.25rem)', margin: '0 0 14px' }}>What to do instead</h2>

                  <div style={{ display: 'flex', gap: 13, marginBottom: 16 }}>
                    <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: C.navy, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>1</div>
                    <div>
                      <div style={{ fontSize: 15.5, fontWeight: 700, color: C.darkNavy, marginBottom: 3 }}>Make sure you have every exemption</div>
                      <div style={{ fontSize: 14.5, color: C.body, lineHeight: 1.6 }}>
                        For a home like yours this is where the money actually is. There is the
                        homestead exemption, and extra ones for people over 65, veterans, widows
                        and widowers, and some disabilities. Each one comes straight off your
                        bill. Plenty of people qualify for one they never claimed. Your county
                        handles it, it is free, and we do not charge for it either.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 13, marginBottom: 16 }}>
                    <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: C.navy, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>2</div>
                    <div>
                      <div style={{ fontSize: 15.5, fontWeight: 700, color: C.darkNavy, marginBottom: 3 }}>Nothing else, this year</div>
                      <div style={{ fontSize: 14.5, color: C.body, lineHeight: 1.6 }}>
                        There is no form to send and no deadline you are about to miss. Keep your
                        money.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 13, marginBottom: 4 }}>
                    <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: C.navy, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>3</div>
                    <div>
                      <div style={{ fontSize: 15.5, fontWeight: 700, color: C.darkNavy, marginBottom: 3 }}>Come back if you buy</div>
                      <div style={{ fontSize: 14.5, color: C.body, lineHeight: 1.6 }}>
                        A sale wipes out this protection. Whoever buys next starts at full market
                        value, and an appeal can be worth filing for them from the first year —
                        including if that buyer is you, somewhere else.
                      </div>
                    </div>
                  </div>

                  {/*
                    CHECK US. The file header calls the refusal "the only claim in this market
                    that survives being checked" — and until now the screen told the homeowner
                    to check it against their TRIM notice while giving them nothing to check it
                    with from the device in their hand. 40 of 67 counties have a portal on file;
                    the rest get the sentence without the link rather than a guessed URL.
                  */}
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 20, paddingTop: 18 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: C.darkNavy, marginBottom: 5 }}>Check us against your county</div>
                    <p style={{ fontSize: 14.5, color: C.body, lineHeight: 1.6, margin: '0 0 10px' }}>
                      These are your county&rsquo;s own numbers, not ours
                      {d.parcel?.parcelId ? <> — parcel <span style={{ fontFamily: 'ui-monospace, monospace' }}>{d.parcel.parcelId}</span></> : null}.
                      The same figures are on the notice your county mailed you in August.
                    </p>
                    {checkedPortal && (
                      <a
                        href={checkedPortal.searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-block', fontSize: 15, fontWeight: 600, color: C.navy, textDecoration: 'underline', textUnderlineOffset: 3 }}
                      >
                        Look it up at the {checkedPortal.name} &rarr;
                      </a>
                    )}
                  </div>
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
          {/*
            SAVE OUR HOMES, EXPLAINED BELOW THE BOX INSTEAD OF ABOVE IT.

            This is the paragraph that used to be sentence three of the hero. Every
            word in it was short and the IDEA was not: "once that cap opens a gap,
            winning a reduction in market value doesn't change what you pay" asks a
            cold ad click to hold four new concepts at once — the cap, the gap,
            assessed versus market value, and the fact that winning can still change
            nothing. A readability formula counts syllables and cannot see that.

            Rewritten with the two terms of art removed: "taxable value" for assessed
            value, "what it would sell for" for market value, and no cap/gap metaphor
            at all. If you are tempted to put "assessed value" back, note that the
            verdict screens below still use it — correctly, next to the county's own
            figure and the parcel number, where the homeowner can check it against
            their TRIM notice. It belongs there. It does not belong here.
          */}
          {!d && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 'clamp(18px, 4vw, 24px)', margin: '0 0 34px' }}>
              <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 'clamp(1.25rem, 4.6vw, 1.5rem)', margin: '0 0 10px' }}>
                Why we sometimes say no
              </h2>
              <p style={{ fontSize: 15, color: C.body, lineHeight: 1.65, margin: '0 0 12px' }}>
                Florida has a rule called Save Our Homes. It limits how fast the taxable value
                of your home can climb — and after a few years that figure is often well below
                what the house would actually sell for.
              </p>
              <p style={{ fontSize: 15, color: C.body, lineHeight: 1.65, margin: '0 0 12px' }}>
                When that is true of your home, arguing that it is worth less than the county
                thinks will not lower your bill. You are already being taxed on the smaller
                number. Winning changes nothing.
              </p>
              <p style={{ fontSize: 15, color: C.body, lineHeight: 1.65, margin: 0 }}>
                That is about 4 in 10 Florida homes. Every other company will take their money
                and file anyway, because finding out requires the county&rsquo;s own roll and no
                data provider sells it. <strong style={{ color: C.darkNavy }}>We hold the roll,
                so we can tell you in about twenty seconds, for free, and send you away.</strong>
              </p>
            </div>
          )}

          {!d && (
            <div style={{ marginTop: 8 }}>
              <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 'clamp(1.35rem, 5vw, 1.625rem)', margin: '0 0 6px' }}>
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
                (set by the county, $15–$50). Never a percentage of your savings. The county&rsquo;s
                fee is not refundable, which is why we check whether an appeal can lower your bill
                before you pay rather than after.
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
