/**
 * OFFLINE VERIFICATION for lib/providers/rentcast.js.
 *
 * Runs the comp selection and valuation logic against a synthetic RentCast
 * response with no network and no API key. This is deliberately offline: it must
 * stay runnable in CI and in `npm run build` without burning billed API calls or
 * requiring a secret, and the things most likely to be wrong here — the
 * similarity bands, the self-comp exclusion, the median — are pure functions of
 * the response.
 *
 * It asserts the SAFETY properties, not just the happy path:
 *   - a property is never comped against itself
 *   - listings without a recorded sale price never appear
 *   - stale sales are excluded by the date window
 *   - below the 3-comp floor, NO indicated value is produced
 *   - the median, not the mean, drives the value (one outlier must not move it)
 */

import assert from 'node:assert';

process.env.RENTCAST_API_KEY = 'test-key-not-used-for-network';

const SUBJECT = {
  formattedAddress: '100 Palm Ave, Tampa, FL 33602',
  parcelId: 'A-100',
  latitude: 27.95,
  longitude: -82.46,
  propertyType: 'Single Family',
  sqft: 2000,
  yearBuilt: '2000',
  subdivision: 'PALM GROVE',
  assessedValue: 500000,
};

// ~0.1 mile per 0.00145 degrees latitude at this latitude.
const near = (i) => 27.95 + i * 0.00145;
const recent = (monthsAgo) => {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
};

function rc(over) {
  return {
    formattedAddress: 'X', assessorID: null, county: 'Hillsborough',
    latitude: near(1), longitude: -82.46, propertyType: 'Single Family',
    squareFootage: 2000, bedrooms: 3, bathrooms: 2, yearBuilt: 2000,
    subdivision: 'PALM GROVE', lastSalePrice: 400000, lastSaleDate: recent(6),
    taxAssessments: { 2025: { year: 2025, value: 380000, land: 100000, improvements: 280000 } },
    ...over,
  };
}

const RESPONSE = [
  // The subject itself, returned by the radius search as it always will be.
  rc({ formattedAddress: '100 Palm Ave, Tampa, FL 33602', assessorID: 'A-100', lastSalePrice: 900000 }),
  // Four good comps at $200/sqft.
  rc({ formattedAddress: '102 Palm Ave', assessorID: 'A-102', latitude: near(1), lastSalePrice: 400000 }),
  rc({ formattedAddress: '104 Palm Ave', assessorID: 'A-104', latitude: near(2), lastSalePrice: 404000, squareFootage: 2020 }),
  rc({ formattedAddress: '106 Palm Ave', assessorID: 'A-106', latitude: near(3), lastSalePrice: 396000, squareFootage: 1980 }),
  rc({ formattedAddress: '108 Palm Ave', assessorID: 'A-108', latitude: near(4), lastSalePrice: 400000 }),
  // Outlier: waterfront teardown at triple the price. Must not move the median.
  rc({ formattedAddress: '110 Palm Ave', assessorID: 'A-110', latitude: near(5), lastSalePrice: 1200000 }),
  // No recorded sale — a listing, not evidence. Must be dropped.
  rc({ formattedAddress: '112 Palm Ave', assessorID: 'A-112', lastSalePrice: null, lastSaleDate: null }),
  // Sold 40 months ago — outside the window. Must be dropped.
  rc({ formattedAddress: '114 Palm Ave', assessorID: 'A-114', lastSaleDate: recent(40) }),
  // Half the size — outside the ±20% band. Must be dropped.
  rc({ formattedAddress: '116 Palm Ave', assessorID: 'A-116', squareFootage: 1000, lastSalePrice: 200000 }),
  // Built 1950 — outside the ±15yr band. Must be dropped.
  rc({ formattedAddress: '118 Palm Ave', assessorID: 'A-118', yearBuilt: 1950 }),
];

let captured = null;
global.fetch = async (url) => {
  captured = String(url);
  return { ok: true, status: 200, json: async () => RESPONSE };
};

const { findComps, normalizeProperty } = await import('../lib/providers/rentcast.js');

const r = await findComps(SUBJECT);
const addrs = r.comps.map((c) => c.address);

// --- Safety assertions -----------------------------------------------------
assert.ok(!addrs.includes('100 Palm Ave, Tampa, FL 33602'), 'subject must not comp against itself');
assert.ok(!addrs.includes('112 Palm Ave'), 'a property with no recorded sale price must be excluded');
assert.ok(!addrs.includes('114 Palm Ave'), 'a sale outside the date window must be excluded');
assert.ok(!addrs.includes('116 Palm Ave'), 'a property outside the sqft band must be excluded');
assert.ok(!addrs.includes('118 Palm Ave'), 'a property outside the year-built band must be excluded');

// --- Valuation assertions --------------------------------------------------
assert.ok(r.sufficient, 'five qualifying comps should be sufficient');
assert.strictEqual(r.medianPpsf, 200, `median $/sqft should be 200, got ${r.medianPpsf}`);
assert.strictEqual(r.indicatedValue, 400000, `indicated value should be 400000, got ${r.indicatedValue}`);
assert.strictEqual(r.subjectPpsf, 250, 'assessed $/sqft should be 250');

// The $1.2M outlier is present in the set but must not have moved the median.
// A mean over these comps would be ~$260/sqft — a 30% swing on the petition.
assert.ok(addrs.includes('110 Palm Ave'), 'the outlier should still be listed for transparency');

// --- Insufficiency assertion ----------------------------------------------
// The floor must hold: with fewer than three qualifying comps, no number.
// A 0.15-mile radius reaches only the nearest neighbour.
const sparse = await findComps(SUBJECT, { maxRadiusMiles: 0.15 });
assert.ok(!sparse.sufficient, 'a thin comp set must report sufficient:false');
assert.strictEqual(sparse.indicatedValue, null, 'a thin comp set must NOT produce an indicated value');

// --- Mapping assertions ----------------------------------------------------
const n = normalizeProperty(rc({ assessorID: '  A-999  ', county: 'Hillsborough County' }));
assert.strictEqual(n.parcelId, 'A-999', 'assessorID should be trimmed into parcelId');
assert.strictEqual(n.county, 'Hillsborough', 'county should have the "County" suffix stripped');
assert.strictEqual(n.assessedValue, 380000, 'assessedValue should come from the latest taxAssessments year');
assert.strictEqual(n.valueFieldIsAmbiguous, true, 'the FL just-value ambiguity flag must always be set');

// Multi-year assessments must pick the newest, not the last key.
const multi = normalizeProperty(rc({
  taxAssessments: {
    2023: { year: 2023, value: 300000 },
    2025: { year: 2025, value: 500000 },
    2024: { year: 2024, value: 400000 },
  },
}));
assert.strictEqual(multi.assessedValue, 500000, 'should pick the most recent assessment year');

// --- Endpoint assertion ----------------------------------------------------
assert.ok(captured.includes('/v1/properties'), 'must use /properties (recorded sales), never /avm/value (listings)');
assert.ok(!captured.includes('avm'), 'must never hit the AVM endpoint for comps');

console.log(`✓ comps verification passed — ${r.comps.length} comps, median $${r.medianPpsf}/sqft, indicated $${r.indicatedValue.toLocaleString()}`);
