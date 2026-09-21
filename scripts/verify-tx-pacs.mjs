/**
 * isLivingArea() IS THE MOST LOAD-BEARING UNTESTED FUNCTION IN THE REPO.
 *
 * It decides, for every improvement segment in every PACS export, whether that
 * segment counts towards a property's living area. Living area is the
 * denominator of appraised-value-per-square-foot, which is the whole of the
 * s 41.43(b)(3) unequal-appraisal case. Understate it and a property looks MORE
 * over-assessed than it is, which is the direction where we file a confident
 * weak case.
 *
 * It has been wrong three times, each caught only because a district loaded
 * visibly wrong:
 *
 *   7 Sept  El Paso    62,385 properties (~21%) understated by ~30%
 *   9 Sept  Tarrant    99.1% of 1.4M parcels loaded with NO living area
 *  20 Sept  Denton     36,798 properties (11.4%) understated, median 8.4%
 *
 * Nothing in the build would have caught any of them, and nothing would catch
 * a regression that undid the fixes. This locks the verdicts down.
 *
 * EVERY PAIR BELOW IS A REAL code|description OBSERVED IN A REAL EXPORT, with
 * the district's own imprv_det_val / imprv_det_area rate recorded next to it.
 * The rate is the district's own statement of what the segment is. Do not add a
 * row here from judgement; measure it first, the way lib/tx/pacs.js documents.
 */
import { readFileSync } from 'node:fs';
import { isLivingArea, LIVING_AREA_CODES } from '../lib/tx/pacs.js';

let pass = 0;
const fail = [];
const ok = (cond, label) => {
  if (cond) { pass++; return; }
  fail.push(label);
  console.log('  ✗', label);
};

// district, code, description, expected, rate, % of that district's main area
const TABLE = [
  // ---- EL PASO. Reference: MA MAIN AREA $97.37.
  ['El Paso', 'MA', 'MAIN AREA', true, '$97.37', 'reference'],
  ['El Paso', 'ME', 'ENCLOSED', true, '$98.77', '101%'],
  ['El Paso', 'M+', 'ADDITION', true, '$92.55', '95%'],
  ['El Paso', 'ME-', 'ENCLOSED', true, '$70.73', '73%'],
  ['El Paso', 'M-', 'ADDITION (NO HEAT OR AIR)', false, '$62.45', 'unconditioned'],
  ['El Paso', 'G', 'GARAGE', false, '$55.73', '57%'],
  ['El Paso', 'O', 'OPEN PORCH', false, '$25.04', '26%'],
  // THE REASON 'BONUS ROO' NEEDS A 'DET. BONUS' EXCLUDE. Denton prices a bonus
  // room above its own main area; El Paso prices a detached one at a quarter of
  // it. 1,217 segments on 1,117 properties, 92 with no other living area.
  ['El Paso', 'BR', 'DET. BONUS ROOM', false, '$28.10', '28%'],
  ['El Paso', 'BRU', 'DET. UPPER BONUS ROOM', false, '$27.21', '27%'],
  ['El Paso', 'DG', 'DETACHED GARAGE', false, '$25.80', 'GARAGE excludes'],

  // ---- TARRANT. Reference: ResMain $86.23. Descriptions have no word break
  // before "Main", which is why RESMAIN is in LIVING_AREA_CODES.
  ['Tarrant', 'RESMAIN', 'ResMain', true, '$86.23', 'reference'],
  ['Tarrant', 'RESADDN', 'ResAddn', true, '$92.19', '107%'],
  ['Tarrant', 'RESCONVGAR', 'ResConvGar', true, '$76.19', '88%'],
  ['Tarrant', 'RESS', 'Studio', false, '$63.38', '73%, deliberately out'],
  ['Tarrant', 'RESER', 'Enclosed Room', false, '$34.41', '40%'],
  ['Tarrant', 'RESEP', 'Enclosed Porch', false, '$30.28', '35%'],
  ['Tarrant', 'RESDG', 'Detached Garage', false, '$32.41', '38%'],
  ['Tarrant', 'RESG', 'Garage', false, '$32.03', '37%'],

  // ---- DENTON. Reference: MA Main Area $117.91.
  ['Denton', 'MA', 'Main Area', true, '$117.91', 'reference'],
  ['Denton', 'BR', 'Bonus Room', true, '$128.40', '109%, 48,355 segments'],
  ['Denton', 'MA2', 'Second Floor', true, '$115.77', '98%'],
  ['Denton', 'MA3', 'Third Floor', true, '$112.11', '95%'],
  ['Denton', 'BH', 'Bath House / Pool House', false, '$109.70', '93%, POOL excludes'],
  ['Denton', 'DL', 'Detached Living', true, '$95.47', '81%'],
  ['Denton', 'AA', 'Attached Addition', true, '$80.28', '68%'],
  ['Denton', 'EG', 'Enclosed Garage', false, '$64.36', '55%'],
  ['Denton', 'AG', 'Attached Garage', false, '$51.57', '44%'],

  // ---- KAUFMAN. Reference: LA LIVING AREA $99.43.
  ['Kaufman', 'LA', 'LIVING AREA', true, '$99.43', 'reference'],
  ['Kaufman', 'STR2', '2ND STORY LIVING AREA', true, '$101.03', '102%'],
  ['Kaufman', 'ADNA', 'Addition, Average', true, '$76.14', '77%'],
  ['Kaufman', 'AGF2', 'Attached Garage, Finished', false, '$37.72', '38%'],
  ['Kaufman', 'SP', 'Porch, Screened', false, '$48.80', '49%'],

  // ---- WICHITA. Reference: LV LIVING AREA $80.64.
  ['Wichita', 'LV', 'LIVING AREA', true, '$80.64', 'reference'],
  ['Wichita', 'LV15', '1.5 STORY LV', true, '$110.06', '136%'],
  ['Wichita', 'LV20', '2 STORY LV', true, '$102.16', '127%'],
  ['Wichita', 'LVS', '2nd structure/living quar', true, '$27.97', '35%, truncated desc'],
  ['Wichita', 'AGBR', 'ATTACHED GARAGE/BONUS ROO', false, '$21.50', 'GARAGE beats BONUS ROO'],
  ['Wichita', 'PEP', 'ENCLOSED PORCH', false, '$35.51', '44%'],
  ['Wichita', 'RCAB', 'CABANA - POOL HOUSE', false, '$59.88', '74%, POOL excludes'],

  // ---- NUECES. Reference: MA MAIN AREA $88.43.
  ['Nueces', 'MA', 'MAIN AREA', true, '$88.43', 'reference'],
  ['Nueces', 'MA2', 'MAIN AREA SECOND FLOOR', true, '$103.55', '117%'],
  ['Nueces', 'LQ', 'LIVING QUARTERS', true, '$43.56', '49%, name governs'],
  ['Nueces', 'STRG', 'STORAGE MAIN AREA', false, '$22.87', 'STORAGE beats MAIN AREA'],
  ['Nueces', 'BRN', 'BARN', false, '$6.44', 'BARN'],
  // THE REASON 'BR' IS NOT IN LIVING_AREA_CODES. Denton's BR is a bonus room;
  // Nueces's BR is a boat ramp. Only the description separates them.
  ['Nueces', 'BR', 'BOAT RAMP', false, '$4500.00', 'same code, opposite meaning'],
  // ASSISTED LIVING is a nursing home, not a house. It matches '\bLIVING\b' and
  // so counts as living area, which is harmless only because it appears on 12
  // commercial parcels that residentialOnly parsing drops before this is reached.
  // Recorded so the verdict is a known one rather than a surprise later.
  ['Nueces', 'AL', 'ASSISTED LIVING', true, '$128.82', '146%, commercial'],
  ['Nueces', 'DGF', 'DETACHED GAR - FRAME OR F', false, '$26.15', 'GARAGE excludes'],

  // ---- JEFFERSON.
  ['Jefferson', 'OLA', 'OUTDOOR LIVING AREA', false, '$75.98', 'OUTDOOR excludes'],
  ['Jefferson', 'ENP', 'ENCLOSED PORCH/PATIO', false, '$18.73', 'PORCH excludes'],

  // ---- TAYLOR. Reference: MA MAIN AREA $94.89.
  ['Taylor', 'MA', 'MAIN AREA', true, '$94.89', 'reference'],
  ['Taylor', 'MA2', 'MAIN AREA (2ND FLOOR)', true, '$106.01', '112%'],
  ['Taylor', 'DS', 'DETACHED STORAGE', false, '$14.81', 'STORAGE excludes'],
  // 111% of main area and still not a room. Never counted, before or after the
  // OUTDOOR exclude, because no include pattern reaches it -- asserted so that
  // stays true if someone widens the patterns again.
  ['Taylor', 'KP', 'OUTDOOR KITCHEN', false, '$105.66', '111%, not a room'],
];

console.log('A. district truth table (measured, not judged)');
for (const [district, code, desc, expected, rate, why] of TABLE) {
  const got = isLivingArea(code, desc);
  ok(got === expected,
    `${district} ${code} "${desc}" (${rate}, ${why}) should be ${expected ? 'LIVING' : 'not living'}, got ${got}`);
}

console.log('B. exclude is tested before include');
// Both halves of each pair match an INCLUDE pattern. The EXCLUDE has to win.
for (const desc of [
  'ENCLOSED PORCH', 'LIVING AREA GARAGE', 'MAIN AREA STORAGE', 'OUTDOOR LIVING AREA',
  'ADDITION (NO HEAT)', 'UNFINISHED LIVING AREA', 'MAIN AREA - COMMERCIAL',
  'BONUS ROOM OVER GARAGE', 'LIVING AREA PATIO', 'BARNDO LIVING AREA',
  'DET. BONUS ROOM', 'DETACHED BONUS ROOM', 'DET. UPPER BONUS ROOM',
]) {
  ok(isLivingArea('XX', desc) === false, `"${desc}" must not be living area`);
}

console.log('C. code fallback when a district ships a blank description');
ok(isLivingArea('MA', '') === true, 'MA with no description is living area');
ok(isLivingArea('MA2', '') === true, 'MA2 stems to MA');
ok(isLivingArea('LV15', '') === true, 'LV15 stems to LV');
ok(isLivingArea('RESMAIN', '') === true, 'RESMAIN is a code, not a description match');
ok(isLivingArea('AG', '') === false, 'AG with no description is not living area');
ok(isLivingArea('ZZQ', '') === false, 'an unknown code with no description is not living area');
ok(isLivingArea('', '') === false, 'nothing is not living area');
ok(isLivingArea(null, null) === false, 'null is not living area');
ok(isLivingArea(undefined, undefined) === false, 'undefined is not living area');

console.log('D. input shape');
ok(isLivingArea('  ma  ', '') === true, 'code is trimmed and upper-cased');
ok(isLivingArea('ma', '') === true, 'lower-case code matches');
ok(isLivingArea('XX', '  main area  ') === true, 'description is trimmed');
ok(isLivingArea('XX', 'Main Area') === true, 'description match is case-insensitive');

console.log('E. the trap codes stay out of LIVING_AREA_CODES');
// A code in this set matches in EVERY district, including ones whose export we
// have never seen. Anything ambiguous across districts belongs in
// LIVING_INCLUDE where the description can still veto it.
for (const trap of ['BR', 'DL', 'BH', 'AA', 'EG', 'AG', 'G', 'O', 'BRN', 'OLA', 'RESS']) {
  ok(!LIVING_AREA_CODES.has(trap),
    `${trap} must not be in LIVING_AREA_CODES (it means different things in different districts)`);
}
for (const c of LIVING_AREA_CODES) {
  ok(c === c.toUpperCase(), `LIVING_AREA_CODES entry "${c}" must be upper-case (lookup upper-cases)`);
  ok(!/[0-9]$/.test(c) || LIVING_AREA_CODES.has(c.replace(/[0-9]+$/, '')),
    `LIVING_AREA_CODES entry "${c}" ends in a digit, so its stem must be in the set too`);
}

console.log('F. the measurements survive in the source');
const src = readFileSync(new URL('../lib/tx/pacs.js', import.meta.url), 'utf8');
for (const needle of [
  '$97.37',   // El Paso main area
  '$86.23',   // Tarrant ResMain
  '$117.91',  // Denton main area
  '$128.40',  // Denton bonus room
  '$28.10',   // El Paso's detached bonus room, why 'BONUS ROO' needs an exclude
  'BONUS ROO',
  'OUTDOOR LIVING AREA',
  'BOAT',     // why BR is not a code
]) {
  ok(src.includes(needle), `lib/tx/pacs.js must still record ${needle}`);
}

console.log('');
if (fail.length) {
  console.log(`FAILED: ${fail.length} of ${pass + fail.length}`);
  process.exit(1);
}
console.log(`${pass} assertions passed`);
