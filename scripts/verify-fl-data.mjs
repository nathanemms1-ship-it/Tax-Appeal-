#!/usr/bin/env node
/**
 * Florida data integrity check. Run with: npm run verify:fl
 *
 * WHY THIS EXISTS: county normalization silently broke Miami-Dade — Florida's
 * largest county. The title-case regex matched each whitespace-delimited token
 * rather than each alpha run, so the hyphen was swallowed and "Miami-Dade"
 * normalized to "Miami-dade" — which matched no key
 * in either lookup table. getFlVabAddress returned null, and the safety gate that
 * blocks unverified counties hard-blocked Miami-Dade at checkout.
 *
 * It failed CLOSED, so nothing crashed and no log line appeared. It surfaced only
 * because the endpoint was exercised directly against production. This script
 * makes that class of failure loud.
 */
import ADDR, { getFlVabAddress, getFlVabAddressRaw } from '../lib/flVabAddresses.js';
import { getFlVabFee } from '../lib/flCountyFees.js';

const FL_COUNTY_COUNT = 67;
const names = Object.keys(ADDR);
const errors = [];
const warnings = [];

if (names.length !== FL_COUNTY_COUNT) {
  errors.push(`Expected ${FL_COUNTY_COUNT} counties in flVabAddresses, found ${names.length}`);
}

for (const name of names) {
  const raw = getFlVabAddressRaw(name);
  const addr = getFlVabAddress(name);
  const fee = getFlVabFee(name);

  // A confirmed county that will not resolve is the Miami-Dade failure mode.
  if (raw?.confidence === 'confirmed' && !addr) {
    errors.push(`${name}: marked confirmed but getFlVabAddress() returns null — normalization bug`);
  }
  // Every county must have a fee entry, confirmed or not.
  if (!fee || !fee.vabFee || fee.vabFee <= 0) {
    errors.push(`${name}: no VAB fee`);
  }
  // Confirmed address + estimated fee => send-letter refuses. Sellable but blocked.
  if (raw?.confidence === 'confirmed' && fee.confidence !== 'confirmed') {
    warnings.push(`${name}: address confirmed but fee is ${fee.confidence} — orders will be refused at mail time`);
  }
  if (addr && (!addr.street || !addr.city || !addr.zip || !addr.vabName)) {
    errors.push(`${name}: confirmed address is incomplete`);
  }
}

// Case and format variants must all land on the same entry.
for (const [variant, expected] of [
  ['Miami-Dade', true], ['MIAMI-DADE', true], ['miami-dade County', true],
  ['Palm Beach', true], ['st. johns', true], ['ORANGE', true], ['Indian River', true],
  ['Nowhere', false],
]) {
  const resolved = !!getFlVabAddress(variant);
  if (resolved !== expected) {
    errors.push(`Normalization: "${variant}" ${resolved ? 'resolved' : 'did not resolve'}, expected the opposite`);
  }
}

const blocked = names.filter(n => getFlVabAddressRaw(n)?.confidence !== 'confirmed');
console.log(`Florida data check — ${names.length} counties`);
console.log(`  sellable:            ${names.length - blocked.length - warnings.length}`);
console.log(`  blocked (unverified address): ${blocked.length}${blocked.length ? ' — ' + blocked.join(', ') : ''}`);
warnings.forEach(w => console.log(`  WARN  ${w}`));

if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  errors.forEach(e => console.error(`  ✗ ${e}`));
  process.exit(1);
}
console.log('\n✓ all confirmed counties resolve');
