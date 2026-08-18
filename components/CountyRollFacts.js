import { COUNTY_CODES } from '../lib/tx/counties';
import countyStats from '../lib/tx/countyStats.json';

/**
 * ============================================================================
 * WHAT THE DISTRICT'S OWN ROLL SAYS — the block that makes a county page real
 * ============================================================================
 *
 * Renders `null` unless we hold that county's certified roll. 254 pages carrying
 * borrowed or invented statistics is the scaled-content pattern Google's spam
 * policy names directly, and it would also be a lie. A county we have not loaded
 * gets the page it has today.
 *
 * Every figure is a SQL aggregate over the district's own certified roll,
 * computed by scripts/tx/county-stats.mjs. Nothing here is modelled, sampled,
 * projected or estimated. No assumed tax rate, no projected saving, no "typical
 * homeowner". The estimates live in lib/tx/qualify.js, are labelled as estimates,
 * and never leave the funnel.
 *
 * ── ONE NUMBER NEEDS ITS NAME WATCHED ───────────────────────────────────────
 * `valueDispersion` is NOT a coefficient of dispersion, and this file must never
 * call it one. The IAAO Standard on Ratio Studies computes a COD over
 * assessment-to-SALE-PRICE ratios; Texas is a non-disclosure state and we have no
 * sale prices, so we cannot compute one and cannot cite the IAAO benchmark.
 *
 * What we do compute — how far the district's own appraised value per square foot
 * varies from the median WITHIN a neighbourhood — needs no sale prices and is the
 * statistic § 41.43(b)(3) actually turns on, because equal and uniform compares a
 * property to its comparables rather than to the market. It is described here in
 * plain words for that reason, with no benchmark attached. See the long note at
 * the top of scripts/tx/county-stats.mjs.
 */

const C = {
  navy: '#1B2A4A',
  gold: '#C9A84C',
  white: '#FFFFFF',
  text: '#1A1A2E',
  muted: '#666680',
  rule: '#E5E3DC',
};

const fmt = (n) => (n === null || n === undefined ? null : Number(n).toLocaleString());
const money = (n) => (n === null || n === undefined ? null : `$${Math.round(n).toLocaleString()}`);

/**
 * ============================================================================
 * WHY THIS COMPOSES INSTEAD OF SWITCHING ON ONE NUMBER
 * ============================================================================
 * The first version banded `valueDispersion` into narrow / moderate / wide and
 * returned one sentence per band. Against the five loaded counties, four landed
 * in the same band and got a WORD-FOR-WORD IDENTICAL paragraph. Different
 * numbers in the stat row, boilerplate underneath.
 *
 * That is the scaled-content pattern this whole exercise exists to avoid, and it
 * fails on its own terms too: a homeowner in Wichita and one in Kaufman face
 * genuinely different situations — 1961 housing stock at 12.6% capped versus 2019
 * housing stock at 8.8% — and a page that describes them identically is not
 * telling either of them the truth about their county.
 *
 * So the paragraph is assembled from several axes that vary independently:
 * dispersion, the age of the housing stock, and the capped share. Each clause
 * quotes that county's own figure, so the specificity is carried by facts rather
 * than by synonyms. Two counties produce the same sentence only when they are
 * actually alike in all three respects.
 *
 * Every clause is an observation about the roll. None of them is a prediction
 * about a particular house.
 */

// Dispersion band. Cut-offs are descriptive language only — deliberately NOT a
// pass/fail line, because a threshold here would recreate the IAAO benchmark
// claim we cannot support. See scripts/tx/county-stats.mjs.
function dispersionClause(d, name) {
  if (d < 8) {
    return `That is unusually tight. ${name} County values similar homes very consistently, and where a district is that uniform an equal-and-uniform argument has little to grip — the median of your comparables will sit close to your own value.`;
  }
  if (d < 11) {
    return `That is a fairly tight spread, though not so tight that outliers do not exist. Most ${name} County homes sit close to their neighbours; the ones that do not, stand out clearly.`;
  }
  if (d < 14) {
    return `That is a middling spread, and it is the range where equal-and-uniform protests do most of their work — enough variation that some homes sit well above their neighbours, on a roll consistent enough that the comparison is hard to argue with.`;
  }
  return `That is a wide spread. Similar ${name} County homes in the same neighbourhood carry appraised values that differ substantially from one another, which is the precise circumstance § 41.43(b)(3) was written for, and it makes the median-of-comparables argument unusually strong here.`;
}

// Housing stock. This is the usual driver of dispersion and it lets the page
// explain the number rather than merely report it.
function stockClause(year, name, taxYear) {
  if (!year) return null;
  const age = taxYear - year;
  if (age <= 15) {
    return `Part of the explanation is age: the median ${name} County home was built in ${year}. Recently built subdivisions are largely made up of a handful of repeated floor plans, which a mass-appraisal model values consistently almost by default.`;
  }
  if (age <= 40) {
    return `The median ${name} County home was built in ${year}, so the county holds a mix of established neighbourhoods and newer construction — and a mass-appraisal model tends to handle the two with different accuracy.`;
  }
  return `The median ${name} County home was built in ${year}. Older housing stock is where mass appraisal struggles most: renovations, additions, deferred maintenance and condition differences accumulate over decades, and a model working from square footage and year built cannot see any of them. Two houses on one street can be genuinely unalike while the roll treats them as twins.`;
}

// The cap changes what a protest is even for, and the share varies fourfold
// across the counties we hold.
function capClause(pct, name) {
  if (pct === null || pct === undefined) return null;
  if (pct < 12) {
    return `Only ${pct}% of ${name} County homes are held below market by a cap, so for most owners here a reduction in market value reaches the tax bill directly.`;
  }
  if (pct < 25) {
    return `${pct}% of ${name} County homes are held below market by a cap. For those owners a protest has to push market value past the capped value before the bill moves at all — the first slice of any reduction changes the notice and nothing else.`;
  }
  return `${pct}% of ${name} County homes are held below market by a cap — a high share, and the single most common reason a ${name} County protest wins on paper and saves nothing. Market value has to fall past the capped value before a dollar reaches the bill.`;
}

/**
 * HOW FINELY THE DISTRICT DRAWS ITS NEIGHBOURHOODS.
 *
 * This varies more across counties than anything else on the roll — 15.6 homes
 * per neighbourhood in Jefferson against 208.3 in Wichita, a thirteenfold spread
 * between two counties whose dispersion figures are within 0.6 of each other.
 *
 * It is not trivia. § 41.43(b)(3) comparables are drawn from the district's own
 * neighbourhood code, so this number decides how much material a protest has to
 * work with and how alike that material really is. It is the single most useful
 * thing we can tell a homeowner about how their district was built, and it is the
 * axis that keeps two counties with similar dispersion from reading identically.
 */
function granularityClause(parcels, hoods, name) {
  if (!parcels || !hoods) return null;
  const per = parcels / hoods;
  if (per < 40) {
    return `One more feature of this roll shapes every ${name} County protest: the district divides ${parcels.toLocaleString()} homes into ${hoods.toLocaleString()} separate neighbourhood codes — about ${per.toFixed(0)} homes each. That is unusually fine-grained. It means the properties the district itself considers comparable to yours are genuinely close by and genuinely similar, which makes the comparison persuasive — but it also means there may only be a handful of them, so which ones are selected matters a great deal.`;
  }
  if (per < 130) {
    return `The district divides ${parcels.toLocaleString()} ${name} County homes into ${hoods.toLocaleString()} neighbourhood codes, roughly ${per.toFixed(0)} homes each. That is a middling grain: enough properties in each grouping to build a solid set of comparables, while still tight enough that the comparison holds up.`;
  }
  return `The district divides ${parcels.toLocaleString()} ${name} County homes into just ${hoods.toLocaleString()} neighbourhood codes — around ${per.toFixed(0)} homes each. These are broad groupings, which cuts both ways. There is no shortage of comparables, but a single ${name} County neighbourhood code can span streets that are not much alike, so the properties the district treats as equivalent to yours may not be. Selecting the ones that genuinely match is most of the work.`;
}

export default function CountyRollFacts({ county }) {
  if (!county || county.code !== 'TX') return null;

  const cadId = COUNTY_CODES[county.name];
  const s = cadId ? countyStats.counties?.[String(cadId)] : null;
  if (!s || !s.parcels) return null;

  const stat = (label, value, note) =>
    value === null ? null : (
      <div key={label} style={{ flex: '1 1 190px', minWidth: 170 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.navy, fontFamily: 'Arial,sans-serif', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 13, color: C.text, fontFamily: 'Arial,sans-serif', marginTop: 6, fontWeight: 600 }}>{label}</div>
        {note ? <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Arial,sans-serif', marginTop: 3, lineHeight: 1.45 }}>{note}</div> : null}
      </div>
    );

  const dispersion = dispersionClause(s.valueDispersion, county.name);
  const stock = stockClause(s.medianYearBuilt, county.name, s.taxYear);
  const cap = capClause(s.cappedPct, county.name);
  const grain = granularityClause(s.parcels, s.neighborhoods, county.name);

  return (
    <div style={{ background: C.white, borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}`, padding: '44px 32px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Arial,sans-serif', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          {county.name} County {s.taxYear} Appraisal Roll
        </div>

        <h2 style={{ fontSize: 'clamp(22px,3.4vw,30px)', color: C.navy, margin: '0 0 16px', lineHeight: 1.25 }}>
          What the {county.district} actually did to {county.name} County homes in {s.taxYear}
        </h2>

        <p style={{ fontSize: 16, color: C.text, fontFamily: 'Arial,sans-serif', lineHeight: 1.65, margin: '0 0 26px' }}>
          We hold {county.name} County&apos;s certified {s.taxYear} appraisal roll. Every figure below is
          counted directly from it — {fmt(s.parcels)} single-family homes, the district&apos;s own numbers.
          Nothing here is estimated or averaged in from another county.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 26, marginBottom: 28 }}>
          {stat('Single-family homes on the roll', fmt(s.parcels), `State class ${s.stateClass}, with living area recorded`)}
          {stat('Median market value', money(s.medianMarketValue), 'What the district says the middle home is worth')}
          {stat('Held below market by a cap', `${s.cappedPct}%`, `${fmt(s.cappedParcels)} homes taxed on less than market value`)}
          {s.medianLivingArea ? stat('Median home size', `${fmt(s.medianLivingArea)} sq ft`, s.medianYearBuilt ? `Median year built ${s.medianYearBuilt}` : null) : null}
        </div>

        {/* ── THE CAP, WHICH IS THE THING MOST HOMEOWNERS GET WRONG ────────── */}
        <div style={{ background: '#F8F7F4', borderLeft: `3px solid ${C.gold}`, padding: '18px 22px', margin: '0 0 26px' }}>
          <p style={{ fontSize: 15, color: C.text, fontFamily: 'Arial,sans-serif', lineHeight: 1.65, margin: 0 }}>
            <strong>{cap}</strong> Texas caps how fast a homestead&apos;s taxable value can rise — 10% a year
            under Tax Code § 23.23, and 20% on most non-homestead property under § 23.231. We check where your
            property sits against that cap before you pay us, and we tell you when the answer is that a protest
            would not move your bill.
          </p>
        </div>

        {/* ── UNIFORMITY, CAREFULLY WORDED ─────────────────────────────────── */}
        {dispersion ? (
          <>
            <h3 style={{ fontSize: 19, color: C.navy, margin: '0 0 10px', fontFamily: 'Arial,sans-serif' }}>
              How consistently does {county.name} County value similar homes?
            </h3>
            <p style={{ fontSize: 15, color: C.text, fontFamily: 'Arial,sans-serif', lineHeight: 1.65, margin: '0 0 12px' }}>
              This is the question an equal-and-uniform protest turns on. Texas Tax Code § 41.43(b)(3) does not ask
              whether your home is worth what the district says — it asks whether your home is appraised{' '}
              <em>equally with comparable properties</em>. So what matters is how much the district&apos;s own values
              disagree with each other.
            </p>
            <p style={{ fontSize: 15, color: C.text, fontFamily: 'Arial,sans-serif', lineHeight: 1.65, margin: '0 0 12px' }}>
              Across {fmt(s.dispersionNeighborhoods)} {county.name} County neighbourhoods, the typical home&apos;s
              appraised value per square foot sits{' '}
              <strong style={{ color: C.navy }}>{s.valueDispersion}% away from the median for its own neighbourhood</strong>.
              {' '}{dispersion}
            </p>
            {stock ? (
              <p style={{ fontSize: 15, color: C.text, fontFamily: 'Arial,sans-serif', lineHeight: 1.65, margin: '0 0 12px' }}>
                {stock}
              </p>
            ) : null}
            {grain ? (
              <p style={{ fontSize: 15, color: C.text, fontFamily: 'Arial,sans-serif', lineHeight: 1.65, margin: '0 0 12px' }}>
                {grain}
              </p>
            ) : null}
            <p style={{ fontSize: 13, color: C.muted, fontFamily: 'Arial,sans-serif', lineHeight: 1.6, margin: '0 0 26px' }}>
              Measured over every state-class {s.stateClass} home with recorded living area, in neighbourhoods of at
              least {s.dispersionMinHoodSize} homes, using the appraised values on the district&apos;s certified{' '}
              {s.taxYear} roll. Texas does not disclose sale prices, so this compares the district&apos;s values to
              each other rather than to the market — which is what § 41.43(b)(3) compares too.
            </p>
          </>
        ) : null}

        <p style={{ fontSize: 13, color: C.muted, fontFamily: 'Arial,sans-serif', lineHeight: 1.6, margin: 0, paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
          Source: {county.district} certified {s.taxYear} appraisal roll, obtained under the Texas Public Information
          Act. Counted {s.computedAt}. We publish these because we hold the data — if we did not hold your
          county&apos;s roll, we would not file for you, and this section would not be here.
        </p>

      </div>
    </div>
  );
}
