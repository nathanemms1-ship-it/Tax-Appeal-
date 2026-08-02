#!/usr/bin/env node
/**
 * Enforce the valuation contract on every build, for every state.
 *
 * Three things must always be true, in all five states and every future one:
 *
 *   1. There is ALWAYS a reduction request. A property with no comparable sales,
 *      no reported defects and no record errors still gets an ask at the floor of
 *      the band. "No comps, so no ask" would lose the customer, which is the
 *      opposite of the point.
 *   2. The ask is NEVER BELOW the floor (18%). Reporting a defect must not
 *      shrink someone's ask below what staying silent would have got them.
 *      There is deliberately no ceiling any more: cost to cure replaced the
 *      18-22% clamp, and clamping now would mean discarding sourced evidence.
 *      What IS enforced is that anything above the floor is backed by evidence —
 *      `askRestsOn` must say 'evidence' whenever the ask exceeds the floor, and
 *      must say 'mass_appraisal_floor' when the ask IS the floor. That field
 *      decides what the petition credits the number to, and crediting a large ask
 *      to a small repair bill is what loses a hearing.
 *   3. There is ALWAYS at least one stated statutory ground. The owner signs the
 *      filing — in Florida under penalties of perjury — so the number must have a
 *      reason attached that is true.
 *
 * Also asserts the result is DETERMINISTIC. The previous implementation used
 * Math.random(), so the same property produced a different ask on reload and there
 * was no answer to "how did you get this number".
 *
 * Runs from `npm run build`. Add a state to STATE_GROUNDS and it is covered here
 * automatically — that is the point of keeping the logic state-agnostic.
 */

import { deriveValuation, buildCategoryIndex, BAND, STATE_GROUNDS } from '../lib/valuation.js';

const CATEGORIES = [
  { category: 'Structural & Major Systems', issues: ['Foundation cracks', 'Roof damage', 'Major water damage', 'Mold'] },
  { category: 'Safety, Health & Code', issues: ['Code violations', 'Asbestos'] },
  { category: 'Functional & Livability', issues: ['Cramped rooms'] },
  { category: 'Exterior & Site', issues: ['Poor drainage'] },
  { category: 'Appearance & Maintenance', issues: ['Deferred maintenance', 'Dated kitchen'] },
];
const categoryOf = buildCategoryIndex(CATEGORIES);

const SCENARIOS = [
  { label: 'no data at all', input: { assessedValue: 400000 } },
  { label: 'no assessed value', input: { assessedValue: null } },
  { label: 'single cosmetic defect', input: { assessedValue: 400000, issues: ['Deferred maintenance'] } },
  { label: 'many severe defects', input: { assessedValue: 400000, issues: ['Foundation cracks', 'Roof damage', 'Major water damage', 'Mold', 'Code violations', 'Asbestos'] } },
  { label: 'small market gap', input: { assessedValue: 400000, marketValue: 388000 } },
  { label: 'huge market gap', input: { assessedValue: 400000, marketValue: 200000 } },
  { label: 'market value ABOVE assessed', input: { assessedValue: 400000, marketValue: 520000 } },
  { label: 'record error only', input: { assessedValue: 400000, corrections: { sqft: 2400, countySqft: 3100 } } },
  { label: 'all record fields wrong', input: { assessedValue: 400000, corrections: { sqft: 2400, countySqft: 3100, beds: 3, countyBeds: 4, baths: 2, countyBaths: 3, yearBuilt: 1972, countyYearBuilt: 1998 } } },
  { label: 'everything at once', input: { assessedValue: 400000, marketValue: 340000, issues: ['Foundation cracks', 'Code violations'], corrections: { sqft: 2400, countySqft: 3100 } } },
  { label: 'unknown issue category', input: { assessedValue: 400000, issues: ['Something not in the list'] } },
  { label: 'zero assessed value', input: { assessedValue: 0 } },
];

const states = Object.keys(STATE_GROUNDS);
let failures = 0;
let checks = 0;

console.log(`Valuation contract — ${states.length} states x ${SCENARIOS.length} scenarios`);

for (const stateCode of states) {
  for (const { label, input } of SCENARIOS) {
    const r = deriveValuation({ stateCode, categoryOf, ...input });
    const problems = [];

    // 2. never below the floor, and correctly attributed above it
    if (!(r.reductionPct >= BAND.floor - 1e-9)) {
      problems.push(`reductionPct ${r.reductionPct} below the floor ${BAND.floor}`);
    }
    if (r.askRestsOn !== 'evidence' && r.askRestsOn !== 'mass_appraisal_floor') {
      problems.push(`askRestsOn is "${r.askRestsOn}" — the letter would not know what to credit`);
    }
    if (r.askRestsOn === 'mass_appraisal_floor' && Math.abs(r.reductionPct - BAND.floor) > 1e-9) {
      problems.push(`ask rests on the floor but is ${r.reductionPct}, not ${BAND.floor}`);
    }
    if (r.askRestsOn === 'evidence' && !(r.reductionPct > BAND.floor - 1e-9)) {
      problems.push(`ask claims to rest on evidence but is only ${r.reductionPct}`);
    }

    // 3. always at least one stated ground, and every ground must cite a statute
    if (!Array.isArray(r.grounds) || r.grounds.length === 0) {
      problems.push('no statutory grounds returned');
    } else {
      for (const g of r.grounds) {
        if (!g.criterion || !String(g.criterion).trim()) problems.push('a ground has no statutory citation');
        if (!g.basis || !String(g.basis).trim()) problems.push('a ground has no stated basis');
      }
    }
    if (!r.basisSummary || !String(r.basisSummary).trim()) problems.push('empty basisSummary');

    // 1. always an ask, whenever there is an assessed value to reduce
    const assessed = Number(input.assessedValue) || 0;
    if (assessed > 0) {
      if (!r.requestedValue) problems.push('no requestedValue despite an assessed value');
      else if (!(r.requestedValue < assessed)) problems.push(`requestedValue ${r.requestedValue} is not below assessed ${assessed}`);
    }

    // Never argue the Florida eighth criterion — double counting on a sworn form.
    if (/193\.011\(8\)|cost(s)? of sale|eighth criterion/i.test(r.basisSummary)) {
      problems.push('basis invokes the eighth criterion / costs of sale');
    }

    checks++;
    if (problems.length) {
      failures++;
      console.error(`  FAIL  ${stateCode} / ${label}`);
      for (const p of problems) console.error(`          ${p}`);
    }
  }
}

// Determinism: the same input must never produce two different asks.
for (const stateCode of states) {
  const mk = () => deriveValuation({
    stateCode, assessedValue: 437500, marketValue: 401000,
    issues: ['Roof damage', 'Deferred maintenance'], categoryOf,
    corrections: { sqft: 2210, countySqft: 2640 },
  });
  const a = mk(), b = mk(), c = mk();
  checks++;
  if (!(a.reductionPct === b.reductionPct && b.reductionPct === c.reductionPct)) {
    failures++;
    console.error(`  FAIL  ${stateCode}: not deterministic — ${a.reductionPct}, ${b.reductionPct}, ${c.reductionPct}`);
  }
}

if (failures) {
  console.error(`\nValuation contract failed: ${failures} of ${checks} checks.\n`);
  process.exit(1);
}
console.log(`\n✓ ${checks} checks passed — always an ask, never below the floor, correctly attributed, always a stated ground, deterministic`);
