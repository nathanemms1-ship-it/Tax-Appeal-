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

/**
 * ============================================================================
 * FLORIDA'S PER-COUNTY PETITION DEADLINES
 * ============================================================================
 * Added 13 Aug 2026, when a sweep of all 67 Property Appraiser sites showed that
 * the single statewide 18 Sept this codebase had always used was Miami-Dade's
 * date, not Florida's — and was later than thirteen of the seventeen counties
 * whose 2026 date could be established. Hillsborough, which is Tampa, closes on
 * 7 Sept.
 *
 * These guard the three ways the new table can go quietly wrong.
 */
{
  const fl = await import('../lib/filingWindows.js');
  const { FL_COUNTY_DATES, FL_UNKNOWN_COUNTY_DEADLINE, PETITION_DAYS_AFTER_TRIM,
          flPetitionDeadline, getFilingWindowStatus } = fl;
  const Y = 2026;
  const iso = (d) => d.toISOString().slice(0, 10);

  // 1. A MISSPELLED KEY IS INVISIBLE. flPetitionDeadline falls back when it does
  //    not recognise a county, so "St Johns" without the full stop, or "Miami
  //    Dade" without the hyphen, silently gets the fallback and nothing complains.
  //    That is the same shape as the Miami-Dade normalisation bug this whole file
  //    was written for.
  for (const key of Object.keys(FL_COUNTY_DATES)) {
    if (!names.some((n) => n.toLowerCase() === key.toLowerCase())) {
      errors.push(`FL_COUNTY_DATES has "${key}", which is not one of the 67 county names — it will silently fall back`);
    }
  }

  // 2. THE +25 RULE IS THE REASON WE STORE MAILING DATES INSTEAD OF DEADLINES.
  //    Four counties publish both, and all four agree to the day. If that ever
  //    stops being true, every derived date in the table is suspect and the
  //    argument for deriving them collapses.
  for (const [county, published] of [['Osceola', '2026-09-08'], ['Pinellas', '2026-09-11'],
                                     ['Polk', '2026-09-11'], ['Clay', '2026-09-18']]) {
    const got = iso(flPetitionDeadline(county, Y));
    if (got !== published) {
      errors.push(`${county}: TRIM + ${PETITION_DAYS_AFTER_TRIM} gives ${got}, but the county publishes ${published} — the derivation rule no longer holds`);
    }
  }

  // 3. THE FALLBACK MUST NOT BE MORE GENEROUS THAN ANY DATE WE HAVE VERIFIED.
  //    Its entire job is to be the safe answer for a county nobody has checked.
  //    A fallback later than a known deadline is an optimistic guess wearing a
  //    conservative label.
  const fallback = flPetitionDeadline('Notarealcounty', Y);
  for (const county of Object.keys(FL_COUNTY_DATES)) {
    if (flPetitionDeadline(county, Y) < fallback) {
      errors.push(`${county} closes ${iso(flPetitionDeadline(county, Y))}, before the unknown-county fallback ${iso(fallback)} — lower FL_UNKNOWN_COUNTY_DEADLINE`);
    }
  }

  // 4. close AND hard MUST MOVE TOGETHER. The Georgia override moved close and
  //    left hardDeadline on the state value, which aimed send-letter's Lob
  //    delivery check and minDays/tooClose weeks past the real cliff. Assert the
  //    fix in both states rather than trusting it.
  for (const [state, county] of [['FL', 'Hillsborough'], ['FL', 'Levy'], ['GA', 'DeKalb'], ['GA', 'Fulton']]) {
    const w = getFilingWindowStatus(state, county);
    if (iso(w.closeDate) !== iso(w.hardDeadline)) {
      errors.push(`${state}/${county}: closeDate ${iso(w.closeDate)} and hardDeadline ${iso(w.hardDeadline)} disagree — send-letter would check Lob's delivery estimate against the wrong date`);
    }
  }

  const known = Object.keys(FL_COUNTY_DATES).length;
  console.log(`  FL deadlines:        ${known} counties dated; the other ${names.length - known} fall back to ${iso(fallback)}`);
  console.log(`                       earliest is ${iso(flPetitionDeadline('Hillsborough', Y))} (Hillsborough), not the 2026-09-18 we used to apply statewide`);
  if (known < 10) {
    errors.push(`only ${known} FL counties carry a date — this table has been emptied, not merely left incomplete`);
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
