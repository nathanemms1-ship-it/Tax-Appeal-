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
 * USPS suffix abbreviations, because the roll stores "AVE" and people type
 * "Avenue". Without this, half of all correctly-typed addresses miss.
 */
const SUFFIXES = {
  STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD', DRIVE: 'DR', LANE: 'LN',
  COURT: 'CT', CIRCLE: 'CIR', BOULEVARD: 'BLVD', PLACE: 'PL', TERRACE: 'TER',
  PARKWAY: 'PKWY', TRAIL: 'TRL', HIGHWAY: 'HWY', SQUARE: 'SQ', LOOP: 'LOOP',
  POINT: 'PT', RIDGE: 'RDG', CREEK: 'CREEK', COVE: 'CV', PATH: 'PATH',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
};

/**
 * Normalise a street address for comparison against PHY_ADDR1.
 *
 * THREE THINGS THIS HAS TO SURVIVE, all of which broke the first version:
 *
 *   1. A trailing city or state. People type "11142 SW 6th St, Miami" because
 *      that is how addresses are written everywhere else. The roll keeps the
 *      street in PHY_ADDR1 and the city in PHY_CITY, so anything from the first
 *      comma onward has to go or nothing matches.
 *   2. Spelled-out suffixes. The roll says "AVE"; people type "Avenue".
 *   3. Punctuation and casing.
 *
 * The first of those is the one that matters most, because the address is
 * otherwise perfectly correct — and a miss is presented to the customer as
 * "we have no record of your property", which is both wrong and alarming.
 */
function normalizeAddr(s) {
  let out = String(s || '')
    // Everything from the first comma is city/state/ZIP, none of which lives in
    // PHY_ADDR1.
    .split(',')[0]
    .toUpperCase()
    .replace(/[.#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip a trailing state name or code that survived because the customer
  // omitted the comma ("12612 SW 28TH ST MIRAMAR FLORIDA").
  out = out.replace(/\s+(FLORIDA|FL)$/, '').trim();

  return out
    .split(' ')
    .map((w) => SUFFIXES[w] || w)
    .join(' ');
}

/**
 * Ordinal suffixes on numbered streets are NOT consistent — not between
 * counties, and not even within one.
 *
 * Miami-Dade writes "92 SW 3 ST" and "51 SW 1 AVE" with no ordinal at all,
 * while the same file also contains "10981 SW 121ST ST". Broward and Palm Beach
 * differ again. A homeowner types "SW 44th St" because that is how the street is
 * signposted, and an exact match against "SW 44 ST" fails — presenting to them
 * as "we have no record of your property", which is both wrong and alarming.
 *
 * So we generate every plausible spelling and match on any of them. Cheap: it is
 * at most three OR'd conditions against an indexed column.
 *
 * The house number is deliberately excluded — 10981 must never become 10981ST.
 */
function ordinalSuffix(n) {
  const two = n % 100;
  if (two >= 11 && two <= 13) return 'TH';
  return ['TH', 'ST', 'ND', 'RD', 'TH', 'TH', 'TH', 'TH', 'TH', 'TH'][n % 10];
}

export function addressVariants(addr) {
  const parts = String(addr).split(' ').filter(Boolean);
  if (parts.length < 2) return [addr];

  const head = parts[0];             // house number — untouched
  const rest = parts.slice(1);

  const stripped = rest.map((w) => w.replace(/^(\d+)(ST|ND|RD|TH)$/, '$1'));
  const added = stripped.map((w) => (/^\d+$/.test(w) ? w + ordinalSuffix(Number(w)) : w));

  return [...new Set([
    addr,
    [head, ...stripped].join(' '),
    [head, ...added].join(' '),
  ])];
}

/**
 * Build a PostgREST .or() filter.
 *
 * Values are double-quoted because addresses contain spaces, and commas and
 * parens are stripped first — both are structural characters in PostgREST's
 * filter grammar and would otherwise be read as another condition. Street names
 * do occasionally contain them.
 */
function orIlike(column, patterns) {
  return patterns
    .map((p) => `${column}.ilike."${p.replace(/["(),]/g, ' ')}"`)
    .join(',');
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
    .or(orIlike('phy_addr1', addressVariants(q).map((v) => `%${v}%`)))
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
    .or(orIlike('phy_addr1', addressVariants(addr)))
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
