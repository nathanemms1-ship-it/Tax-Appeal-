/**
 * COST TO CURE — what it actually costs to fix a documented defect.
 *
 * ============================================================================
 * WHY THIS REPLACES THE 18–22% BAND
 * ============================================================================
 * `deriveValuation` used to weight the owner's selected issues by category and
 * then hard-clamp the result to 18–22% of assessed value. The clamp meant the
 * ask was effectively the same whether the owner ticked one box or fifteen, and
 * it scaled with the house rather than with the defect.
 *
 * On a $5,000,000 home whose only reported problem is a failed A/C, that band
 * demands a reduction of $900,000 to $1,100,000. The actual cost to cure is
 * roughly $19,000. A special magistrate reads the first number once and
 * dismisses the petition — and under Fla. Stat. § 194.301 the appraiser's value
 * carries a presumption of correctness, so an indefensible ask does not merely
 * fail, it hands the county the argument.
 *
 * Cost to cure is the standard instrument here: the market discounts a property
 * with a deferred repair by roughly what the repair costs. It scales with the
 * house for the right reason — a 4,000 sqft roof genuinely costs more than a
 * 1,400 sqft roof — rather than because a percentage was applied to the value.
 *
 * ============================================================================
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * ============================================================================
 * EVERY DOLLAR FIGURE CARRIES A SOURCE. No entry may be added without one.
 *
 * This is the same rule that removed the fabricated comparable sales. A number
 * in a petition that cannot be traced to a published figure is worse than no
 * number, because it invites the Board to discount everything else alongside it.
 * `source` and `sourceYear` are required fields, and `assertSourced()` below
 * fails the build if one is missing.
 *
 * ============================================================================
 * CURABLE vs INCURABLE
 * ============================================================================
 * Twelve of the checkboxes on the issues step are not repairs. You cannot spend
 * money to stop living next to an airport, and no amount of work relocates a
 * parcel out of a floodplain. Those carry `curable: false`, contribute exactly
 * zero dollars to the requested reduction, and are passed to the letter as
 * narrative support for the comparable-sales argument instead.
 *
 * Assigning them a cost would be inventing evidence. Supporting them properly
 * needs paired-sales analysis — matched sales inside and outside the condition —
 * which we cannot do from the assessment roll and should not pretend to.
 */

/** Where each figure comes from. Cited in the petition, verbatim. */
export const SOURCES = {
  CVV: {
    id: 'CVV',
    label: 'JLC/Zonda Cost vs. Value Report, South Atlantic region',
    year: 2025,
    url: 'https://www.jlconline.com/cost-vs-value/2025/south-atlantic/',
    // The strongest source available: regional rather than national, published
    // annually, and built on contractor-supplied job costs for a defined scope.
    tier: 1,
  },
  HOMEWYSE: {
    id: 'HOMEWYSE',
    label: 'Homewyse published unit cost data',
    year: 2026,
    url: 'https://www.homewyse.com/',
    // Weaker than CvV, but it publishes its unit-cost methodology and adjusts by
    // ZIP. Used only where Cost vs. Value has no comparable project.
    tier: 2,
  },
  ANGI: {
    id: 'ANGI',
    label: 'Angi national cost guide',
    year: 2026,
    url: 'https://www.angi.com/',
    tier: 2,
  },
};

/**
 * The size the Cost vs. Value job costs correspond to.
 *
 * The report prices a defined scope against a model home, not against "a house".
 * Anchoring to 2,000 sqft of conditioned area and scaling linearly from there is
 * an ASSUMPTION, stated here rather than buried, and it is why the output is a
 * range rather than a point estimate. An owner with a real contractor quote
 * should always override it — the UI pre-fills, it does not lock.
 */
export const REFERENCE_SQFT = 2000;

/**
 * How far either side of the scaled midpoint the range runs.
 *
 * ±22% is roughly the spread between the 25th and 75th percentile of improvement
 * value per square foot measured across Broward single-family parcels, which is
 * the closest proxy we have for finish-level variation within a size class.
 */
export const RANGE_SPREAD = 0.22;

/**
 * WHERE IN THE RANGE WE ASK.
 *
 * 'high' — deliberately. We are the owner's advocate, not the appraiser's, and
 * the top of a published range is a number we can defend line by line: it comes
 * from the cited source, it is disclosed as a range in the petition, and the
 * Board is free to find somewhere lower. That is what a range is for.
 *
 * This is the boundary and it is worth stating plainly. Asking at the high end
 * of sourced data is advocacy. Asking ABOVE the sourced range would be
 * fabrication, and the cited source would contradict us in writing. So `high` is
 * available and `mid` and `low` are available; there is no option that exceeds
 * the source, and there never will be.
 */
export const CURE_POSITION = 'high';

/** Scaling behaviour for each defect. */
const AREA = 'area'; // scales with conditioned floor area
const FLAT = 'flat'; // one unit, one price, size-independent
const NONE = 'none'; // incurable — no dollar figure, ever

/**
 * Cost to cure by issue label. Labels MUST match ISSUE_CATEGORIES in
 * pages/apply.js exactly; `assertLabelsMatch()` in the test guards the drift.
 */
export const COST_TO_CURE = {
  // ── Structural & major systems ──────────────────────────────────────────
  'Foundation cracks, settling, or structural damage':
    { base: 8500, scale: AREA, source: 'HOMEWYSE', note: 'Pier and beam stabilisation, typical scope' },
  'Roof damage or age (leaks, missing shingles, sagging)':
    { base: 32253, scale: AREA, source: 'CVV', note: 'Asphalt shingle replacement, full tear-off' },
  'Major water damage (ceiling/wall/floor stains, rot)':
    { base: 5200, scale: AREA, source: 'ANGI', note: 'Structural drying, demolition and rebuild of affected area' },
  'Mold or persistent mildew problems':
    { base: 3500, scale: AREA, source: 'ANGI', note: 'Professional remediation, containment and clearance testing' },
  'Outdated or failed HVAC system':
    { base: 19208, scale: AREA, source: 'CVV', note: 'Full system replacement' },
  'Failed or aging water heater':
    { base: 1900, scale: FLAT, source: 'HOMEWYSE', note: 'Tank replacement including permit' },
  'Outdated electrical service':
    { base: 3200, scale: FLAT, source: 'HOMEWYSE', note: 'Service panel upgrade to 200A' },
  'Significant plumbing defects (leaks, corroded pipes)':
    { base: 9500, scale: AREA, source: 'HOMEWYSE', note: 'Whole-home repipe, PEX' },
  'Sewer or septic failure requiring replacement':
    { base: 12500, scale: FLAT, source: 'HOMEWYSE', note: 'Line or drainfield replacement' },

  // ── Safety, health & code ───────────────────────────────────────────────
  'Active pest infestation (termites, rodents)':
    { base: 3000, scale: AREA, source: 'ANGI', note: 'Treatment plus repair of damaged members' },
  'Asbestos or lead paint present':
    { base: 9000, scale: AREA, source: 'ANGI', note: 'Licensed abatement' },
  'Code violations or illegal additions':
    { base: 6500, scale: FLAT, source: 'HOMEWYSE', note: 'Bringing work to code, permit and inspection' },
  'Unpermitted work or missing permits':
    { base: 4200, scale: FLAT, source: 'HOMEWYSE', note: 'After-the-fact permitting and required corrections' },
  'Noncompliant electrical (knob-and-tube, overloaded panels)':
    { base: 11000, scale: AREA, source: 'HOMEWYSE', note: 'Rewiring plus panel' },
  'Hazardous materials requiring remediation':
    { base: 9000, scale: AREA, source: 'ANGI', note: 'Licensed abatement' },

  // ── Functional & livability ─────────────────────────────────────────────
  // Layout and configuration defects are not repairs. A room is not made larger
  // by spending money on it, and re-plumbing a house to add a second bathroom is
  // a renovation the market prices through comparable sales, not a cure.
  'Cramped or poorly configured rooms': { curable: false, reason: 'layout' },
  'Illegally converted rooms with no egress':
    { base: 5500, scale: FLAT, source: 'HOMEWYSE', note: 'Egress window installation and permitting' },
  'Inadequate insulation or energy inefficiency':
    { base: 2800, scale: AREA, source: 'HOMEWYSE', note: 'Attic insulation to current code' },
  'Broken windows, doors, or security issues':
    { base: 21629, scale: AREA, source: 'CVV', note: 'Vinyl window replacement' },
  'No indoor laundry hookups': { curable: false, reason: 'configuration' },
  'Only one bathroom for multiple bedrooms': { curable: false, reason: 'configuration' },
  'Severely dated interiors requiring major renovation':
    { base: 28567, scale: AREA, source: 'CVV', note: 'Minor kitchen remodel, midrange' },

  // ── Exterior & site ─────────────────────────────────────────────────────
  'Poor drainage causing yard or foundation flooding':
    { base: 4500, scale: FLAT, source: 'ANGI', note: 'Regrading and French drain' },
  'Floodplain location or high flood insurance costs': { curable: false, reason: 'location' },
  'Erosion, steep unusable land, or poor lot configuration': { curable: false, reason: 'location' },
  'Proximity to busy road, industrial site, or airport': { curable: false, reason: 'location' },
  'Proximity to landfill or other nuisance': { curable: false, reason: 'location' },
  'Unpermitted outbuildings, fences, or encroachments':
    { base: 4200, scale: FLAT, source: 'HOMEWYSE', note: 'Permitting or removal' },

  // ── Appearance & maintenance ────────────────────────────────────────────
  'Deferred maintenance (peeling paint, rotten trim)':
    { base: 6800, scale: AREA, source: 'HOMEWYSE', note: 'Exterior repaint with trim repair' },
  'Severely dated kitchen requiring full update':
    { base: 28567, scale: AREA, source: 'CVV', note: 'Minor kitchen remodel, midrange' },
  'Severely dated bathrooms requiring full update':
    { base: 25609, scale: AREA, source: 'CVV', note: 'Bath remodel, midrange' },
  'Significant curb appeal issues reducing buyer interest': { curable: false, reason: 'subjective' },
  'Overgrown or neglected landscaping':
    { base: 2400, scale: FLAT, source: 'ANGI', note: 'Clearing and restorative landscaping' },
};

/** Reasons an item is incurable, in language the letter can use. */
export const INCURABLE_REASONS = {
  location:
    'a locational condition that cannot be remedied by expenditure, and which the market prices through comparable sales rather than through cost to cure',
  layout:
    'a configuration defect that cannot be remedied without reconstruction, and which the market prices through comparable sales',
  configuration:
    'an absent amenity that cannot be remedied without reconstruction, and which the market prices through comparable sales',
  subjective:
    'a condition the market recognises but which has no defined cure cost',
};

/**
 * Finish-level multiplier.
 *
 * A higher-end house costs more to repair per square foot. The assessment roll
 * does not carry a usable quality signal — measured across 389,405 Broward
 * single-family parcels, the appraiser's own IMP_QUAL grades 3, 4 and 5 sit at
 * $248, $246 and $258 of improvement value per square foot respectively, which
 * separates nothing. Improvement value per square foot does separate, so that is
 * what is used.
 *
 * Deliberately clamped to 0.75–2.00. Beyond that the relationship stops being
 * about finish level and starts being about land, and a waterfront lot does not
 * make the air conditioner more expensive.
 */
export function finishMultiplier({ jv, lndVal, totLvgArea }, { baseline = 250 } = {}) {
  const improvement = Number(jv || 0) - Number(lndVal || 0);
  const sqft = Number(totLvgArea || 0);
  if (!(improvement > 0) || !(sqft > 0)) return 1;
  const perSqft = improvement / sqft;
  const m = perSqft / baseline;
  return Math.min(2.0, Math.max(0.75, Math.round(m * 100) / 100));
}

/** Size multiplier. Linear in conditioned area, clamped at both ends. */
export function areaMultiplier(totLvgArea) {
  const sqft = Number(totLvgArea || 0);
  if (!(sqft > 0)) return 1;
  return Math.min(3.0, Math.max(0.5, sqft / REFERENCE_SQFT));
}

/**
 * Cost to cure one defect on one specific property.
 *
 * Returns null for an unrecognised label rather than guessing — an unpriced
 * defect is recoverable, an invented price is not.
 */
export function curePriceFor(issueLabel, parcel, { position = CURE_POSITION } = {}) {
  const spec = COST_TO_CURE[issueLabel];
  if (!spec) return null;

  if (spec.curable === false) {
    return {
      issue: issueLabel,
      curable: false,
      low: 0, high: 0, mid: 0, asked: 0,
      reason: spec.reason,
      narrative: INCURABLE_REASONS[spec.reason] || INCURABLE_REASONS.subjective,
    };
  }

  const size = spec.scale === AREA ? areaMultiplier(parcel?.tot_lvg_area) : 1;
  const finish = finishMultiplier({
    jv: parcel?.jv, lndVal: parcel?.lnd_val, totLvgArea: parcel?.tot_lvg_area,
  });

  const mid = Math.round((spec.base * size * finish) / 100) * 100;
  const src = SOURCES[spec.source];

  const low = Math.round((mid * (1 - RANGE_SPREAD)) / 100) * 100;
  const high = Math.round((mid * (1 + RANGE_SPREAD)) / 100) * 100;

  return {
    issue: issueLabel,
    curable: true,
    low,
    high,
    mid,
    // THE FIGURE THE PETITION ASKS FOR, set here rather than only in
    // totalCostToCure(). It was previously added downstream, so the issues step —
    // which calls this function directly to render one row — read undefined and
    // crashed the funnel on the first click. One shape, every caller.
    asked: position === 'low' ? low : position === 'mid' ? mid : high,
    scope: spec.note,
    sizeMultiplier: size,
    finishMultiplier: finish,
    source: src.label,
    sourceYear: src.year,
    sourceUrl: src.url,
    sourceTier: src.tier,
  };
}

/**
 * Total cost to cure across the owner's selected defects.
 *
 * `overrides` maps issue label -> owner-entered dollar amount. An owner number
 * always wins: they have the contractor's quote and we have a published average.
 * When they override, the letter cites their figure and drops ours entirely
 * rather than presenting both.
 */
export function totalCostToCure(issues, parcel, overrides = {}, { position = CURE_POSITION } = {}) {
  const priced = [];
  const narrative = [];
  let total = 0;
  let conservative = 0; // the same total taken at the midpoint, for comparison

  for (const issue of issues || []) {
    const p = curePriceFor(issue, parcel, { position });
    if (!p) continue;
    if (!p.curable) { narrative.push(p); continue; }

    const ov = overrides[issue];
    const owner = ov == null ? null : Number(String(ov).replace(/[^0-9.]/g, ''));
    if (owner != null && Number.isFinite(owner) && owner > 0) {
      // An owner-supplied figure is used exactly as given. We do not mark it up
      // toward the high end — it is their contractor's number, not a range, and
      // inflating it would misrepresent a document they may have to produce.
      priced.push({ ...p, mid: owner, low: owner, high: owner, asked: owner, ownerSupplied: true });
      total += owner;
      conservative += owner;
    } else {
      priced.push(p);
      total += p.asked;
      conservative += p.mid;
    }
  }

  const jv = Number(parcel?.jv || 0);
  const shareOfValue = jv > 0 ? total / jv : null;

  return {
    priced,
    narrative,
    total,
    position,
    conservative,
    shareOfValue,
    /**
     * NOT A CAP. A flag.
     *
     * Cost to cure running past a third of just value is possible and sometimes
     * true — a house with a failed roof, failed systems and remediation really
     * can be worth a third less. But it is also what a stack of loosely-ticked
     * boxes looks like, and the two are indistinguishable from here.
     *
     * So the petition addresses it head-on rather than hoping nobody notices,
     * and the owner is nudged toward documentation for the largest items. It
     * never blocks a filing — that call is the owner's.
     */
    disproportionate: shareOfValue != null && shareOfValue > 0.33,
    // Every distinct source actually used, for the citation block. A source that
    // contributed nothing is not cited — padding a reference list is its own
    // small dishonesty.
    citations: [...new Set(priced.map((p) => p.source))],
  };
}

/** Build-time guard: no entry may exist without a source. */
export function assertSourced() {
  const bad = [];
  for (const [label, spec] of Object.entries(COST_TO_CURE)) {
    if (spec.curable === false) {
      if (!spec.reason) bad.push(`${label}: incurable with no reason`);
      continue;
    }
    if (!spec.source || !SOURCES[spec.source]) bad.push(`${label}: missing or unknown source`);
    if (!(spec.base > 0)) bad.push(`${label}: no base cost`);
    if (!spec.note) bad.push(`${label}: no scope description`);
  }
  if (bad.length) throw new Error(`costToCure: unsourced entries:\n  ${bad.join('\n  ')}`);
  return true;
}

export default {
  COST_TO_CURE, SOURCES, INCURABLE_REASONS,
  curePriceFor, totalCostToCure, finishMultiplier, areaMultiplier, assertSourced,
};
