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
 * anything?" check viable: roughly 42% of Florida residential parcels cannot
 * benefit, and under the old architecture we paid a vendor to discover that,
 * every time, for people who could never become customers.
 */

import { getSupabaseAdmin } from '../../pages/api/supabase';
import { qualify } from './qualify';

/**
 * The roll year to query.
 *
 * NOT "the newest row we happen to hold". Rolls are separate legal snapshots and
 * a petition must cite the year it disputes — quoting a 2026 just value on a
 * 2025 petition would misstate the thing being appealed. Pinned by env so a new
 * roll load cannot silently re-date evidence under petitions already filed.
 */
export const ROLL_YEAR = Number(process.env.DOR_ROLL_YEAR || 2026);

/** Normalise a street address for comparison against PHY_ADDR1. */
function normalizeAddr(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  let sel = db
    .from('parcels')
    .select('co_no, parcel_id, phy_addr1, phy_city, phy_zipcd, jv, dor_uc')
    .eq('asmnt_yr', ROLL_YEAR)
    .ilike('phy_addr1', `%${q}%`)
    .limit(limit);

  if (zip) sel = sel.eq('phy_zipcd', String(zip).trim().slice(0, 5));

  const { data, error } = await sel;
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

  let sel = db
    .from('parcels')
    .select('*')
    .eq('asmnt_yr', ROLL_YEAR)
    .ilike('phy_addr1', addr)
    .limit(2);

  if (zip) sel = sel.eq('phy_zipcd', String(zip).trim().slice(0, 5));
  else if (city) sel = sel.ilike('phy_city', String(city).trim());

  const { data, error } = await sel;
  if (error) {
    console.error('[parcels] lookup failed:', error.message);
    return null;
  }
  if (!data || !data.length) return null;

  // Two matches on the same address and ZIP means condo units or a duplex
  // sharing a street address without unit numbers in PHY_ADDR1. Guessing which
  // one is the customer's would put another household's assessment on their
  // petition, so refuse and let the UI disambiguate.
  if (data.length > 1) {
    return { ambiguous: true, candidates: data.map((r) => ({ parcelId: r.parcel_id, unit: r.phy_addr2 })) };
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

  if (!parcel) {
    return { found: false, reason: 'no_parcel', message: 'We do not have a record for this address on the current tax roll.' };
  }
  if (parcel.ambiguous) {
    return { found: false, reason: 'ambiguous', candidates: parcel.candidates, message: 'Several properties share this address. Please choose yours.' };
  }

  const savings = qualify(parcel, opts);

  return {
    found: true,
    parcel: {
      parcelId: parcel.parcel_id,
      coNo: parcel.co_no,
      rollYear: parcel.asmnt_yr,
      address: [parcel.phy_addr1, parcel.phy_city, 'FL', parcel.phy_zipcd].filter(Boolean).join(', '),
      ownerName: parcel.own_name,
      useCode: parcel.dor_uc,
      // The three values that matter, kept distinct. This distinction is the
      // entire reason this table exists.
      justValue: parcel.jv,
      assessedValue: { school: parcel.av_sd, nonSchool: parcel.av_nsd },
      taxableValue: { school: parcel.tv_sd, nonSchool: parcel.tv_nsd },
      livingArea: parcel.tot_lvg_area,
      yearBuilt: parcel.act_yr_blt,
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
