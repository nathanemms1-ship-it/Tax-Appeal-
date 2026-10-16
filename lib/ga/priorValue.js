/**
 * lib/ga/priorValue.js — last year's value for a Georgia home, before its notice
 * arrives (pre-sale, 16 Oct 2026).
 *
 * Nathan, 16 Oct: "Lets try and look it up ourselves when we can, if not lets
 * point them to the website where they can look it up. But I agree, if we cant
 * list the value then no sale."
 *
 * HOW: each county below publishes its parcels with the 100% fair market value
 * on a free public ArcGIS service. We ask it which parcel contains the home's
 * map point (RentCast's latitude/longitude), so no county-specific address
 * format matters. Live-tested 16 Oct 2026, every one under 2 s.
 *
 * SAFETY: a value is used only when exactly one parcel contains the point AND
 * the house number on the county's record matches the customer's address. A
 * map point on the street, a stacked condo or a neighbour's lot returns nothing
 * rather than the wrong home's value; the customer is then sent to the county's
 * own property search (GA_SEARCH_SITES) to find it themselves.
 *
 * FIELD TRAPS, checked live:
 *   Fayette   cntassdval is the 40% value; cnttxblval is the 100% value
 *             (583,958 / 0.4 = 1,459,895). Forsyth's same-named fields are the
 *             other way round: there CNTASSDVAL is the 100% value.
 *   Clayton   every field is text.
 *   Fayette   returns the same parcel twice; de-duplicated by parcel id.
 *
 * NOT HERE: Bartow (server dropping connections on 16 Oct; retry later), DeKalb
 * and Hall (value year unproven), Gwinnett (no live service; bulk file only),
 * and the counties with no public values. They get the website link.
 */

export const GA_VALUE_SOURCES = Object.freeze({
  Cobb:      { url: 'https://gis.cobbcounty.gov/gisserver/rest/services/tax/taxassessorsdaily/MapServer/0', value: 'FMV_TOTAL', parcel: 'PIN', houseNo: 'ST_NUMBER' },
  Forsyth:   { url: 'https://geo.forsythco.com/gis/rest/services/Public/Tax_Parcel/FeatureServer/0', value: 'CNTASSDVAL', parcel: 'PARCELID', houseNo: 'SITEADDRESS' },
  Clayton:   { url: 'https://gis.claytoncountyga.gov/server/rest/services/TaxAssessor/Parcels/MapServer/0', value: 'APPRVAL', parcel: 'PARCELID', houseNo: 'STREETNO' },
  Chatham:   { url: 'https://pub.sagis.org/arcgis/rest/services/Pictometry/ParcelDigest/MapServer/0', value: 'FairMarketValue', parcel: 'PIN', houseNo: 'PropAddress_Num' },
  Richmond:  { url: 'https://gismap.augustaga.gov/arcgis/rest/services/AGOL/AGSGeneralFeatures/MapServer/32', value: 'curr_val', parcel: 'parcel_no', houseNo: 'house_no' },
  Lowndes:   { url: 'https://services3.arcgis.com/fYt1jp3hqamxgSvI/arcgis/rest/services/TaxParcel/FeatureServer/0', value: 'CURR_VAL', parcel: 'PARCEL_NO', houseNo: 'HOUSE_NO' },
  Columbia:  { url: 'https://gis.columbiacountyga.gov/host/rest/services/MapsOnline/Parcels_Snapshot/FeatureServer/1003', value: 'Tax_Total_Value', parcel: 'ParcelNum', houseNo: 'Tax_Physical_Address' },
  Coweta:    { url: 'https://coweta-gis-web.coweta.ga.us/arcgis/rest/services/WinGapParcels/MapServer/0', value: 'CurrentValue', parcel: 'ParcelNumber', houseNo: 'HouseNumber' },
  Whitfield: { url: 'https://gis.whitfieldcountyga.com/server/rest/services/TaxAssessMapping/MapServer/4', value: 'curr_val', parcel: 'PARCEL_FUL', houseNo: 'house_no' },
  Fayette:   { url: 'https://services5.arcgis.com/Hg5aLg4LtSINzVWa/arcgis/rest/services/TaxParcel_5e04729658e04c9488fb3401f5ee29e9/FeatureServer/0', value: 'cnttxblval', parcel: 'parcelid', houseNo: 'siteaddress' },
  Bibb:      { url: 'https://services.arcgis.com/ISpzx3B5ZsVA6e1Z/arcgis/rest/services/Macon_Bibb_Web_Map_2026_WFL1/FeatureServer/0', value: 'CURR_VAL', parcel: 'parcel_no', houseNo: 'House_No' },
});

/**
 * Each county's own property search, where an owner can look the value up.
 * Researched 16 Oct 2026 from the assessors' own sites and the Georgia DOR list;
 * every page loaded with the right county and an address search.
 */
export const GA_SEARCH_SITES = Object.freeze({
  "Fulton": "https://qpublic.schneidercorp.com/Application.aspx?App=FultonCountyGA&PageType=Search",
  "Gwinnett": "https://qpublic.schneidercorp.com/Application.aspx?App=GwinnettCountyGA&Layer=Parcels&PageType=Search",
  "Cobb": "https://qpublic.schneidercorp.com/Application.aspx?AppID=1051&LayerID=23951&PageTypeID=2&PageID=9967",
  "DeKalb": "https://propertyappraisal.dekalbcountyga.gov/search/commonsearch.aspx?mode=address",
  "Cherokee": "https://qpublic.schneidercorp.com/Application.aspx?App=CherokeeCountyGA&Layer=Parcels&PageType=Search",
  "Forsyth": "https://qpublic.schneidercorp.com/Application.aspx?App=ForsythCountyGA&Layer=Parcels&PageType=Search",
  "Chatham": "https://qpublic.schneidercorp.com/Application.aspx?App=ChathamCountyGA&PageType=Search",
  "Henry": "https://qpublic.schneidercorp.com/Application.aspx?App=HenryCountyGA&Layer=Parcels&PageType=Search",
  "Clayton": "https://beacon.schneidercorp.com/Application.aspx?AppID=1234&LayerID=39180&PageTypeID=2&PageID=14578",
  "Hall": "https://qpublic.schneidercorp.com/Application.aspx?App=HallCountyGA&Layer=Parcels&PageType=Search",
  "Richmond": "https://qpublic.schneidercorp.com/Application.aspx?App=RichmondCountyGA&Layer=Parcels&PageType=Search",
  "Columbia": "https://qpublic.schneidercorp.com/Application.aspx?App=ColumbiaCountyGA&Layer=Parcels&PageType=Search",
  "Muscogee": "https://qpublic.schneidercorp.com/Application.aspx?App=MuscogeeCountyGA&PageType=Search",
  "Bibb": "https://qpublic.schneidercorp.com/Application.aspx?App=BibbCountyGA&Layer=Parcels&PageType=Search",
  "Houston": "https://qpublic.schneidercorp.com/Application.aspx?App=HoustonCountyGA&Layer=Parcels&PageType=Search",
  "Douglas": "https://qpublic.schneidercorp.com/Application.aspx?App=DouglasCountyGA&Layer=Parcels&PageType=Search",
  "Coweta": "https://qpublic.schneidercorp.com/Application.aspx?App=CowetaCountyGA&Layer=Parcels&PageType=Search",
  "Fayette": "https://qpublic.schneidercorp.com/Application.aspx?App=FayetteCountyGA&Layer=Parcels&PageType=Search",
  "Paulding": "https://qpublic.schneidercorp.com/Application.aspx?App=PauldingCountyGA&Layer=Parcels&PageType=Search",
  "Lowndes": "https://qpublic.schneidercorp.com/Application.aspx?App=LowndesCountyGA&Layer=Parcels&PageType=Search",
  "Bartow": "https://qpublic.schneidercorp.com/Application.aspx?App=BartowCountyGA&Layer=Parcels&PageType=Search",
  "Clarke": "https://qpublic.schneidercorp.com/Application.aspx?App=ClarkeCountyGA&Layer=Parcels&PageType=Search",
  "Jackson": "https://qpublic.schneidercorp.com/Application.aspx?App=JacksonCountyGA&Layer=Parcels&PageType=Search",
  "Walton": "https://qpublic.schneidercorp.com/Application.aspx?App=WaltonCountyGA&Layer=Parcels&PageType=Search",
  "Newton": "https://qpublic.schneidercorp.com/Application.aspx?App=NewtonCountyGA&Layer=Parcels&PageType=Search",
  "Rockdale": "https://qpublic.schneidercorp.com/Application.aspx?App=RockdaleCountyGA&Layer=Parcels&PageType=Search",
  "Carroll": "https://qpublic.schneidercorp.com/Application.aspx?App=CarrollCountyGA&Layer=Parcels&PageType=Search",
  "Whitfield": "https://qpublic.schneidercorp.com/Application.aspx?App=WhitfieldCountyGA&Layer=Parcels&PageType=Search",
});
/** Every Georgia county, from the Department of Revenue. */
export const GA_SEARCH_FALLBACK = 'https://dor.georgia.gov/property-records-online';

const normCounty = (c) => String(c || '').replace(/\s+County$/i, '').trim().toLowerCase();
const findKey = (obj, county) => Object.keys(obj).find((k) => k.toLowerCase() === normCounty(county));

export function countySearchUrl(county) {
  const k = findKey(GA_SEARCH_SITES, county);
  return k ? GA_SEARCH_SITES[k] : GA_SEARCH_FALLBACK;
}

export function hasValueSource(county) { return Boolean(findKey(GA_VALUE_SOURCES, county)); }

/** The leading house number of an address or a numeric field, as a string. */
export function houseNumber(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).trim().match(/^(\d+)/);
  return m ? String(Number(m[1])) : null;
}

/**
 * @returns {Promise<{ ok: true, value: number, parcelId: string, county: string, source: 'county_gis' } | { ok: false, reason: string }>}
 */
export async function lookupPriorValue({ lat, lon, county, street }, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const key = findKey(GA_VALUE_SOURCES, county);
  if (!key) return { ok: false, reason: 'no_source' };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, reason: 'no_location' };
  const want = houseNumber(street);
  if (!want) return { ok: false, reason: 'no_house_number' };
  const s = GA_VALUE_SOURCES[key];
  const qs = new URLSearchParams({
    f: 'json', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: [s.parcel, s.value, s.houseNo].join(','), returnGeometry: 'false',
  });
  let data;
  try {
    const r = await fetchImpl(`${s.url}/query?${qs}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { ok: false, reason: 'unreachable' };
    data = await r.json();
  } catch (e) {
    return { ok: false, reason: 'unreachable' };
  }
  if (!data || data.error || !Array.isArray(data.features)) return { ok: false, reason: 'unreachable' };
  const byParcel = new Map();
  for (const f of data.features) {
    const a = f?.attributes || {};
    const id = String(a[s.parcel] ?? '').trim();
    if (id && !byParcel.has(id)) byParcel.set(id, a);
  }
  if (byParcel.size === 0) return { ok: false, reason: 'no_parcel' };
  if (byParcel.size > 1) return { ok: false, reason: 'ambiguous' };
  const [[parcelId, a]] = [...byParcel.entries()];
  if (houseNumber(a[s.houseNo]) !== want) return { ok: false, reason: 'address_mismatch' };
  const value = Math.round(Number(String(a[s.value] ?? '').replace(/[^0-9.]/g, '')));
  if (!(value >= 1000)) return { ok: false, reason: 'no_value' };
  return { ok: true, value, parcelId, county: key, source: 'county_gis' };
}
