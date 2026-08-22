import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Breadcrumb from '../../components/Breadcrumb';
import { SITE_ORIGIN } from '../../lib/breadcrumbs';
import {
  currentTaxYear,
  floor as deadlineFloor,
  projectFor,
  DISTRICT_MAILING,
  formatLong,
  formatUS,
} from '../../lib/tx/protestDeadline';
import { counties as ALL_COUNTIES } from '../../lib/countyData';

/**
 * /texas/protest-deadline — THE 2027 DEADLINE, AND WHY IT IS NOT 15 MAY.
 *
 * ============================================================================
 * WHY THIS PAGE
 * ============================================================================
 * Two facts from the 22 Aug 2026 competitive sweep:
 *
 *  1. Across four searches for 2027-dated Texas protest content, the entire sector
 *     produced TWO pages. O'Connor, Ownwell, Ballard, Resolute, PropertyTaxes.Law and
 *     HomeTaxShield are all hard-coded to 2026, frequently in the title tag ("Lower
 *     Your 2026 Taxes", "File Before May 15"). They rewrite around March 2027.
 *  2. Nobody has a deadline countdown. Eight of the twelve pages torn down state a
 *     deadline; zero make it urgent.
 *
 * And the substantive hook: 15 May 2027 is a Saturday, so § 1.06 moves the floor to
 * Monday 17 May. "Is it the 15th or the 17th" is a question that will be asked, has a
 * definite answer, and currently has no page.
 *
 * ============================================================================
 * WHY THE URL HAS NO YEAR IN IT
 * ============================================================================
 * Deliberately /texas/protest-deadline, not /texas/protest-deadline-2027.
 *
 * The whole sector's recurring weakness is baking the year into the URL and the title,
 * which forces a hand-rewrite every spring and resets whatever authority the URL had
 * accumulated. One evergreen URL whose TITLE carries the derived current year ranks
 * for the year query and compounds across seasons. That is strictly better than what
 * every competitor does, and it costs nothing.
 *
 * ============================================================================
 * WHAT THIS PAGE MAY AND MAY NOT SAY
 * ============================================================================
 * The per-district table below is generated from DISTRICT_MAILING, so it cannot drift
 * from the data the deadline engine reasons over. Every row states its own confidence
 * and every projection is labelled a projection. Under no circumstances may a
 * projected date be presented as the deadline — see the header of
 * lib/tx/protestDeadline.js. The committed date on this page is always the floor.
 */

const C = {
  navy: '#1B3A6B', gold: '#FFC940', darkNavy: '#0F1F3D', bg: '#F4F7FC',
  lightBlue: '#EEF3FB', bodyGray: '#5A6B82', mutedGray: '#8596AF',
  border: '#E8EDF4', white: '#FFFFFF', green: '#2E7D52', warn: '#8A5A00',
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

/**
 * The rest of the 2027 calendar. Statutory cites are to the Texas Tax Code; the two
 * roll cases are computed by the same § 1.06 logic the floor uses, not typed.
 */
function calendarFor(taxYear) {
  return [
    ['1 January', `Valuation date (§ 23.01). Your ${taxYear} value is a snapshot of this day — damage or a change in condition after it does not count for ${taxYear}.`],
    ['Late Mar – late Apr', 'Appraisal districts mail Notices of Appraised Value (§ 25.19). Homestead notices are due by 1 April, everything else by 1 May — both "or as soon thereafter as practicable", which is why the real dates drift.'],
    ['30 April', 'Homestead exemption application deadline (§ 11.43). You can still file late — up to two years after delinquency (§ 11.431) — and get a refund.'],
    [`${formatUS(deadlineFloor(taxYear).iso).replace(`, ${taxYear}`, '')}`, `The protest deadline floor (§ 41.44). Or 30 days after your notice was delivered, whichever is later.`],
    ['May – July', 'Informal conferences and ARB hearings. Most protests end informally, before a panel ever sees them.'],
    ['20 July', 'The ARB must approve the appraisal records (§ 41.12).'],
    ['25 July', 'Chief appraiser certifies the roll — 30 August in counties over one million (Harris, Dallas, Tarrant, Bexar, Travis).'],
    ['Aug – Oct', 'ARB orders land, starting the 60-day clocks for binding arbitration and district court. Taxing units adopt rates.'],
    ['October', `${taxYear} tax bills are mailed.`],
    ['31 January', `${taxYear} taxes are due. Delinquent 1 February.`],
  ];
}

export default function TexasProtestDeadline({ taxYear, floorIso, floorLong, floorUS, rawUS, rows, txCountyCount }) {
  /**
   * Countdown. Rendered empty on the server and filled in after mount — the day count
   * depends on the viewer's clock, and interpolating it during SSR would produce a
   * hydration mismatch on every page load that crossed midnight in the CDN cache.
   * The date itself is server-rendered, so the page is complete and correct with
   * JavaScript disabled; the countdown is an enhancement, not the content.
   */
  const [daysLeft, setDaysLeft] = useState(null);
  useEffect(() => {
    const today = new Date();
    const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const [y, m, d] = floorIso.split('-').map(Number);
    setDaysLeft(Math.round((Date.UTC(y, m - 1, d) - utcToday) / 86400000));
  }, [floorIso]);

  const canonical = `${SITE_ORIGIN}/texas/protest-deadline`;
  // The title deliberately carries both dates: "is the texas protest deadline may 15
  // or may 17" is the query this page exists to answer, and it answers it in the H1,
  // the hero and the meta description.
  // deadline-literal-ok: the query being targeted, answered on the page itself
  const title = `Texas Property Tax Protest Deadline ${taxYear} — Is It May 15 or May 17? | TaxAppeal USA`;
  const description =
    `The ${taxYear} Texas protest deadline is ${floorUS}, not ${rawUS} — ${rawUS} is a Saturday and ` +
    `Tax Code § 1.06 moves it to the next business day. Or 30 days after your appraisal ` +
    `district mails your notice, whichever is later. Per-district mailing dates inside.`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} key="canonical" />
        <meta property="og:title" content={`Texas Protest Deadline ${taxYear}: ${floorLong}`} key="og:title" />
        <meta property="og:description" content={description} key="og:description" />
        <meta property="og:url" content={canonical} key="og:url" />
        <meta property="og:type" content="article" key="og:type" />

        {/* No FAQPage. Google withdrew the FAQ rich result on 7 May 2026 and
            scripts/verify-pages.mjs bans it. The FAQ below is plain semantic HTML,
            which is what answer engines read anyway. */}
      </Head>

      <style>{`
        ${FONT}
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}
        .wrap{max-width:860px;margin:0 auto;padding:0 24px;}
        .btn-gold{background:${C.gold};color:${C.darkNavy};border:none;border-radius:8px;padding:16px 38px;font-size:16px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}
        .btn-primary{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;}
        h2{font-family:'DM Serif Display',serif;font-size:29px;line-height:1.2;margin:0 0 14px;}
        h3{font-size:17px;font-weight:600;margin:0 0 8px;}
        p{font-size:15.5px;line-height:1.75;color:${C.bodyGray};margin:0 0 16px;}
        .sec{padding:52px 0;border-top:1px solid ${C.border};}
        table{width:100%;border-collapse:collapse;font-size:14px;background:${C.white};}
        th{text-align:left;padding:11px 14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.mutedGray};border-bottom:2px solid ${C.border};white-space:nowrap;}
        td{padding:11px 14px;border-bottom:1px solid ${C.border};color:${C.bodyGray};vertical-align:top;}
        td.k{color:${C.darkNavy};font-weight:600;}
        .tw{overflow-x:auto;border:1px solid ${C.border};border-radius:10px;}
        .pill{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 7px;border-radius:4px;white-space:nowrap;}
        .p-district{background:#E4F0E9;color:${C.green};}
        .p-press{background:#EEF3FB;color:${C.navy};}
        .p-thin{background:#FBF1DC;color:${C.warn};}
        .p-none{background:#F1F3F7;color:${C.mutedGray};}
        .note{background:${C.lightBlue};border-left:4px solid ${C.navy};border-radius:0 10px 10px 0;padding:20px 24px;margin:0 0 20px;}
        .note.warn{border-left-color:${C.warn};background:#FBF6EA;}
        .note p:last-child{margin-bottom:0;}
        .cal{display:grid;grid-template-columns:190px 1fr;gap:0;border:1px solid ${C.border};border-radius:10px;overflow:hidden;background:${C.white};}
        .cal>div{padding:13px 16px;border-bottom:1px solid ${C.border};font-size:14px;}
        .cal>div:nth-child(odd){background:${C.lightBlue};color:${C.darkNavy};font-weight:600;}
        .cal>div:nth-child(even){color:${C.bodyGray};line-height:1.6;}
        .faq{background:${C.white};border:1px solid ${C.border};border-radius:10px;padding:20px 22px;margin-bottom:10px;}
        .faq p{margin-bottom:0;font-size:14.5px;}
        @media(max-width:700px){
          .hero-date{font-size:38px !important;}
          .cal{grid-template-columns:1fr;}
          .cal>div:nth-child(odd){border-bottom:none;}
        }
      `}</style>

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, background: C.navy, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏠</div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: C.darkNavy }}>TaxAppeal USA</div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px', color: C.mutedGray }}>Property Tax Dispute</div>
          </div>
        </a>
        <Link href="/apply"><button className="btn-primary">Start my protest →</button></Link>
      </div>

      <Breadcrumb
        trail={[
          { name: 'Home', href: '/' },
          { name: 'Texas', href: '/texas' },
          { name: `${taxYear} Protest Deadline` },
        ]}
        selfUrl={canonical}
      />

      {/* HERO — the answer first, then the countdown. */}
      <section style={{ background: C.navy, color: C.white, padding: '56px 40px 52px' }}>
        <div className="wrap">
          <div style={{ fontSize: 12, color: C.gold, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 18 }}>
            Texas · {taxYear} protest deadline
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 40, lineHeight: 1.15, marginBottom: 18 }}>
            The {taxYear} Texas protest deadline is {floorLong} — not {rawUS}.
          </h1>
          <p style={{ fontSize: 18, color: '#A9BCD4', lineHeight: 1.65, marginBottom: 30, maxWidth: 640 }}>
            {rawUS} falls on a Saturday. Texas Tax Code § 1.06 moves any deadline landing on a
            weekend or holiday to the next business day, so the floor for every Texas property
            is {floorLong}. If your appraisal district mails your notice after about 17 April,
            you have longer still.
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 30 }}>
            <div style={{ background: C.darkNavy, borderRadius: 12, padding: '18px 24px', minWidth: 190 }}>
              <div className="hero-date" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, color: C.gold, lineHeight: 1.1 }}>
                {floorUS}
              </div>
              <div style={{ fontSize: 11.5, color: '#7E93AD', marginTop: 6 }}>Statutory floor, every county</div>
            </div>
            <div style={{ background: C.darkNavy, borderRadius: 12, padding: '18px 24px', minWidth: 190 }}>
              <div className="hero-date" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, color: C.gold, lineHeight: 1.1 }}>
                {daysLeft === null ? '—' : daysLeft > 0 ? daysLeft.toLocaleString() : 'Closed'}
              </div>
              <div style={{ fontSize: 11.5, color: '#7E93AD', marginTop: 6 }}>
                {daysLeft === null ? 'Days remaining' : daysLeft > 0 ? 'Days remaining' : `The ${taxYear} window has closed`}
              </div>
            </div>
            <div style={{ background: C.darkNavy, borderRadius: 12, padding: '18px 24px', minWidth: 190 }}>
              <div className="hero-date" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, color: C.gold, lineHeight: 1.1 }}>$89</div>
              <div style={{ fontSize: 11.5, color: '#7E93AD', marginTop: 6 }}>Flat — never a % of your savings</div>
            </div>
          </div>

          <Link href="/apply"><button className="btn-gold">Start my Texas protest — $89 →</button></Link>
        </div>
      </section>

      <div style={{ background: C.white }}>
        <div className="wrap">

          {/* THE RULE */}
          <section className="sec" style={{ borderTop: 'none' }}>
            <h2>The rule is a floor, not a date</h2>
            <p>
              {/* deadline-quote:start — verbatim § 41.44(a)(1); the statute's own words */}
              Almost every page you will read says the Texas deadline is 15 May. That is half the
              rule. <strong>Tax Code § 41.44(a)(1)</strong> says a notice of protest is timely if
              filed <em>&ldquo;not later than May 15 or the 30th day after the date that notice to
              the property owner was delivered … whichever is <strong>later</strong>.&rdquo;</em>
              {/* deadline-quote:end */}
            </p>
            <p>
              So the deadline is a property of <strong>your notice</strong>, not of your county.
              Two owners in the same county can hold different deadlines — Collin County mailed
              real-property notices on 15 April 2026 and business personal property from 13 May,
              inside one district, producing two different dates.
            </p>
            <div className="note">
              <h3>What to do, concretely</h3>
              <p>
                Find the date printed on your Notice of Appraised Value. Add 30 days. If that is
                later than {floorUS}, that later date is your deadline. If it is earlier — or you
                never received a notice — {floorUS} is your deadline. When in doubt, work to the
                earlier of the two: filing early costs nothing and filing late costs the year.
              </p>
            </div>
          </section>

          {/* WHY THE 17th */}
          <section className="sec">
            <h2>Why {floorUS} and not {rawUS}</h2>
            <p>
              <strong>Tax Code § 1.06:</strong> <em>&ldquo;If the last day for the performance of
              an act is a Saturday, Sunday, or legal state or national holiday, the act is timely
              if performed on the next regular business day.&rdquo;</em>
            </p>
            <p>
              {rawUS} is a Saturday and 16 May {taxYear} is a Sunday, so the first regular business
              day is {floorLong}. Government Code § 662.003 lists no state or national holiday in
              mid-May — Memorial Day {taxYear} is the 31st — so nothing pushes it further.
            </p>
            <p style={{ marginBottom: 0 }}>
              This matters because filing on the 17th when you believed the deadline was the 15th
              feels like being two days late. It is not. It is on time.
            </p>
          </section>

          {/* THE HARRIS CASE */}
          <section className="sec">
            <h2>Do not take the deadline from your district&rsquo;s own headline</h2>
            <p>
              In 2026, Harris Central Appraisal District mailed notices dated 17 April. Thirty days
              from 17 April is Sunday 17 May, which § 1.06 rolls to <strong>Monday 18 May</strong>
              {' '}— so most Harris owners had until the 18th.
            </p>
            <p>
              {/* deadline-quote:start — quoting HCAD release 26-08 verbatim, including its error */}
              HCAD&rsquo;s own protest-deadline release (26-08) was headlined <em>&ldquo;Protest
              Deadline Is May 15&rdquo;</em> and told owners they had <em>&ldquo;until Thursday,
              May 15&rdquo;</em>. 15 May 2026 was a <strong>Friday</strong>. The body of the release
              did carry the § 41.44 rule correctly — but the headline named a date three days early
              and a weekday that did not exist.
            </p>
            <p style={{ marginBottom: 0 }}>
              We are not picking on HCAD. As this page is written, Brazoria Central Appraisal
              District&rsquo;s live appeals page still displays a deadline of{' '}
              <em>&ldquo;Wednesday, May 15, 2025&rdquo;</em>. District pages go stale. The date on
              your notice does not.
              {/* deadline-quote:end */}
            </p>
          </section>

          {/* PER-DISTRICT TABLE */}
          <section className="sec">
            <h2>When each district mails, and what that implies for {taxYear}</h2>
            <p>
              Districts anchor to a calendar date, not a weekday — Fort Bend mailed on 1 April in
              2024, 2025 and 2026, which were a Monday, a Tuesday and a Wednesday. That makes the
              past a usable guide and the weekday irrelevant.
            </p>
            <p>
              <strong>Everything in the &ldquo;implied {taxYear}&rdquo; column is a projection, not
              a commitment.</strong> No district has announced a {taxYear} date. Where we have
              fewer than two observations, or where a district is visibly drifting, we publish no
              projection rather than a guess — an invented date here would be worse than an empty
              cell.
            </p>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Observed mailing dates</th>
                    <th>Source</th>
                    <th>Implied {taxYear} deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.slug}>
                      <td className="k">
                        {r.countyHref
                          ? <a href={r.countyHref} style={{ color: C.navy, textDecoration: 'none' }}>{r.district}</a>
                          : r.district}
                      </td>
                      <td>{r.observed || <span style={{ color: C.mutedGray }}>none found</span>}</td>
                      <td>
                        <span className={`pill p-${r.pill}`}>{r.confidenceLabel}</span>
                      </td>
                      <td>
                        {r.projection
                          ? <>{r.projection}<div style={{ fontSize: 12, color: C.mutedGray, marginTop: 3 }}>projected</div></>
                          : <>{floorUS}<div style={{ fontSize: 12, color: C.mutedGray, marginTop: 3 }}>floor only</div></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 13.5, marginTop: 14, marginBottom: 0, color: C.mutedGray }}>
              Every projection is clamped to the statutory floor: § 41.44 lets a district clear the
              floor by mailing late, never undercut it. We file in all {txCountyCount} Texas
              counties, not only the districts listed here — this table is where the published
              evidence is, not where the coverage is.
            </p>
          </section>

          {/* CALENDAR */}
          <section className="sec">
            <h2>The rest of the {taxYear} calendar</h2>
            <div className="cal">
              {calendarFor(taxYear).map(([when, what]) => (
                <div key={when} style={{ display: 'contents' }}>
                  <div>{when}</div>
                  <div>{what}</div>
                </div>
              ))}
            </div>
          </section>

          {/* MISSED IT */}
          <section className="sec">
            <h2>If you miss it</h2>
            <p>
              Missing the deadline usually costs you the year, but not always. Three routes survive
              it, and none of them is well known:
            </p>
            <p>
              <strong>You never received a required notice.</strong> § 41.411 lets you protest the
              district&rsquo;s failure to deliver a notice it was obliged to send, provided you file
              before the taxes become delinquent. Note that a notice is only required in certain
              cases — many owners get none at all in a year their value did not rise.
            </p>
            <p>
              <strong>The value is badly wrong.</strong> § 25.25(d) allows a late correction where a
              residence homestead is over-appraised by more than <strong>one quarter</strong>, or
              other property by more than <strong>one third</strong>. There is a late-correction
              penalty, and the bar is deliberately high.
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong>It is a clerical error, not a judgement.</strong> § 25.25(c) reaches back five
              years for clerical errors, multiple appraisals of one property, and property listed to
              the wrong owner.
            </p>
          </section>

          {/* CIRCUIT BREAKER */}
          <section className="sec">
            <h2>One change specific to {taxYear}: the 20% cap expires</h2>
            <div className="note warn">
              <p>
                <strong>Tax Code § 23.231</strong> — the 20% annual cap on non-homestead real
                property valued under the inflation-adjusted threshold ($5,320,000 for 2026) —
                {/* deadline-literal-ok: verbatim statutory text of § 23.231 */}
                contains the words <em>&ldquo;This section expires December 31, 2026.&rdquo;</em>
              </p>
              <p>
                Unless the 90th Legislature, which convenes on 12 January {taxYear}, extends it,{' '}
                <strong>{taxYear} is the first year rental property, second homes and small
                commercial property in Texas are appraised with no annual cap at all.</strong> If you
                own any of those, the value on your {taxYear} notice may move by considerably more
                than you are used to, and nothing absorbs it.
              </p>
              <p>
                Homesteads are unaffected — the 10% cap in § 23.23 is a separate provision and does
                not expire. We are tracking whether the Legislature acts and will update this page
                either way.
              </p>
            </div>
          </section>

          {/* FAQ — visible content, no FAQPage markup */}
          <section className="sec">
            <h2>Questions people actually ask</h2>

            <div className="faq">
              <h3>Is the {taxYear} Texas protest deadline 15 May or 17 May?</h3>
              <p>
                {floorUS}. {rawUS} is a Saturday, and § 1.06 moves a deadline falling on a weekend
                to the next business day. Both dates get quoted because most published pages state
                the statute&rsquo;s raw date without applying the roll.
              </p>
            </div>

            <div className="faq">
              <h3>I never received a Notice of Appraised Value. Can I still protest?</h3>
              <p>
                Yes. A district only has to send a notice in specific circumstances — chiefly when
                your value rose. Bexar mailed about 196,000 notices in 2026 against roughly 788,000
                parcels. No notice does not mean no right to protest, and the floor still applies to
                you.
              </p>
            </div>

            <div className="faq">
              <h3>My value did not go up. Is there any point?</h3>
              <p>
                Possibly. Texas gives two independent grounds: that the market value is too high
                (§ 41.43(a)), and that your property is appraised unequally compared with a
                representative sample of comparable properties (§ 41.43(b)). The second does not
                depend on your value having risen — only on it being out of line with your
                neighbours. <a href="/blog/texas-unequal-appraisal-protest-guide-2026" style={{ color: C.navy }}>We explain unequal appraisal here.</a>
              </p>
            </div>

            <div className="faq">
              <h3>Can protesting make my value go up?</h3>
              <p>
                The Appraisal Review Board determines the value, and it is not bound to move only
                downward. In practice an increase is uncommon. What we will not do is tell you it is
                impossible — that claim gets made a lot by people with an incentive to make it.
              </p>
            </div>

            <div className="faq">
              <h3>Should I file early or wait?</h3>
              <p>
                Early. In 2025 Travis County had roughly 150,000 protests two days before the
                deadline and finished the season at 204,869 — about a quarter of the entire year
                arrived in the last 48 hours. Informal conference slots are finite and they are
                allocated in the order protests arrive.
              </p>
            </div>

            <div className="faq" style={{ marginBottom: 0 }}>
              <h3>What does TaxAppeal USA actually do?</h3>
              <p>
                We prepare your Notice of Protest (Form 50-132) with comparable-sales evidence, you
                sign it, and we mail it to your appraisal district by USPS certified mail so there is
                proof of timely filing. $89 flat, whatever the outcome — we never take a percentage
                of a reduction. We do not appear at your hearing on your behalf.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="sec" style={{ paddingBottom: 60 }}>
            <div style={{ background: C.navy, borderRadius: 16, padding: '40px 36px', textAlign: 'center' }}>
              <h2 style={{ color: C.white, marginBottom: 12 }}>
                {daysLeft !== null && daysLeft > 0
                  ? `${daysLeft.toLocaleString()} days until ${floorUS}`
                  : `The Texas deadline is ${floorUS}`}
              </h2>
              <p style={{ color: '#A9BCD4', maxWidth: 520, margin: '0 auto 26px' }}>
                We check whether a protest can actually lower your bill before you pay anything.
              </p>
              <Link href="/apply"><button className="btn-gold">Start my protest — $89 →</button></Link>
              <div style={{ marginTop: 20, fontSize: 13.5 }}>
                <a href="/texas" style={{ color: C.gold, textDecoration: 'none' }}>
                  All {txCountyCount} Texas counties →
                </a>
              </div>
            </div>
          </section>

        </div>
      </div>

      <footer style={{ background: C.darkNavy, padding: '26px 40px', textAlign: 'center' }}>
        <p style={{ color: C.mutedGray, fontSize: 12, margin: 0 }}>
          © {new Date().getFullYear()} TaxAppeal USA · customerservice@taxappealusa.com ·{' '}
          Statutory citations are to the Texas Tax Code and Government Code as published by the
          Texas Comptroller. This page is information, not legal advice.
        </p>
      </footer>
    </>
  );
}

export async function getStaticProps() {
  const taxYear = currentTaxYear();
  const f = deadlineFloor(taxYear);

  const CONF = {
    district: ['District release', 'district'],
    press: ['Named news outlet', 'press'],
    thirdparty: ['Third party, uncited', 'thin'],
  };

  const txSlugs = new Set(ALL_COUNTIES.filter((c) => c.code === 'TX').map((c) => c.slug));

  const rows = Object.entries(DISTRICT_MAILING).map(([slug, d]) => {
    const p = projectFor(slug, taxYear);
    const observed = d.history
      .slice()
      .sort((a, b) => b.year - a.year)
      .map((h) => formatUS(h.date).replace(`, ${h.year}`, ` ${h.year}`))
      .join(' · ');
    const worst = d.history.length
      ? d.history.reduce((w, h) => {
          const rank = { district: 3, press: 2, thirdparty: 1 };
          return rank[h.confidence] < rank[w] ? h.confidence : w;
        }, 'district')
      : null;
    const [confidenceLabel, pill] = worst ? CONF[worst] : ['No data found', 'none'];
    return {
      slug,
      district: d.district,
      countyHref: txSlugs.has(slug) ? `/counties/${slug}` : null,
      observed,
      confidenceLabel,
      pill,
      // Only surface a projection where it clears the floor — otherwise the cell would
      // repeat the floor and read as a district-specific finding when it is not one.
      projection: p && p.iso !== f.iso ? formatUS(p.iso) : null,
    };
  }).sort((a, b) => a.district.localeCompare(b.district));

  return {
    props: {
      taxYear,
      floorIso: f.iso,
      floorLong: formatLong(f.iso),
      floorUS: f.us,
      rawUS: formatUS(f.raw),
      rows,
      txCountyCount: txSlugs.size,
    },
    // Same reason as /texas/[city]: the page must not keep claiming a season that has
    // ended if the site is not redeployed across the rollover.
    revalidate: 43200,
  };
}
