#!/usr/bin/env node
/**
 * What actually happens to a protest, measured from a district's own records.
 *
 *   node scripts/tx/hearing-outcomes.mjs
 *   ... --dry            # compute and print, write nothing
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Until now every outcome figure on the site was somebody else's, hand-typed,
 * and ageing: HCAD's 2024 annual report (6.98% average reduction) and a 2025
 * journal paper about Dallas in 2020 (69.7% of homeowner-filed protests won).
 * Both are real, both are cited, and neither can be re-derived by the code that
 * prints them — which is the failure mode this codebase keeps paying for.
 *
 * Harris publishes `arb_hearings_real.txt`: per account, per year, the value
 * BEFORE and AFTER, and whether an agent or the owner filed. No other Texas
 * district publishes it. So the number on the page can be ours, current, and
 * regenerable.
 *
 * ============================================================================
 * THE DENOMINATOR IS THE WHOLE ARGUMENT
 * ============================================================================
 * A first pass measured 85.2% — reductions divided by accounts that HAVE A
 * HEARING RECORD. That silently drops the 31,029 A1 accounts (7.3%) that filed
 * a protest and never appear in the hearing file at all.
 *
 * A homeowner reads "85% of protests win" as "if I file, I have an 85% chance".
 * The honest denominator for that sentence is everyone who FILED, with the
 * no-record accounts counted as no reduction, which is 79.1%.
 *
 * So: numerator from arb_hearings_real.txt, denominator from real_acct.protested.
 * Never both from the hearing file.
 *
 * ============================================================================
 * MEDIAN, NOT MEAN. THE MEAN REVERSES THE FINDING.
 * ============================================================================
 * Mean cut: owner-filed $59,216, agent-filed $45,590 — which reads as "owners
 * beat the professionals by 30%" and is an artefact of a handful of enormous
 * owner-side reductions. On the median it goes the other way: agents $22,716 to
 * owners $20,912. Only medians are written here, and `meanReduction` is emitted
 * beside them purely so anyone tempted to use it can see how far apart they are.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

const acctZip = arg('acct-zip', 'tx-data/Harris/Real_acct_owner.zip');
const hearZip = arg('hear-zip', 'tx-data/Harris/Hearing_files.zip');
const cadId = Number(arg('cad', '101'));
const CLASS = arg('class', 'A1');
const OUT = 'lib/tx/hearingOutcomes.json';

const t = (v) => (v === undefined || v === null ? '' : String(v).trim());
const numOf = (v) => { const s = t(v).replace(/[$,]/g, ''); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

function memberLines(zipPath, member) {
  const p = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'ignore'] });
  return createInterface({ input: p.stdout, crlfDelay: Infinity });
}

/** The date the district built the archive, from the member timestamps. */
function archiveBuiltOn(zipPath) {
  try {
    const out = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    const dates = [...out.matchAll(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/g)].map((m) => m[1]).sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch { return null; }
}

console.log(`hearing outcomes — cad ${cadId}, class ${CLASS}\n`);

// ── 1. the denominator: every account of this class that filed a protest ─────
const filed = new Set();
let accounts = 0;
{
  const rl = memberLines(acctZip, 'real_acct.txt');
  let header = true;
  for await (const line of rl) {
    if (!line) continue;
    if (header) { header = false; continue; }
    const f = line.split('\t');
    if (f.length !== 71) continue;
    if (t(f[20]).toUpperCase() !== CLASS) continue;
    accounts++;
    if (t(f[61]).toUpperCase() === 'Y') filed.add(t(f[0]));
  }
  console.log(`  ${CLASS} accounts on the roll : ${accounts.toLocaleString()}`);
  console.log(`  ...that filed a protest     : ${filed.size.toLocaleString()} (${round1(100 * filed.size / accounts)}%)`);
}

// ── 2. the numerator: the best outcome recorded for each of those accounts ───
const best = new Map();
let taxYear = null;
const yearSeen = new Set();
{
  const rl = memberLines(hearZip, 'arb_hearings_real.txt');
  let header = true;
  for await (const line of rl) {
    if (!line) continue;
    if (header) { header = false; continue; }
    const f = line.split('\t');
    if (f.length !== 15) continue;
    const acct = t(f[0]);
    if (!filed.has(acct)) continue;
    yearSeen.add(t(f[1]));
    const before = numOf(f[11]);
    const after = numOf(f[13]);
    if (before === null || after === null || before <= 0 || after < 0) continue;
    const cut = before - after;
    // An account can carry several hearing rows. Keep the outcome that actually
    // stood — the largest reduction — rather than whichever line came last.
    const prior = best.get(acct);
    if (!prior || cut > prior.cut) {
      best.set(acct, { cut, before, by: t(f[10]).toUpperCase() === 'AGENT' ? 'agent' : 'owner' });
    }
  }
  taxYear = yearSeen.size === 1 ? Number([...yearSeen][0]) : null;
}

const heard = best.size;
const noRecord = filed.size - heard;
const cuts = [];
const pcts = [];
const by = { owner: { heard: 0, reduced: 0 }, agent: { heard: 0, reduced: 0 } };
for (const v of best.values()) {
  by[v.by].heard++;
  if (v.cut > 0) { by[v.by].reduced++; cuts.push(v.cut); pcts.push(v.cut / v.before); }
}
const reduced = cuts.length;

console.log(`  ...with a hearing record    : ${heard.toLocaleString()} (${round1(100 * heard / filed.size)}%)`);
console.log(`  ...filed but no record      : ${noRecord.toLocaleString()} — counted as NO reduction`);
console.log(`  reductions                  : ${reduced.toLocaleString()}`);
console.log(`\n  RATE ON EVERYONE WHO FILED  : ${round1(100 * reduced / filed.size)}%`);
console.log(`  median reduction            : $${median(cuts).toLocaleString()}`);
console.log(`  mean reduction              : $${Math.round(cuts.reduce((a, b) => a + b, 0) / reduced).toLocaleString()}  <- do not publish this`);
console.log(`  median as % of value        : ${round2(100 * median(pcts))}%`);
for (const k of ['owner', 'agent']) {
  console.log(`  ${k}-filed and heard${' '.repeat(k === 'owner' ? 10 : 10)}: ${by[k].heard.toLocaleString()}, reduced ${by[k].reduced.toLocaleString()}`
    + ` (${round1(100 * by[k].reduced / by[k].heard)}%)`);
}

// ── 3. refuse to write something that cannot be defended ─────────────────────
const problems = [];
if (!taxYear) problems.push(`the hearing file carries ${yearSeen.size} tax years (${[...yearSeen].join(', ')}) — one figure cannot describe them.`);
if (heard > filed.size) problems.push('more hearing records than accounts that filed — the join is wrong.');
if (!reduced) problems.push('zero reductions found, which is not a real outcome — the value columns did not parse.');
if (filed.size / accounts > 0.9) problems.push(`${round1(100 * filed.size / accounts)}% of accounts recorded as protesting — implausible, check the protested column.`);
if (problems.length) {
  console.error('\n✗ NOT WRITING\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

const stats = {
  taxYear,
  stateClass: CLASS,
  accounts,
  filed: filed.size,
  filedPctOfClass: round1(100 * filed.size / accounts),
  withHearingRecord: heard,
  filedWithNoHearingRecord: noRecord,
  reduced,
  /** THE headline. Denominator is everyone who filed. */
  reducedPctOfFiled: round1(100 * reduced / filed.size),
  medianReduction: Math.round(median(cuts)),
  medianReductionPctOfValue: round2(100 * median(pcts)),
  meanReduction: Math.round(cuts.reduce((a, b) => a + b, 0) / reduced),
  ownerFiled: { heard: by.owner.heard, reduced: by.owner.reduced, reducedPct: round1(100 * by.owner.reduced / by.owner.heard) },
  agentFiled: { heard: by.agent.heard, reduced: by.agent.reduced, reducedPct: round1(100 * by.agent.reduced / by.agent.heard) },
  source: 'Harris Central Appraisal District, arb_hearings_real.txt (Hearing_files.zip)',
  sourceBuiltOn: archiveBuiltOn(hearZip),
  basis: 'Denominator is every account of this class with protested=Y on the roll. '
    + 'Accounts that filed and have no hearing record count as NO reduction. '
    + 'Numerator is accounts whose largest recorded hearing outcome lowered the appraised value.',
  computedAt: new Date().toISOString().slice(0, 10),
};

let existing = {};
try { existing = JSON.parse(readFileSync(OUT, 'utf8')).districts || {}; } catch { /* first run */ }
const payload = {
  _comment: 'Generated by scripts/tx/hearing-outcomes.mjs. Do not hand-edit — rerun the script.',
  generatedAt: new Date().toISOString().slice(0, 10),
  districts: { ...existing, [String(cadId)]: stats },
};

if (has('dry')) {
  console.log(`\n--dry: nothing written.\n`);
} else {
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  writeFileSync(
    OUT.replace(/\.json$/, '.js'),
    '// GENERATED by scripts/tx/hearing-outcomes.mjs — do not edit.\n'
    + '// Outcome figures published on county pages. Re-run after each roll refresh.\n'
    + `export default ${JSON.stringify(payload, null, 2)};\n`,
  );
  // BOTH paths, every time. See the 9 Sept countyStats incident.
  console.log(`\n✓ wrote BOTH twins:`);
  console.log(`    ${OUT}`);
  console.log(`    ${OUT.replace(/\.json$/, '.js')}   ← this is the one pages import`);
  console.log('\n  Commit BOTH. These numbers go on public pages.\n');
}
