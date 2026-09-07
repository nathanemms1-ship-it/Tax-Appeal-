#!/usr/bin/env node
/**
 * Render a sample El Paso filing to disk, from a fixture. No database.
 *
 *   node scripts/tx/preview-protest.mjs [out.html]
 *
 * This exists so the document gets proof-read by a person before it is mailed to
 * an appraisal review board. Everything upstream of it is asserted by
 * scripts/verify-tx-protest.mjs; nothing but a pair of eyes catches a document
 * that is correct and reads badly.
 */
import { register } from 'node:module';
import { writeFileSync } from 'node:fs';
register('./../resolve-extensionless.mjs', import.meta.url);

const { buildProtest } = await import('../../lib/tx/protest.js');
const { renderProtestHtml } = await import('../../lib/tx/protestHtml.js');

// A real El Paso shape: 2,000 sqft, 1998, uncapped, appraised well above the
// neighbourhood's median per square foot.
const parcel = {
  cad_id: 71, tax_year: 2026, account_number: 'E0142778',
  market_value: 312500, appraised_value: 312500,
  homestead_cap_loss: 0, nhs_cap_loss: 0,
  living_area: 2040, year_built: 1998, effective_year_built: 1998, land_value: 42000,
  situs_street: '8023 MARBELLA CREEK AVE', situs_city: 'EL PASO', situs_zip: '79907',
  neighborhood_code: 'EP-1420', has_homestead: true, condition_code: 'AV',
};

const comps = [
  ['E0142801', 1980, 1997, 259400], ['E0142815', 2065, 1999, 268100],
  ['E0142822', 1955, 1996, 254900], ['E0142840', 2110, 2000, 276300],
  ['E0142866', 2020, 1998, 262700], ['E0142879', 1998, 1997, 257600],
].map(([account_number, living_area, year_built, v]) => ({
  account_number, living_area, year_built, effective_year_built: year_built,
  appraised_value: v, market_value: v, homestead_cap_loss: 0, nhs_cap_loss: 0,
  land_value: 41000, condition_code: 'AV',
}));

const psf = comps.map((c) => c.appraised_value / c.living_area).sort((a, b) => a - b);
const medAppr = (psf[2] + psf[3]) / 2;

const compsResult = {
  sufficient: true, level: 'neighborhood', levelStrength: 'strong', basis: 'clean',
  comps, confidence: 'high',
  medianAppraisedPerSqft: Math.round(medAppr * 100) / 100,
  medianMarketPerSqft: Math.round(medAppr * 100) / 100,
  subjectAppraisedPerSqft: Math.round((parcel.appraised_value / parcel.living_area) * 100) / 100,
  subjectMarketPerSqft: Math.round((parcel.market_value / parcel.living_area) * 100) / 100,
  indicatedAppraised: Math.round(medAppr * parcel.living_area),
  indicatedMarket: Math.round(medAppr * parcel.living_area),
  cappedCompCount: 0, cappedCompShare: 0,
  adjustments: 'Comparables were held within 10% of the subject’s living area and 15 years of its effective year built.',
  disclosure: 'All six comparable properties are drawn from the appraisal district’s own certified roll.',
};

const packet = buildProtest({
  parcel, comps: compsResult, taxYear: 2026,
  owner: { firstName: 'Maria', lastName: 'Delgado', phone: '915-555-0148',
    email: 'maria.delgado@example.com',
    mailing: '8023 Marbella Creek Ave, El Paso, TX 79907' },
});

if (!packet.filable) {
  console.error(`✗ the fixture was refused: ${packet.reason}\n  ${packet.message || ''}`);
  process.exit(1);
}

const out = process.argv[2] || 'tx-50132-sample.html';
writeFileSync(out, renderProtestHtml(packet));

console.log(`\n  El Paso County — account ${parcel.account_number}, tax year 2026`);
console.log(`  subject          ${parcel.living_area} sqft   $${compsResult.subjectAppraisedPerSqft}/sqft   $${parcel.appraised_value.toLocaleString()}`);
console.log(`  comp median      ${comps.length} properties   $${compsResult.medianAppraisedPerSqft}/sqft`);
console.log(`  indicated value  $${compsResult.indicatedAppraised.toLocaleString()}`);
console.log(`  we ask for       $${packet.requestedValue.toLocaleString()}   (reduction $${packet.reductionSought.toLocaleString()})`);
console.log(`  confidence       ${packet.grid.confidence} — ${packet.grid.level} tier\n`);
console.log(`  wrote ${out}\n`);
