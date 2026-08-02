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
 * THE BAND IS GONE. COST TO CURE REPLACED IT.
 * ============================================================================
 * The 18–22% clamp was itself the next version of the same problem. It meant the
 * ask barely moved whether the owner reported one defect or fifteen, and it
 * scaled with the house rather than with what was wrong with it. On a $5,000,000
 * home whose only reported defect was a failed air conditioner, the band demanded
 * a reduction of $900,000 to $1,100,000. Cost to cure for that repair is roughly
 * $122,000 at the high end of published regional data.
 *
 * A special magistrate reads $1,000,000 once and dismisses the petition. Under
 * Fla. Stat. § 194.301 the appraiser's value carries a presumption of
 * correctness, so an indefensible ask does not merely fail — it hands the county
 * its argument and taints the grounds that were sound.
 *
 * Condition is now priced at what it costs to fix, from published construction
 * cost data, cited in the petition. See lib/costToCure.js.
 *
 * BAND.floor survives as the FALLBACK ONLY — the ask on a property with no market
 * gap, no priced defects and no record errors. There is no longer a ceiling,
 * because a ceiling would mean discarding evidence we can source. Where the
 * evidence is large relative to the value, the petition says so rather than
 * quietly trimming the number.
 *
 * The design goal is unchanged: ALWAYS a reduction request, ALWAYS a stated
 * reason, never a number pulled from nowhere.
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

// EXTENSION REQUIRED. Next's bundler resolves './costToCure', but the verify
// scripts in package.json's build step run under raw Node ESM, which does not.
// Omitting it fails the Vercel build with ERR_MODULE_NOT_FOUND while working
// perfectly in `next dev` — so this is the form that works in both.
import { totalCostToCure } from './costToCure.js';

/**
 * `floor` is the fallback ask when we have no evidence of any kind — a business
 * decision, and the one place a bare percentage is still honest, because the
 * stated ground is that mass appraisal never looked at this property.
 *
 * `ceiling` is retained only so `clampedDown` keeps reporting when the evidence
 * exceeds what we used to ask for. IT NO LONGER CLAMPS ANYTHING.
 */
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
  parcel = null,
  costOverrides = {},
} = {}) {
  const sc = String(stateCode || '').toUpperCase();
  const g = STATE_GROUNDS[sc] || STATE_GROUNDS.FL;
  const assessed = Number(assessedValue) || 0;

  const grounds = [];

  // STARTS AT ZERO, NOT AT THE FLOOR.
  //
  // Seeding this with BAND.floor made the floor a base that evidence stacked on
  // top of, which is the exact failure this rewrite exists to remove: a $5,000,000
  // home with one failed air conditioner priced its cure at $121,900 and then
  // asked for $1,021,900. The letter would have itemised the repair and then
  // demanded eight times it — contradicting itself in writing, in front of the
  // person deciding.
  //
  // Evidence governs when there is any. The floor applies only when there is none,
  // where its stated ground — mass appraisal never examined this property — is the
  // whole argument rather than a top-up on a different one.
  let pct = 0;

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
  // Owner-reported defects, priced at what it costs to fix them. The owner has
  // personal knowledge of the defects, which is what makes them attestable on a
  // signed filing; the COST comes from published data and is cited, which is what
  // makes the dollar figure defensible when the Board asks where it came from.
  //
  // Incurable conditions — a floodplain lot, proximity to an airport, a room
  // layout — contribute zero dollars and are carried as narrative support for the
  // comparable-sales argument. You cannot spend money to stop being next to an
  // airport, and pricing it would be inventing evidence.
  const cure = totalCostToCure(issues, parcel, costOverrides);
  if (cure.total > 0 && assessed > 0) {
    const cureShare = cure.total / assessed;
    pct += cureShare;
    const lines = cure.priced.map((p) =>
      `${p.issue} — ${p.scope}: $${p.asked.toLocaleString()}${p.ownerSupplied ? ' (owner-supplied estimate)' : ` (${p.source}, ${p.sourceYear})`}`
    );
    grounds.push({
      criterion: g.condition,
      basis:
        `${cure.priced.length} condition ${cure.priced.length === 1 ? 'defect' : 'defects'} reported by the owner, priced at the cost to cure:\n` +
        lines.map((l) => `   • ${l}`).join('\n') +
        `\nTotal cost to cure: $${cure.total.toLocaleString()}. A willing buyer informed of these conditions would discount the purchase price by no less than the cost of remedying them.` +
        (cure.disproportionate
          // Said out loud rather than hidden. A large ask that explains itself
          // gets argued; a large ask that does not gets dismissed on sight.
          ? `\nThe owner acknowledges this represents ${(cure.shareOfValue * 100).toFixed(0)}% of the assessed value, and states that the property requires remediation of this magnitude in its present condition.`
          : ''),
      weight: cureShare,
      items: cure.priced.map((p) => p.issue),
      costToCure: cure,
    });
  }
  if (cure.narrative.length) {
    grounds.push({
      criterion: g.valueStandard,
      basis:
        `The property is additionally affected by ${cure.narrative.length} condition${cure.narrative.length === 1 ? '' : 's'} that cannot be remedied by expenditure and are therefore claimed at no cost to cure:\n` +
        cure.narrative.map((n) => `   • ${n.issue} — ${n.narrative}`).join('\n'),
      // Deliberately zero. It supports the argument; it does not inflate the ask.
      weight: 0,
      items: cure.narrative.map((n) => n.issue),
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
  // Grounds carrying no weight (the incurable-conditions block) support the
  // argument without adding to the ask, so they must not suppress the fallback.
  let usedFallback = false;
  const hasWeightedGround = grounds.some((x) => (x.weight || 0) > 0);
  if (!hasWeightedGround) {
    grounds.push({
      criterion: g.valueStandard,
      basis: `The assessment was produced by mass appraisal, which applies modelled values across many properties without inspecting this one. The owner requests review of the assessment against ${g.valueStandard.split('(')[0].trim()} as applied to this specific property.`,
      weight: BAND.floor,
    });
    pct = BAND.floor;
    usedFallback = true;
  }

  // NO CEILING. Sourced evidence above 22% is asked for in full — clamping it
  // meant throwing away the strongest cases to stay inside a number chosen before
  // we had any data.
  //
  // THE FLOOR STILL APPLIES, AND IT IS AN INDEPENDENT GROUND, NOT A TOP-UP.
  //
  // A property whose priced defects come to less than the floor still gets the
  // floor, because the mass-appraisal ground is true of every property and does
  // not stop being true when the owner also reports a broken air conditioner.
  // Reporting a defect must never shrink the ask below what the same owner would
  // have got by reporting nothing.
  //
  // This is the load-bearing condition: WHEN THE FLOOR GOVERNS, THE LETTER MUST
  // ATTRIBUTE THE DEMAND TO THE MASS-APPRAISAL GROUND, NOT TO THE CURE COST.
  // `askRestsOn` below carries that through to the prompt. Itemising $121,900 of
  // repairs and then demanding $921,900 "because of the defects" is a petition
  // that contradicts itself in front of the person deciding it — which is the
  // failure this whole rewrite exists to prevent. The same number, correctly
  // attributed, is an ordinary alternative-grounds petition.
  const evidencePct = pct;
  const clamped = Math.max(BAND.floor, evidencePct);
  // A tie goes to the floor, and so does the no-evidence case. Reporting
  // 'evidence' when the fallback supplied the number would have the letter credit
  // a ground that contributed nothing.
  const askRestsOn = (!usedFallback && evidencePct > BAND.floor) ? 'evidence' : 'mass_appraisal_floor';

  const reductionPctDisplay = Math.round(clamped * 100);
  const requestedValue = assessed > 0 ? Math.round(assessed * (1 - clamped)) : null;

  return {
    reductionPct: clamped,
    // 'evidence'            -> the demand is the sum of the priced grounds
    // 'mass_appraisal_floor'-> the demand rests on the mass-appraisal ground, and
    //                          the letter must say so rather than crediting it to
    //                          the defects, which support a smaller figure.
    askRestsOn,
    evidencePct,
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
