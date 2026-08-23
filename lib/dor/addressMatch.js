/**
 * ADDRESS MATCHING — PURE STRING LOGIC, NO DATABASE, NO NETWORK.
 *
 * Split out of lib/dor/parcels.js on 23 Aug 2026 so it can be tested at all.
 * parcels.js imports pages/api/supabase, which does not resolve under bare node,
 * so every assertion about matching had to be made by regex against source text
 * — and a guard that reads source rather than running code cannot tell you what
 * the function actually does. The bug this file was extracted to fix survived
 * precisely because nothing executed it.
 *
 * Everything here is a pure function of its arguments. If that stops being true,
 * scripts/verify-dor.mjs stops being able to prove any of it.
 */

/**
 * USPS suffix abbreviations, because the roll stores "AVE" and people type
 * "Avenue". Without this, half of all correctly-typed addresses miss.
 */
export const SUFFIXES = {
  STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD', DRIVE: 'DR', LANE: 'LN',
  COURT: 'CT', CIRCLE: 'CIR', BOULEVARD: 'BLVD', PLACE: 'PL', TERRACE: 'TER',
  PARKWAY: 'PKWY', TRAIL: 'TRL', HIGHWAY: 'HWY', SQUARE: 'SQ', LOOP: 'LOOP',
  POINT: 'PT', RIDGE: 'RDG', CREEK: 'CREEK', COVE: 'CV', PATH: 'PATH',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
};

/**
 * SUFFIXES ABOVE IS APPLIED TO EVERY WORD. THIS ONE IS APPLIED TO THE LAST WORD
 * ONLY, AND THAT DISTINCTION IS THE WHOLE REASON IT IS A SEPARATE MAP.
 *
 * Adding these to SUFFIXES would rewrite them wherever they appear, including
 * inside street NAMES, and Florida is full of streets whose name contains a word
 * that is also a suffix. "KINGS LANDING DR" would become "KINGS LNDG DR" and
 * stop matching a roll that spells the name out — turning a fix for one class of
 * miss into a new class of miss, which is how the ZIP hard filter behaved before
 * 20 Aug 2026.
 *
 * A street TYPE is terminal by construction, so restricting the rewrite to the
 * final token gets the abbreviation without touching any name.
 *
 * Chosen because they are the ones that actually occur in the counties we sell
 * into and are effectively never name components: a Florida causeway or turnpike
 * is a road type, not somebody's street name.
 */
export const TERMINAL_SUFFIXES = {
  PLAZA: 'PLZ', TURNPIKE: 'TPKE', CAUSEWAY: 'CSWY', EXPRESSWAY: 'EXPY',
  CROSSING: 'XING', EXTENSION: 'EXT', JUNCTION: 'JCT', BEND: 'BND',
  HEIGHTS: 'HTS', GARDENS: 'GDNS', ESTATES: 'ESTS', STATION: 'STA',
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
export function normalizeAddr(s) {
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

  const words = out.split(' ').map((w) => SUFFIXES[w] || w);

  // Terminal-only rewrite. See TERMINAL_SUFFIXES — applying these to every word
  // would corrupt street names that contain them.
  if (words.length > 1) {
    const last = words[words.length - 1];
    if (TERMINAL_SUFFIXES[last]) words[words.length - 1] = TERMINAL_SUFFIXES[last];
  }

  return words.join(' ');
}

/**
 * Collapse whitespace and case for a comparison that must not care about either.
 *
 * THE ROLL'S OWN SPACING IS NOT CLEAN. Measured 23 Aug 2026 against the loaded
 * 2026 roll: 270,468 of 8,410,126 parcels have a PHY_ADDR1 that differs from its
 * own whitespace-collapsed form — a doubled space, a leading space, a trailing
 * one. normalizeAddr collapses the CUSTOMER'S input, and nothing collapsed the
 * column, so those parcels could not be matched by a string comparison however
 * perfectly the customer typed.
 */
export function normSpace(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Turn a normalised address into a SQL pattern that is anchored at the house
 * number and tolerant of everything after it.
 *
 *   "1610 SEAGRAPE WAY"  ->  "1610%SEAGRAPE%WAY%"
 *
 * Each space becomes a wildcard, so the roll's own irregular spacing cannot
 * cause a miss, and the trailing wildcard admits the unit text the county keeps
 * in PHY_ADDR1 rather than PHY_ADDR2 — 326,092 parcels carry APT / UNIT / LOT /
 * BLDG / TRLR text there.
 *
 * NO LEADING WILDCARD, DELIBERATELY. `%100 MAIN ST%` matches "1100 MAIN ST" and
 * "2100 MAIN ST", which would hand a customer another household's assessment.
 * The house number must anchor. suggestAddresses wraps both ends because a
 * dropdown that over-offers costs nothing and the customer picks; this function
 * decides who exists, so it may not guess.
 */
export function anchoredPattern(v) {
  return `${normSpace(v).split(' ').join('%')}%`;
}

/**
 * Does a roll row actually match, once both sides are normalised?
 *
 * The SQL pattern is deliberately loose — it is there to get candidates out of
 * the index cheaply, not to decide. "1610%SEAGRAPE%WAY%" also matches
 * "1610 SEAGRAPE WAYSIDE DR", so the decision is made here, on whole words:
 * equal, or the candidate continues at a word boundary.
 */
export function rowMatches(rowAddr, variants) {
  const a = normSpace(rowAddr);
  if (!a) return false;
  return variants.some((v) => {
    const w = normSpace(v);
    return w.length > 0 && (a === w || a.startsWith(`${w} `));
  });
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
export function ordinalSuffix(n) {
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
export function orIlike(column, patterns) {
  return patterns
    .map((p) => `${column}.ilike."${p.replace(/["(),]/g, ' ')}"`)
    .join(',');
}
