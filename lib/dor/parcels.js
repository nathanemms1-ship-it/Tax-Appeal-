/**
 * PARCEL LOOKUP against our own copy of the Florida assessment roll.
 *
 * ============================================================================
 * WHAT THIS REPLACES, AND WHY
 * ============================================================================
 * Every property figure the funnel uses comes from here now, not from RentCast.
 * Testing against a real Hillsborough parcel showed RentCast returns the Save
 * Our Homes CAPPED ASSESSED value, one roll year stale, with no way to tell
 * which figure you were given:
 *
 *              County roll        RentCast
 *   Just       $608,998           —
 *   Assessed   $459,927           $447,835   (2025, not 2026)
 *   Taxable    $408,516           —
 *
 * A DR-486 disputes JUST value. RentCast was $161,163 — 26% — below it, and
 * could not distinguish just value from assessed value at all. That is not a
 * vendor bug; a national aggregator normalises every state into one number and
 * Florida needs three.
 *
 * The roll has all three as separate, current, documented columns. It is also
 * the Property Appraiser's own submission to the Department of Revenue, so a
 * special magistrate cannot dispute where the numbers came from.
 *
 * ============================================================================
 * COST
 * ============================================================================
 * These are indexed queries against our own Postgres. A lookup costs a few
 * milliseconds and no money, against ~$0.22 for the three metered API calls the
 * old path needed. That is what makes a free public "can an appeal save you
 * anything?" check viable, and the answer is no for a large minority of the
 * state, so the old architecture had us paying a vendor to discover that, every
 * time, for people who could never become customers.
 *
 * MEASURED 7 Aug 2026 against the full 2026 roll — all 8,409,573 residential
 * parcels, gap between just value and the capped assessed value:
 *
 *   already uncapped   4,168,328   49.57%   saves from the first dollar
 *   gap under 15%        533,886    6.35%   comparable sales clear it
 *   gap 15-25%           496,668    5.90%
 *   gap 25-35%           688,497    8.19%   needs a documented cost to cure
 *   gap over 35%       2,522,194   29.99%   nothing realistic clears it
 *
 * Do not quote a single "X% cannot benefit" figure without saying which cut it
 * assumes — the answer moves ten points between a comps-only and a cure-inclusive
 * definition, and that ambiguity is what produced three conflicting numbers in
 * this codebase (42%, 58.4%, 46%) that all traced back to the same data.
 */

import { getSupabaseAdmin } from '../../pages/api/supabase';
import { qualify } from './qualify';
import { millageForCounty } from './millage';
import { totalCostToCure } from '../costToCure';
import { getFlVabFee } from '../flCountyFees';
import { LOADED_COUNTIES } from './coverage';

/**
 * Address matching lives in lib/dor/addressMatch.js — pure functions, no
 * database, so scripts/verify-dor.mjs can execute them instead of grepping for
 * them. See the header there.
 */
import {
  normalizeAddr, normSpace, anchoredPattern, rowMatches, addressVariants, orIlike,
  stripTrailingLocality,
} from './addressMatch.js';

// Re-exported because it was part of this module's surface before the split.
export { addressVariants } from './addressMatch.js';

/**
 * The roll year to query.
 *
 * NOT "the newest row we happen to hold". Rolls are separate legal snapshots and
 * a petition must cite the year it disputes — quoting a 2026 just value on a
 * 2025 petition would misstate the thing being appealed. Pinned by env so a new
 * roll load cannot silently re-date evidence under petitions already filed.
 */
const DEFAULT_ROLL_YEAR = 2026;

/**
 * VALIDATED, not just coerced.
 *
 * `Number(process.env.DOR_ROLL_YEAR || 2026)` was wrong in a way that took a
 * production log to find: a non-numeric value in the env var produces NaN, which
 * goes straight into the query and comes back as
 *
 *     invalid input syntax for type smallint: "NaN"
 *
 * The route catches that error and returns `no_parcel`, so a typo in a Vercel
 * field presented to the customer as "we have no record of your property" —
 * indistinguishable from a genuine miss, for every address in Florida.
 *
 * A config value that reaches SQL has to be validated at the boundary. An
 * unusable one falls back to the default and says so in the log rather than
 * poisoning every query downstream.
 */
function resolveRollYear() {
  const raw = process.env.DOR_ROLL_YEAR;
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_ROLL_YEAR;

  const y = Number(String(raw).trim());
  if (Number.isInteger(y) && y >= 2000 && y <= 2100) return y;

  console.error(
    `[parcels] DOR_ROLL_YEAR is "${raw}", which is not a valid roll year. ` +
    `Falling back to ${DEFAULT_ROLL_YEAR}. Fix this in Vercel — a wrong roll year ` +
    `means citing the wrong year's values on a sworn petition.`
  );
  return DEFAULT_ROLL_YEAR;
}

export const ROLL_YEAR = resolveRollYear();

/**
 * Suggest addresses for a partial string.
 *
 * Runs against the trigram index on (phy_addr1 || phy_city), so it matches
 * mid-string — "marbella" finds "8023 MARBELLA CREEK AVE" — rather than
 * prefix-only.
 *
 * THE POINT OF DOING THIS OURSELVES: every suggestion is a parcel we hold, so
 * picking one can never lead to "we found your address but not your property".
 * Google Places will happily suggest an address that no data provider has a
 * record for, and that customer then falls into manual entry through no fault of
 * their own. Here the autocomplete source and the property-data source are the
 * same table, so that failure cannot occur.
 */
export async function suggestAddresses(query, { limit = 8, zip = null } = {}) {
  const q = normalizeAddr(query);
  if (q.length < 4) return [];

  const db = getSupabaseAdmin();
  if (!db) return [];

  /**
   * ZIP NARROWS. IT MUST NEVER EXCLUDE. See the long note in findParcel below —
   * the same reasoning applies here, and it applies FIRST, because a suggestion
   * list that comes back empty is the point at which the customer gives up.
   */
  const run = (withZip) => {
    let sel = db
      .from('parcels')
      .select('co_no, parcel_id, phy_addr1, phy_city, phy_zipcd, jv, dor_uc')
      .eq('asmnt_yr', ROLL_YEAR)
      .or(orIlike('phy_addr1', addressVariants(q).map((v) => `%${v}%`)))
      .limit(limit);
    if (withZip && zip) sel = sel.eq('phy_zipcd', String(zip).trim().slice(0, 5));
    return sel;
  };

  let { data, error } = await run(true);
  if (!error && zip && (!data || !data.length)) {
    // The ZIP found nothing. It was a hint, so drop it rather than the customer.
    ({ data, error } = await run(false));
  }
  if (error) {
    console.error('[parcels] suggest failed:', error.message);
    return [];
  }

  return (data || []).map((r) => ({
    parcelId: r.parcel_id,
    coNo: r.co_no,
    street: r.phy_addr1,
    city: r.phy_city,
    zip: r.phy_zipcd,
    full: [r.phy_addr1, r.phy_city, 'FL', r.phy_zipcd].filter(Boolean).join(', '),
  }));
}

/**
 * Find one parcel by address.
 *
 * Returns null when we hold no record — which the caller must treat as "ask the
 * customer", never as a reason to estimate. A missing parcel is usually new
 * construction or a recent split that the roll has not caught up with, and both
 * are legitimate reasons for a human to type their own figures.
 */
export async function findParcel({ street, zip, city = null }) {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const addr = normalizeAddr(street);
  if (!addr) return null;

  /**
   * ============================================================================
   * ZIP NARROWS. IT MUST NEVER EXCLUDE.
   * ============================================================================
   * `.eq('phy_zipcd', zip)` was a HARD FILTER, and it silently turned real
   * properties into "we have no record of you".
   *
   * Measured on a live Broward parcel, 20 Aug 2026. Same street text both times:
   *
   *   zip 33060 (USPS, Google, and the envelope the TRIM notice arrived in)
   *     -> zero rows -> /check says "We do not have a record for this address on
   *        the current tax roll."
   *   zip 33064 (what the county actually wrote in PHY_ZIPCD)
   *     -> found. Parcel 494201201290, capped assessed value $656,240, full verdict.
   *
   * The homeowner is not wrong. County rolls record the ZIP at assessment time,
   * USPS redraws boundaries, and Pompano Beach 33060/33064 is one of many places
   * they disagree. A filter that assumes they agree is a filter that rejects the
   * customer for the county's bookkeeping.
   *
   * WHY THIS WAS THE EXPENSIVE KIND OF BUG. The refusal copy on /check reads "a
   * miss here usually means new construction or a recently split parcel that isn't
   * on this year's roll yet" — confident, plausible, and in this case false. The
   * property was on the roll the whole time. Nothing errored, nothing was logged,
   * and the customer left believing we had checked.
   *
   * The retry costs one extra query, and ONLY on the path that was previously
   * about to return nothing. When the ZIP matches — the common case — behaviour is
   * byte-for-byte what it was.
   */
  /**
   * ============================================================================
   * THE PATTERN IS LOOSE AND THE DECISION IS MADE IN JAVASCRIPT. BOTH HALVES
   * MATTER — EITHER ONE ALONE IS A BUG.
   * ============================================================================
   * Until 23 Aug 2026 this passed addressVariants(addr) with no wildcards at
   * all. ILIKE with no wildcard is case-insensitive EQUALITY, so the customer's
   * typed street had to reproduce PHY_ADDR1 character for character. Measured
   * against the loaded roll on that date, up to 596,560 of 8,410,126 parcels
   * could not satisfy that comparison however correctly the address was typed —
   * 326,092 carrying unit text in PHY_ADDR1 and 270,468 with irregular internal
   * whitespace.
   *
   * WHAT MADE IT INVISIBLE: suggestAddresses above wraps its patterns in
   * `%...%`, so the DROPDOWN found those properties. Picking a suggestion writes
   * the roll's own PHY_ADDR1 back into the form, and then the equality held. So
   * the same address succeeded or failed depending only on whether the customer
   * clicked the suggestion — and the failure was reported as "we do not have a
   * record for this address on the current tax roll", which is a sentence about
   * the property rather than about the query. 13 of 46 checks recorded between
   * 21 and 23 Aug returned no_parcel.
   *
   * SAME SHAPE AS THE ZIP HARD FILTER fixed on 20 Aug: a comparison that assumes
   * two sources agree about a string, refusing the customer for the county's
   * bookkeeping. That fix went into the ZIP and not into the match beside it.
   *
   * The limit rises from 2 because the pattern now returns candidates rather
   * than answers, and rowMatches has to see the real ones to reject the rest. It
   * stays small: a genuine street address does not have twelve plausible
   * readings, and an unfiltered pattern that did would be a bug worth failing on
   * rather than paging through.
   */
  const CANDIDATE_LIMIT = 12;
  // `let`, because the locality fallback below rebuilds it and `run` closes over
  // the binding rather than the value.
  let variants = addressVariants(addr);

  const run = (useZip) => {
    let sel = db
      .from('parcels')
      .select('*')
      .eq('asmnt_yr', ROLL_YEAR)
      .or(orIlike('phy_addr1', variants.map(anchoredPattern)))
      .limit(CANDIDATE_LIMIT);
    // ZIP when we have one and are still trusting it; otherwise city, which is the
    // weaker hint the original code already fell back to.
    if (useZip && zip) sel = sel.eq('phy_zipcd', String(zip).trim().slice(0, 5));
    else if (city) sel = sel.ilike('phy_city', String(city).trim());
    return sel;
  };

  let { data, error } = await run(true);
  /**
   * The retry tests the FILTERED set, not the raw one.
   *
   * A ZIP can return rows that all turn out to be near-misses — the same house
   * number on a similarly-named street. Retrying only when the database returned
   * literally nothing would let those near-misses suppress the retry and hand
   * back "no record" for a property the ZIP-less query would have found. That is
   * the 20 Aug bug reintroduced one layer up.
   */
  if (!error && zip && !(data || []).some((r) => rowMatches(r.phy_addr1, variants))) {
    ({ data, error } = await run(false));
  }

  /**
   * ==========================================================================
   * THE CITY LEFT IN THE STREET LINE. 26 Aug 2026.
   * ==========================================================================
   * "12612 SW 28TH ST MIRAMAR" — no comma, so normalizeAddr keeps MIRAMAR, every
   * pattern carries `%MIRAMAR%`, and the roll returns zero rows for a parcel we
   * hold. See stripTrailingLocality for the measurement and the reasoning.
   *
   * GATED ON ZERO ROWS RETRIEVED, not on zero rows MATCHED, and that is the
   * safety property rather than an optimisation. If the database returned
   * anything at all, the address reached real candidates and this must not touch
   * it — a shorter query returns MORE rows, and taking those over a real
   * candidate set is how a customer gets handed a neighbour's assessment. Zero
   * retrieved is the only state where there is nothing to lose.
   *
   * It also means no lookup that works today can change behaviour: the fallback
   * is unreachable unless the current code was already about to say "we have no
   * record for this address".
   */
  if (!error && !(data || []).length) {
    const trimmed = stripTrailingLocality(addr);
    if (trimmed && trimmed !== addr) {
      variants = addressVariants(trimmed);
      ({ data, error } = await run(true));
      // Same filtered-set retry as above, for the same reason.
      if (!error && zip && !(data || []).some((r) => rowMatches(r.phy_addr1, variants))) {
        ({ data, error } = await run(false));
      }
    }
  }

  if (error) {
    /**
     * ==========================================================================
     * A DATABASE FAILURE IS NOT A MISSING PROPERTY. 25 Aug 2026.
     * ==========================================================================
     * This returned null, which is the same thing a genuine miss returns. So a
     * Supabase timeout, a connection failure or a rate limit was reported to the
     * homeowner as:
     *
     *     "We do not have a record for this address on the current tax roll."
     *
     * A confident, false statement about their home, when the truth is that our
     * database did not answer. And it was recorded as `no_parcel`, so the funnel
     * counted our outages as properties that do not exist.
     *
     * This file's own header already describes this exact failure for a different
     * cause — a non-numeric DOR_ROLL_YEAR reaching SQL as NaN, "presented to the
     * customer as 'we have no record of your property', indistinguishable from a
     * genuine miss, for every address in Florida." That was fixed at the config
     * boundary. The same shape was still live for every other database error.
     *
     * IT MATTERS TODAY SPECIFICALLY. Supabase was measurably slow twice on 25 Aug
     * — the stuck-orders probe timed out at 15:00, and a check_events write was
     * dropped — and the no-finding share of checks rose from 41% to 46% across
     * the same afternoon. Until this is separated, `no_parcel` absorbs outages and
     * no amount of matcher work can be measured against it.
     */
    console.error('[parcels] lookup failed:', error.message);
    return { lookupFailed: true, error: error.message };
  }

  /**
   * ==========================================================================
   * A MISS CARRIES WHY IT MISSED. 25 Aug 2026.
   * ==========================================================================
   * 41% of checks that day ended in "we have no record for this address", and
   * the funnel could not tell the two causes apart:
   *
   *   the SQL returned rows and rowMatches rejected them all
   *       -> the roll HAS this street. Our matching failed. OUR BUG.
   *   the SQL returned nothing at all
   *       -> nothing resembling it is on the roll. Coverage, new construction,
   *          or the visitor is not where they think they are.
   *
   * Those need opposite responses and were one grey bar. Funnel_Read_2026-08-23
   * proposed splitting them by county — which was never possible, because county
   * is derived from a matched parcel and on a miss there is none. This count is
   * the signal that actually exists, and it is already computed: it is just the
   * length of the row set before this filter runs.
   *
   * Returned as an object rather than null so the reason survives the return.
   * BOTH CALLERS HAVE BEEN UPDATED — a truthy miss would otherwise read as a
   * found parcel, which is the worst possible failure of this function.
   */
  const retrievedBeforeFilter = (data || []).length;
  data = (data || []).filter((r) => rowMatches(r.phy_addr1, variants));
  if (!data.length) return { noMatch: true, nearMisses: retrievedBeforeFilter };

  /**
   * AN EXACT MATCH BEATS A PREFIX MATCH.
   *
   * This is what makes unit stripping safe. stripUnit ADDS a spelling with a
   * trailing number removed, and for a genuine road number — "123 COUNTY RD 30"
   * — that added spelling is "123 COUNTY RD", which prefix-matches every house
   * numbered 123 on every County Road. Without this rule a lookup that used to
   * resolve cleanly would start returning `ambiguous`, which is a regression
   * dressed up as caution.
   *
   * With it, the row that IS "123 COUNTY RD 30" wins outright and the rest are
   * discarded. Ambiguity is then reserved for what it was built for: two real
   * units behind one street address.
   */
  const exact = data.filter((r) => variants.some((v) => normSpace(r.phy_addr1) === normSpace(v)));
  if (exact.length) data = exact;

  // Two matches on the same address and ZIP means condo units or a duplex
  // sharing a street address without unit numbers in PHY_ADDR1. Guessing which
  // one is the customer's would put another household's assessment on their
  // petition, so refuse and let the UI disambiguate.
  if (data.length > 1) {
    /**
     * City and ZIP are on the candidates now, and that is not cosmetic.
     *
     * While the ZIP was a hard filter, two rows could only ever mean two units at
     * one address in one ZIP, so a unit number was the only thing that told them
     * apart. Now that a ZIP miss retries without it, two rows can also mean the
     * same street name in two different Florida towns — and `unit` alone is null
     * for both, which would hand the UI a choice between two identical blanks.
     */
    return {
      ambiguous: true,
      candidates: data.map((r) => ({
        parcelId: r.parcel_id,
        unit: r.phy_addr2,
        // `street` and `zip` are what the UI writes back into the form when one is
        // picked, so they are the roll's own values — re-running the lookup with the
        // exact strings we hold is the one query guaranteed to resolve.
        street: r.phy_addr1,
        city: r.phy_city,
        zip: r.phy_zipcd,
        full: [r.phy_addr1, r.phy_addr2, r.phy_city, 'FL', r.phy_zipcd].filter(Boolean).join(', '),
      })),
    };
  }

  return data[0];
}

/**
 * Look up a parcel and decide whether an appeal is worth filing.
 *
 * The returned shape separates FACTS from OPINIONS deliberately, and callers
 * must keep them apart in the UI:
 *
 *   parcel.*          county roll figures — facts, verifiable against a TRIM notice
 *   savings.breakEven arithmetic on those figures — also a fact
 *   savings.scenarios projections — estimates, and labelled as such
 *
 * Blurring the two is how a document-preparation service starts making claims
 * that look like unlicensed appraisal (counsel memo, question 3).
 */
export async function lookupAndQualify({ street, zip, city = null }, opts = {}) {
  const parcel = await findParcel({ street, zip, city });

  /**
   * OUR FAULT, SAID AS OURS. Never "we have no record of your property" — that
   * sentence is about their home, and this is about our database.
   */
  if (parcel?.lookupFailed) {
    return {
      found: false,
      reason: 'lookup_failed',
      message: 'We could not reach our copy of the county roll just now. This is our problem, not yours — please try again in a moment.',
    };
  }

  // No database client at all is still null. A MISS is an object that says why.
  if (!parcel || parcel.noMatch) {
    /**
     * Two outcomes, not one. See the comment at the miss in findParcel above.
     * `no_parcel_near_miss` means the roll holds that street and our matcher
     * rejected every row — a bug we can fix. `no_parcel` means nothing like it
     * came back at all. The customer-facing message is deliberately unchanged
     * for both: it is honest either way, and a homeowner does not need to be
     * told which of our internal failures they hit.
     */
    const nearMisses = parcel?.nearMisses || 0;
    const missMessage = 'We do not have a record for this address on the current tax roll.';
    /*
      TWO EXPLICIT RETURNS, NOT A TERNARY ON `reason:`.
      scripts/verify-check-events.mjs extracts every `reason: '...'` literal from
      this file and requires it to exist in the closed vocabulary. A ternary hides
      BOTH literals from that extractor — written that way first, and the guard
      caught it by reporting both as unreachable. Writing it out is also plainer.
    */
    if (nearMisses > 0) {
      return { found: false, reason: 'no_parcel_near_miss', nearMisses, message: missMessage };
    }
    return { found: false, reason: 'no_parcel', nearMisses: 0, message: missMessage };
  }
  if (parcel.ambiguous) {
    return { found: false, reason: 'ambiguous', candidates: parcel.candidates, message: 'Several properties share this address. Please choose yours.' };
  }

  // Real county millage, not the statewide placeholder. Null for a county we
  // have no rate for — qualify() then reports taxable-value movement without
  // inventing a dollar figure.
  const millage = millageForCounty(parcel.co_no);

  /**
   * COST TO CURE, PRICED HERE BECAUSE THIS IS WHERE THE PARCEL LIVES.
   *
   * curePriceFor() scales every figure by the property's improvement value per
   * square foot and its conditioned floor area, so a cure cannot be priced before
   * the parcel is in hand — which is exactly why the gate never saw it. The
   * caller passes the owner's SELECTED ISSUES, not a dollar amount, so the
   * pricing stays server-side on sourced data and a client cannot assert its own
   * cure figure to buy its way past the gate.
   *
   * `opts.issues` empty or absent → cure is zero → identical behaviour to before.
   */
  let cureDollars = 0;
  if (Array.isArray(opts.issues) && opts.issues.length) {
    try {
      cureDollars = totalCostToCure(opts.issues, parcel, opts.costOverrides || {}).total || 0;
    } catch (e) {
      // A pricing failure must never block a lookup. Zero cure is the
      // conservative outcome: it can only make the gate stricter, never looser.
      console.error('[dor] cost to cure failed, treating as zero:', e.message);
      cureDollars = 0;
    }
  }

  /*
    THE REAL COST OF FILING IN *THIS* COUNTY, not the cheapest one in Florida.

    qualify() defaults serviceFee to 104 — $89 plus the $15 the cheapest counties
    charge — and until 25 Aug no caller overrode it. 48 of 67 counties charge $50,
    so the true cost there is $139, and the refusal copy told those homeowners
    "less than the $104 it costs to file" while quoting a number $35 short of what
    we would actually have taken.

    The break-even gate this feeds only changes its answer for parcels whose best
    case lands between $104 and $138 — a narrow slice, which is why this was judged
    low priority as a gate. The wrong number printed inside the sentence explaining
    a refusal is the part that was worth fixing.

    An unknown county falls back to $139, not $104: this gate must fail
    conservative, the same way getFilingWindowStatus({strict:true}) does at checkout.
  */
  let serviceFee = 139;
  try {
    const feeInfo = getFlVabFee(LOADED_COUNTIES[Number(parcel.co_no)]);
    const cents = Number(feeInfo?.vabFee);
    if (Number.isFinite(cents) && cents > 0) serviceFee = 89 + Math.round(cents / 100);
  } catch (e) {
    console.error('[dor] county fee lookup failed, using $139:', e.message);
  }

  const savings = qualify(parcel, {
    ...opts,
    millage: opts.millage || millage || undefined,
    cureDollars,
    serviceFee,
  });

  return {
    found: true,
    /**
     * THE CURE FIGURE THE ARITHMETIC ACTUALLY USED.
     *
     * Returned so a screen can show the owner what their documented repairs
     * contributed WITHOUT recomputing it. The client holds the issue labels but
     * not the NAL row — no living area, no land value — so a second call to
     * totalCostToCure() there would price against a different parcel and print a
     * number that is not the one that decided anything.
     *
     * `shareOfValue` is cure / just value, and it is EXACT rather than an
     * approximation: qualify()'s target is `jv * (1 - pct) - cure`, so a cure of
     * C dollars reduces the percentage comparable sales must carry by exactly
     * C / jv. See the note on the delta block in pages/apply.js.
     */
    cure: cureDollars > 0
      ? { dollars: cureDollars, shareOfValue: parcel.jv > 0 ? cureDollars / Number(parcel.jv) : null }
      : null,
    parcel: {
      parcelId: parcel.parcel_id,
      coNo: parcel.co_no,
      rollYear: parcel.asmnt_yr,
      address: [parcel.phy_addr1, parcel.phy_city, 'FL', parcel.phy_zipcd].filter(Boolean).join(', '),
      // The same address in parts, so a caller can prefill a form without
      // splitting the joined string back apart. `address` is for display; this is
      // for handing the property from one page to the next without making the
      // customer type it twice.
      situs: {
        street: parcel.phy_addr1 || '',
        city: parcel.phy_city || '',
        state: 'FL',
        zip: (parcel.phy_zipcd || '').toString().slice(0, 5),
      },
      ownerName: parcel.own_name,
      useCode: parcel.dor_uc,
      // The three values that matter, kept distinct. This distinction is the
      // entire reason this table exists.
      justValue: parcel.jv,
      assessedValue: { school: parcel.av_sd, nonSchool: parcel.av_nsd },
      taxableValue: { school: parcel.tv_sd, nonSchool: parcel.tv_nsd },
      livingArea: parcel.tot_lvg_area,
      yearBuilt: parcel.act_yr_blt,
      // Land value, so improvement value (justValue - landValue) can be derived.
      // Improvement value per square foot is what scales cost to cure by finish
      // level — the appraiser's own IMP_QUAL grade does not separate anything
      // usable (Broward grades 3, 4 and 5 sit within $12/sqft of each other).
      landValue: parcel.lnd_val,
      homesteaded: Number(parcel.exmpt_01 || 0) > 0,
      neighborhoodCode: parcel.nbrhd_cd,
      // Printed on the petition. A sworn document citing an assessed value
      // should say which roll produced it.
      source: `${parcel.asmnt_yr} Florida DOR assessment roll, county ${parcel.co_no}`,
    },
    savings,
  };
}

export default { suggestAddresses, findParcel, lookupAndQualify, ROLL_YEAR };
