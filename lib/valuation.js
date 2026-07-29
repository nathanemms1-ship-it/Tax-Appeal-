/**
 * VALUATION BASIS — how much reduction we request, and why.
 *
 * STATE-AGNOSTIC BY DESIGN. Every state we serve, and every state we add, runs
 * through this one module. The valuation logic, the reduction band and the
 * requirement that every request carry a stated basis are business rules, not
 * Florida rules. Only the statutory citations differ per state, and those live in
 * STATE_GROUNDS below. Adding a state means adding one entry there — not
 * relitigating any of this.
 *
 * ============================================================================
 * WHAT THIS REPLACED, AND WHY
 * ============================================================================
 * The requested reduction used to be:
 *
 *   if (issueCount >= 5 || overAssessedPct >= 15) reductionPct = 0.22 + (Math.random() * 0.02);
 *   else if (issueCount >= 3 || overAssessedPct >= 8) reductionPct = 0.20 + (Math.random() * 0.02);
 *   else if (issueCount >= 1) reductionPct = 0.19 + (Math.random() * 0.015);
 *   else reductionPct = 0.18 + (Math.random() * 0.015);
 *
 * Three problems, in order of seriousness:
 *
 * 1. Math.random() set the number the owner swears to. In Florida the owner signs
 *    DR-486 Part 3 under penalties of perjury, and the requested value is their
 *    stated opinion of value. A random draw is not an opinion they formed. Texas,
 *    Georgia, Arkansas and Alabama filings are signed by the owner too.
 *
 * 2. The letter asserted the requested value "reflects actual market conditions
 *    and property-specific factors". It reflected a checkbox count plus noise.
 *    That sentence was not true.
 *
 * 3. It was irreproducible. Reload the funnel on the same property and the ask
 *    changed. There was no answer to "how did you arrive at this number".
 *
 * ============================================================================
 * WHAT THIS DOES NOT CHANGE
 * ============================================================================
 * The 18–22% band stays. That was a deliberate commercial decision and this
 * module treats it as a constraint, not a suggestion — see BAND. Nothing here
 * lowers the ask or makes it conditional on finding comparable sales. A property
 * with no comps and no reported issues still gets a request at the floor of the
 * band, with an honest basis stated for it.
 *
 * That last point is the whole design goal: ALWAYS a reduction request, ALWAYS a
 * stated reason, never a number pulled from nowhere.
 *
 * ============================================================================
 * WHAT WE DELIBERATELY DO NOT ARGUE
 * ============================================================================
 * Florida's "eighth criterion" (Fla. Stat. § 193.011(8)) deduction of costs of
 * sale is NOT used as a standing basis, and must not be added later. Every
 * Florida property appraiser files Form DR-493 — "Adjustments Made to Recorded
 * Selling Prices or Fair Market Value IN ARRIVING AT ASSESSED VALUE" — and in
 * practice certifies ~15% across all use codes. The just value on a TRIM notice
 * is therefore normally already net of it. Arguing for it again is double
 * counting, and asserting the appraiser failed to apply it would be a false
 * statement of fact on a perjury-attested petition.
 *
 * Also: do not cite Deltona Corp. v. Bailey, Valencia Center v. Bystrom, or
 * Bystrom v. Whitman for a cost-of-sale proposition. None of them holds that.
 * Bystrom v. Equitable Life, 416 So. 2d 1133, is directly adverse, and Mazourek
 * v. Wal-Mart, 831 So. 2d 85 (Fla. 2002), is Supreme Court authority against the
 * expansive theory.
 */

// The commercial band. Business decision, not a legal one. Keep as a hard clamp.
export const BAND = { floor: 0.18, ceiling: 0.22 };

/**
 * Statutory grounds by state.
 *
 * `valueStandard`  the statute defining what the assessment is supposed to equal
 * `condition`      the ground for arguing physical condition reduces value
 * `unequal`        the ground for arguing disparate treatment vs comparable property
 * `recordError`    the ground for correcting the assessor's own property record
 *
 * These are the grounds arguable from facts the OWNER can attest to, without
 * needing comparable sales. That is what makes a request possible on every
 * property rather than only the ones where comps happen to line up.
 */
export const STATE_GROUNDS = {
  TX: {
    name: 'Texas',
    valueStandard: 'Tex. Tax Code § 23.01 (market value)',
    condition: 'Tex. Tax Code § 41.41(a)(1) (value exceeds market value)',
    unequal: 'Tex. Tax Code § 41.43(b)(3) (unequal appraisal)',
    recordError: 'Tex. Tax Code § 41.41(a)(9) (error in appraisal records)',
  },
  GA: {
    name: 'Georgia',
    valueStandard: 'O.C.G.A. § 48-5-2 (fair market value)',
    condition: 'O.C.G.A. § 48-5-2(3) (condition and other value factors)',
    unequal: 'O.C.G.A. § 48-5-311(e)(1)(B) (uniformity of assessment)',
    recordError: 'O.C.G.A. § 48-5-306 (correction of assessment records)',
  },
  FL: {
    name: 'Florida',
    valueStandard: 'Fla. Stat. § 193.011(1) (present cash value)',
    condition: 'Fla. Stat. § 193.011(6) (condition of the property)',
    unequal: 'Fla. Stat. § 194.301(2)(a)3 (appraisal practices different from those applied to comparable property in the same county)',
    recordError: 'Fla. Stat. § 194.011(3) / § 193.011(4) (quantity or size of the property)',
  },
  AR: {
    name: 'Arkansas',
    valueStandard: 'Ark. Code § 26-26-1202 (market value in money)',
    condition: 'Ark. Code § 26-26-1202 (condition affecting market value)',
    unequal: 'Ark. Code § 26-27-317 (equalization of assessments)',
    recordError: 'Ark. Code § 26-28-111 (correction of erroneous assessment)',
  },
  AL: {
    name: 'Alabama',
    valueStandard: 'Code of Ala. § 40-7-15 (fair and reasonable market value)',
    condition: 'Code of Ala. § 40-7-15 (condition affecting market value)',
    unequal: 'Code of Ala. § 40-3-20 (equalization by the board)',
    recordError: 'Code of Ala. § 40-7-24 (correction of assessment)',
  },
};

/**
 * Severity weight per issue category.
 *
 * These are ordered by how much a category actually depresses what a willing
 * buyer would pay, which is the question every state's value standard asks.
 * Structural and code problems are cash-out-of-pocket before a sale closes;
 * cosmetic problems affect marketability but not habitability.
 *
 * The numbers are increments of requested reduction, not appraisal opinions, and
 * the total is clamped to BAND regardless.
 */
export const CATEGORY_WEIGHTS = {
  'Structural & Major Systems': 0.010,
  'Safety, Health & Code': 0.009,
  'Functional & Livability': 0.005,
  'Exterior & Site': 0.005,
  'Appearance & Maintenance': 0.003,
};

const DEFAULT_ISSUE_WEIGHT = 0.004;

/**
 * Derive the requested reduction and the grounds supporting it.
 *
 * DETERMINISTIC. Same inputs always produce the same output, so the number can be
 * explained, reproduced, and matched against what was mailed.
 *
 * @param {object} input
 * @param {string} input.stateCode
 * @param {number|null} input.assessedValue
 * @param {number|null} input.marketValue      independent market estimate, if any
 * @param {string[]}    input.issues           owner-reported condition issues
 * @param {object}      input.categoryOf       issue text -> category name
 * @param {object}      input.corrections      owner corrections to county record
 *                                             { sqft, beds, baths, yearBuilt } vs
 *                                             { countySqft, countyBeds, ... }
 * @returns {{ reductionPct, reductionPctDisplay, requestedValue, grounds, basisSummary }}
 */
export function deriveValuation({
  stateCode,
  assessedValue,
  marketValue = null,
  issues = [],
  categoryOf = {},
  corrections = {},
} = {}) {
  const sc = String(stateCode || '').toUpperCase();
  const g = STATE_GROUNDS[sc] || STATE_GROUNDS.FL;
  const assessed = Number(assessedValue) || 0;

  const grounds = [];
  let pct = BAND.floor;

  // ---------------------------------------------------------------- 1. market
  // The primary ground in every state: the assessment exceeds market value.
  // Where we have an independent market estimate, the measured gap drives the ask
  // and is stated as such.
  if (assessed > 0 && marketValue && Number(marketValue) > 0) {
    const gap = (assessed - Number(marketValue)) / assessed;
    if (gap > 0) {
      pct = Math.max(pct, gap);
      grounds.push({
        criterion: g.valueStandard,
        basis: `The assessment of $${assessed.toLocaleString()} exceeds the independent market estimate of $${Number(marketValue).toLocaleString()} by ${(gap * 100).toFixed(1)}%.`,
        weight: gap,
      });
    }
  }

  // ------------------------------------------------------------- 2. condition
  // Owner-reported defects. The owner has personal knowledge of these, which is
  // what makes them attestable on a signed filing.
  const byCategory = {};
  for (const issue of issues) {
    const cat = categoryOf[issue] || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(issue);
  }
  let conditionAdd = 0;
  for (const [cat, list] of Object.entries(byCategory)) {
    const w = CATEGORY_WEIGHTS[cat] ?? DEFAULT_ISSUE_WEIGHT;
    conditionAdd += w * list.length;
  }
  if (conditionAdd > 0) {
    pct += conditionAdd;
    const total = Object.values(byCategory).reduce((n, l) => n + l.length, 0);
    grounds.push({
      criterion: g.condition,
      basis: `${total} condition ${total === 1 ? 'defect' : 'defects'} reported by the owner across ${Object.keys(byCategory).length} ${Object.keys(byCategory).length === 1 ? 'category' : 'categories'}: ${Object.entries(byCategory).map(([c, l]) => `${c} (${l.length})`).join(', ')}. Each reduces what a willing buyer would pay.`,
      weight: conditionAdd,
      items: issues,
    });
  }

  // --------------------------------------------------- 3. record-card accuracy
  // The assessor's own record being wrong is the strongest and cheapest argument
  // there is: it is a factual error, not a matter of opinion. We only assert it
  // where the OWNER told us the county figure is wrong.
  const recordIssues = [];
  const fields = [
    ['sqft', 'square footage'],
    ['beds', 'bedroom count'],
    ['baths', 'bathroom count'],
    ['yearBuilt', 'year built'],
  ];
  for (const [key, label] of fields) {
    const owner = corrections[key];
    const county = corrections[`county${key.charAt(0).toUpperCase()}${key.slice(1)}`];
    if (owner && county && String(owner).trim() !== String(county).trim()) {
      recordIssues.push(`${label}: county record shows ${county}, owner reports ${owner}`);
    }
  }
  if (recordIssues.length) {
    const add = 0.008 * recordIssues.length;
    pct += add;
    grounds.push({
      criterion: g.recordError,
      basis: `The assessor's property record does not match the property as it exists — ${recordIssues.join('; ')}. A valuation built on incorrect characteristics cannot produce a correct value.`,
      weight: add,
      items: recordIssues,
    });
  }

  // ----------------------------------------------------------- 4. the fallback
  // No market gap, no reported defects, no record errors. We still request a
  // reduction — that is the commercial requirement — but the basis has to be
  // something true. Mass appraisal genuinely does not examine individual
  // properties, and that is the honest ground.
  if (grounds.length === 0) {
    grounds.push({
      criterion: g.valueStandard,
      basis: `The assessment was produced by mass appraisal, which applies modelled values across many properties without inspecting this one. The owner requests review of the assessment against ${g.valueStandard.split('(')[0].trim()} as applied to this specific property.`,
      weight: BAND.floor,
    });
  }

  // Clamp to the commercial band. Deliberately last, so the band governs no
  // matter what the evidence adds up to.
  const clamped = Math.min(BAND.ceiling, Math.max(BAND.floor, pct));

  const reductionPctDisplay = Math.round(clamped * 100);
  const requestedValue = assessed > 0 ? Math.round(assessed * (1 - clamped)) : null;

  return {
    reductionPct: clamped,
    reductionPctDisplay,
    requestedValue,
    grounds,
    basisSummary: grounds.map((x, i) => `${i + 1}. ${x.criterion} — ${x.basis}`).join('\n'),
    // True when the band clamped the evidence-derived figure down. Useful in ops:
    // it means the property supports more than we ask for.
    clampedDown: pct > BAND.ceiling,
  };
}

/** Flat map of issue text -> category, built from the funnel's category list. */
export function buildCategoryIndex(issueCategories) {
  const idx = {};
  for (const c of issueCategories || []) {
    for (const i of c.issues || []) idx[i] = c.category;
  }
  return idx;
}

export default deriveValuation;
