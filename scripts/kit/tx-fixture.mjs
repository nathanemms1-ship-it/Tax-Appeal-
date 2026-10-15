/**
 * scripts/kit/tx-fixture.mjs — one Texas protest packet for the kit verifiers.
 *
 * The verify-tx-protest El Paso fixture (a clean, over-appraised, uncapped
 * parcel with six neighbourhood comparables), run through the REAL
 * buildProtest(), so every kit check holds the kit to what production builds.
 * Callers must have registered scripts/resolve-extensionless.mjs.
 */
const { buildProtest } = await import('../../lib/tx/protest.js');

export const TX_SUBJECT = Object.freeze({
  cad_id: 71, tax_year: 2027, account_number: 'E0000001', market_value: 300000, appraised_value: 300000,
  homestead_cap_loss: 0, nhs_cap_loss: 0, living_area: 2000, year_built: 1998, land_value: 40000,
  situs_street: '8023 MARBELLA CREEK AVE', situs_city: 'EL PASO', situs_zip: '79907', neighborhood_code: 'H1234', has_homestead: true,
});
const compRows = [1, 2, 3, 4, 5, 6].map((i) => ({ account_number: `C000000${i}`, living_area: 1950 + i * 10, appraised_value: 240000 + i * 1000, market_value: 240000 + i * 1000, homestead_cap_loss: 0, nhs_cap_loss: 0, year_built: 1997, land_value: 39000 }));
export const TX_COMPS = Object.freeze({
  sufficient: true, level: 'neighborhood', levelStrength: 'strong', basis: 'clean', comps: compRows, compCount: 6, confidence: 'high',
  medianAppraisedPerSqft: 123.2, medianMarketPerSqft: 123.2, subjectAppraisedPerSqft: 150, subjectMarketPerSqft: 150,
  indicatedAppraised: 246400, indicatedMarket: 258000, cappedCompCount: 0, cappedCompShare: 0,
  adjustments: 'size within 10%, age within 15 years', disclosure: 'Comparables drawn from the district neighborhood code.',
});

export const txPacket = (patch = {}, taxYear = 2027) => buildProtest({
  parcel: { ...TX_SUBJECT, tax_year: taxYear, ...(patch.parcel || {}) },
  comps: { ...TX_COMPS, ...(patch.comps || {}) }, taxYear, owner: { firstName: 'Jane', lastName: 'Doe' },
});

export const TX_OWNER = Object.freeze({ name: 'Jane Doe', street: '8023 Marbella Creek Ave', city: 'El Paso', state: 'TX', zip: '79907', email: 'jane@example.com' });

export const txKitOrder = (patch = {}) => ({
  state: 'TX', taxYear: 2027, packet: txPacket(),
  property: { county: 'El Paso', address: '8023 MARBELLA CREEK AVE, EL PASO, TX 79907', parcelId: 'E0000001' },
  owner: { ...TX_OWNER }, savings: { yearlySaving: null }, ...patch,
});
