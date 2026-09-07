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
  living_area: 2040, year_built: 1998, land_value: 42000,
  situs_street: '8023 MARBELLA CREEK AVE', situs_city: 'EL PASO', situs_zip: '79907',
  neighborhood_code: 'EP-1420', has_homestead: true, quality_class: 'R3',
  // effective_year_built and condition_code are NOT in the PACS 8.0.34 export
  // and are null for every El Paso row. A fixture that fills them in produces a
  // document the live pipeline can never produce. Leave them absent.
  effective_year_built: null, condition_code: null,
};

const comps = [
  ['E0142801', 1980, 1997, 259400], ['E0142815', 2065, 1999, 268100],
  ['E0142822', 1955, 1996, 254900], ['E0142840', 2110, 2000, 276300],
  ['E0142866', 2020, 1998, 262700], ['E0142879', 1998, 1997, 257600],
].map(([account_number, living_area, year_built, v]) => ({
  account_number, living_area, year_built, effective_year_built: null,
  appraised_value: v, market_value: v, homestead_cap_loss: 0, nhs_cap_loss: 0,
  land_value: 41000, condition_code: null, quality_class: 'R3',
  neighborhood_code: 'EP-1420', cad_id: 71, tax_year: 2026,
}));

// The medians, the basis, the cap share and BOTH narrative fields come from the
// real producers in comps.js. Hand-writing them is how the previous version of
// this script hid a renderer bug: describeAdjustments and disclosureFor return
// string[], the fixture passed a single string, and the array path was never
// exercised until it reached a customer.
const { evaluateSet, describeAdjustments, disclosureFor, STRATA } =
  await import('../../lib/tx/comps.js');

const stratum = STRATA.find((t) => t.level === 'neighborhood');
const bands = { size: 0.10, age: 15, land: 0.10 };
const evaluated = evaluateSet(parcel, comps);

const compsResult = {
  ...evaluated,
  sufficient: true,
  level: stratum.level,
  levelStrength: stratum.strength,
  comps,
  confidence: 'high',
  adjustments: describeAdjustments(stratum, bands, comps.length),
  disclosure: disclosureFor(stratum, bands, evaluated, comps.length),
};

// Three defects the owner reported on the issues step, one of them with their
// own contractor's quote, plus an incurable one to exercise the narrative block.
const { COST_TO_CURE, INCURABLE_REASONS } = await import('../../lib/costToCure.js');
const curable = Object.keys(COST_TO_CURE).filter((k) => COST_TO_CURE[k].curable !== false);
const incurable = Object.keys(COST_TO_CURE).filter((k) => COST_TO_CURE[k].curable === false);
const issues = [curable[1], curable[4], curable[7], incurable[0]].filter(Boolean);
const costOverrides = curable[4] ? { [curable[4]]: '14750' } : {};

const packet = buildProtest({
  parcel, comps: compsResult, taxYear: 2026, issues, costOverrides,
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
console.log(`  confidence       ${packet.grid.confidence} — ${packet.grid.level} tier`);
if (packet.conditionExhibit) {
  const c = packet.conditionExhibit;
  console.log(`  cost to cure     $${c.cureDollars.toLocaleString()} across ${c.priced.length} priced defect(s), ${c.narrative.length} incurable`);
  console.log(`  condition code   ${c.conditionCode || 'none on the roll'} -> ${c.conditionRisk}`);
}
console.log('');
console.log(`  wrote ${out}\n`);
