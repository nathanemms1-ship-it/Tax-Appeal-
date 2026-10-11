/**
 * try-comps.mjs — run the real Kit comps engine (lib/kit/comps.js) on ONE
 * address and print what the kit's evidence page would show. 2–3 RentCast calls.
 *
 *   node scripts/kit/try-comps.mjs "123 Main St, Marietta, GA 30060"
 *   node scripts/kit/try-comps.mjs "123 Main St, Marietta, GA 30060" --value 450000
 *
 * --value is the home's CURRENT full market value (from the county or the
 * notice). Without it, the script shows the comps and the value they indicate
 * but gives no over-assessed verdict. RentCast's own "assessed value" is not
 * used for that: in Georgia it is the 40% figure and often a year old.
 */
import { register } from 'node:module';
import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
register('../resolve-extensionless.mjs', import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const { findKitComps, caseCheck, evidenceRows } = await import('../../lib/kit/comps.js');

function keyFromEnvFile() {
  for (const f of ['.env.local', '.env']) {
    const p = join(REPO, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^\s*RENTCAST_API_KEY\s*=\s*"?([^"\n\r]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}
async function promptSecret(q) {
  if (!process.stdin.isTTY) return null;
  process.stdout.write(q + '\n> ');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  try { return ((await new Promise((res) => rl.question('', res))) || '').trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}
const money = (n) => (n == null ? '-' : '$' + Math.round(n).toLocaleString('en-US'));

const address = process.argv[2];
if (!address || address.startsWith('--')) { console.error('Usage: node scripts/kit/try-comps.mjs "street, city, ST zip" [--value 450000]'); process.exit(1); }
const vi = process.argv.indexOf('--value');
const currentValue = vi > 0 ? Number(process.argv[vi + 1]) : null;

process.env.RENTCAST_API_KEY = process.env.RENTCAST_API_KEY || keyFromEnvFile() || await promptSecret('RentCast API key (typing hidden):');
if (!process.env.RENTCAST_API_KEY) { console.error('No RentCast key.'); process.exit(1); }

// The home itself: one call.
const u = new URL('https://api.rentcast.io/v1/properties');
u.searchParams.set('address', address);
const res = await fetch(u, { headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY, Accept: 'application/json' } });
if (res.status === 404) { console.error('RentCast has no record for that address. The kit would ask the customer for their details.'); process.exit(1); }
if (!res.ok) { console.error(`RentCast returned ${res.status}`); process.exit(1); }
const rec = (await res.json())[0];
const subject = {
  address: rec.formattedAddress, parcelId: rec.assessorID ? String(rec.assessorID).trim() : null,
  lat: rec.latitude, lon: rec.longitude, sqft: rec.squareFootage, yearBuilt: rec.yearBuilt, propertyType: rec.propertyType,
};
console.log(`\n${subject.address}`);
console.log(`  ${subject.sqft ?? '?'} sqft, built ${subject.yearBuilt ?? '?'}, ${subject.propertyType ?? '?'}, parcel ${subject.parcelId ?? '?'}`);

const out = await findKitComps(subject);
if (!out.ok) {
  console.log(`\n  Not enough comparable sales (${out.reason}). Best attempt: ${out.comps?.length ?? 0} within ${out.radiusMi ?? '-'} mi.`);
  console.log('  The kit would NOT be sold for this home.');
} else {
  console.log(`\n  Comps found at step ${out.step}: within ${out.radiusMi} mi, sold in the last ${out.days} days (${out.candidates} candidates, best ${out.comps.length} used).`);
  console.log('  Address'.padEnd(46) + 'Sold        Price       Sqft   $/sqft  Built  Miles');
  for (const r of evidenceRows(out)) {
    console.log('  ' + String(r.address).slice(0, 43).padEnd(44) + `${r.saleDate}  ${money(r.price).padEnd(11)} ${String(r.sqft).padEnd(6)} ${String(r.ppsf).padEnd(7)} ${String(r.yearBuilt ?? '-').padEnd(6)} ${r.distanceMi}${r.olderThan12Months ? '  (over 12 mo)' : ''}`);
  }
  console.log(`\n  Median $/sqft ${out.indicated.ppsf} x ${subject.sqft} sqft = sales-indicated value ${money(out.indicated.value)}`);
  if (currentValue) {
    const c = caseCheck(currentValue, out.indicated);
    console.log(c.verdict === 'over_assessed'
      ? `  Current value ${money(currentValue)} is ${c.overByPct}% over: OVER-ASSESSED. Requested value ${money(c.requestedValue)}.`
      : `  Current value ${money(currentValue)} is ${c.overByPct}% vs the sales value: FAIR, no case.`);
    console.log('  (Whether that lowers the tax bill is the separate savings check: caps, homestead, millage.)');
  } else {
    console.log('  Add --value <current full market value> for the over-assessed verdict.');
  }
}
console.log(`\nRentCast calls: ${1 + (out.calls || 0)}`);
