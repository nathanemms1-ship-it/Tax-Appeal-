/**
 * ga-kit-proof.mjs — build the REAL Georgia kit (lib/kit/gaKit.js) from a sample
 * order and render it through Lob TEST mode. Nothing is printed, mailed or charged.
 *
 *   node scripts/kit/ga-kit-proof.mjs --pdf-only     just write the PDF, no Lob call
 *   node scripts/kit/ga-kit-proof.mjs                send to Lob test mode, save Lob's proof
 *   node scripts/kit/ga-kit-proof.mjs --order path/to/order.json
 *
 * The kit is built in PROOF mode: the county address may be unconfirmed and every
 * page is stamped "SAMPLE - NOT FOR FILING". Production never uses proof mode.
 *
 * Key: LOB_TEST_API_KEY from the environment or .env.local, else asked for with
 * typing hidden. Live keys are refused.
 * Output: scripts/kit/out/ga-kit-<time>.pdf (ours) and ga-kit-proof-<time>.pdf (Lob's).
 */
import { register } from 'node:module';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
register('../resolve-extensionless.mjs', import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT_DIR = join(HERE, 'out');
const { buildGaKit } = await import('../../lib/kit/gaKit.js');
const { getAppealAddress } = await import('../../lib/appealAddresses.js');
const { gaSavings } = await import('../../lib/ga/savings.js');

// Our return address: lib/businessInfo.js BUSINESS_ADDRESS_LINES.
const FROM = { name: 'TaxAppeal USA', address_line1: '3130 Sabine St, Ste B', address_city: 'Forest Hill', address_state: 'TX', address_zip: '76119' };

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
function keyFromEnvFile() {
  for (const f of ['.env.local', '.env']) {
    const p = join(REPO, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^\s*LOB_TEST_API_KEY\s*=\s*"?([^"\n\r]+)"?\s*$/m);
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const orderPath = resolve(String(arg('order', join(HERE, 'sample-order-GA.json'))));
const order = JSON.parse(readFileSync(orderPath, 'utf8'));
order.countyAddress = order.countyAddress || getAppealAddress('GA', order.property.county);
if (!order.savings && order.homestead !== undefined) {
  order.savings = gaSavings({ county: order.property.county, homestead: order.homestead, reduction: order.noticeValue - order.requestedValue, price: 79, taxYear: order.taxYear });
}
const kit = await buildGaKit(order, { proof: true });
mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ours = join(OUT_DIR, `ga-kit-${stamp}.pdf`);
writeFileSync(ours, kit.pdf);
console.log(`\nBuilt the Georgia kit: ${kit.layout.pages} pages, ${kit.layout.sheets} sheets.`);
console.log(`  appeal form:   ${kit.form.label} (${kit.form.revision})`);
console.log(`  county window: ${kit.envelope.join(' / ')}`);
console.log(`  deadline:      ${kit.deadline ? kit.deadline.toISOString().slice(0, 10) : 'from the notice date'}`);
console.log(`  saved:         ${ours}`);
if (arg('pdf-only', false)) process.exit(0);

let key = process.env.LOB_TEST_API_KEY || keyFromEnvFile();
if (!key) key = await promptSecret('Lob TEST API key, starts with test_ (typing hidden): ');
key = String(key || '').replace(/^['"]|['"]$/g, '').trim();
if (!key.startsWith('test_')) {
  console.error(key.startsWith('live_') ? 'Refusing: that is a LIVE Lob key. This needs the TEST secret key (starts with "test_").' : 'Refusing: no Lob TEST key (starts with "test_").');
  process.exit(1);
}

// Lob takes a PDF as a multipart upload; nested fields use bracket names.
const form = new FormData();
form.append('description', `GA KIT PROOF ${stamp}`);
for (const [k, v] of Object.entries({ name: order.owner.name, address_line1: order.owner.street, address_city: order.owner.city, address_state: order.owner.state, address_zip: order.owner.zip })) form.append(`to[${k}]`, v);
for (const [k, v] of Object.entries(FROM)) form.append(`from[${k}]`, v);
for (const [k, v] of Object.entries(kit.lob)) form.append(k, String(v));
form.append('metadata[kind]', 'ga_kit_proof');
form.append('file', new Blob([kit.pdf], { type: 'application/pdf' }), 'kit.pdf');

const res = await fetch('https://api.lob.com/v1/letters', {
  method: 'POST', headers: { Authorization: `Basic ${Buffer.from(key + ':').toString('base64')}` }, body: form,
});
const data = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`Lob refused the letter (${res.status}): ${data?.error?.message || JSON.stringify(data)}`); process.exit(1); }
console.log(`\nLob accepted the test kit.  id: ${data.id}`);
console.log(`  proof URL: ${data.url}`);
const out = join(OUT_DIR, `ga-kit-proof-${stamp}.pdf`);
for (let i = 0; i < 12; i++) {
  await sleep(10000);
  const r = await fetch(data.url).catch(() => null);
  if (r && r.ok) { writeFileSync(out, Buffer.from(await r.arrayBuffer())); console.log(`  Lob proof: ${out}`); process.exit(0); }
  process.stdout.write('  waiting for Lob to render the proof...\r');
}
console.log('\n  Not ready after 2 minutes. Open the proof URL above or the Lob dashboard (Test mode).');
