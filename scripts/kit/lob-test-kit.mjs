/**
 * lob-test-kit.mjs — render one sample Kit through Lob TEST mode (10 Oct 2026).
 *
 * QUESTION IT ANSWERS
 *   What does the kit we mail the customer actually look like, and does the
 *   county address land in the return-envelope window? Test mode prints nothing,
 *   mails nothing and costs nothing. Lob still renders the real PDF proof.
 *
 * THE KIT (8 pages, 4 sheets double-sided: under the 6-sheet #10 limit)
 *   p1  Cover letter to the customer. Lob prints the customer's address in the
 *       top-left window area (address_placement: top_first_page).
 *   p2  The checklist: sign, add a stamp, mail by DATE.
 *   p3  The appeal form (placeholder in this test) with SIGN HERE marked.
 *   p4  Back of the form (intentionally blank).
 *   p5  Evidence summary (placeholder comps table).
 *   p6  "Keep this copy" page for the customer's records.
 *   p7  PERFORATED page. The bottom 3.625" tears off and goes in the return
 *       envelope; its address box shows through the #9 window. We print the
 *       COUNTY appeal address there. No postage is prepaid: the customer adds a
 *       stamp (a prepaid or permit indicia fails Cobb's and Fayette's rules).
 *   p8  Intentionally blank (back of the perforated sheet).
 *
 *   Window geometry is from Lob's own template (letter_perf_template.pdf):
 *   address box 4.25" x 1.125", 0.875" from the left edge, 0.5" from the bottom.
 *
 * SAFETY
 *   Refuses to run unless the key starts with "test_". A live key would mail a
 *   real letter and charge for it.
 *
 * RUN IT (from the repo root, on the Mac)
 *   node scripts/kit/lob-test-kit.mjs --state GA
 *   node scripts/kit/lob-test-kit.mjs --state TX
 *   node scripts/kit/lob-test-kit.mjs --state FL
 *
 * THE KEY
 *   Uses LOB_TEST_API_KEY from the environment or .env.local, else asks with
 *   typing hidden. Find it in the Lob dashboard under Settings > API Keys >
 *   Test. It is never printed or saved.
 *
 * OUTPUT
 *   The Lob letter id and proof URL on screen, and the proof PDF saved to
 *   scripts/kit/out/kit-proof-<STATE>-<timestamp>.pdf (when Lob finishes
 *   rendering, usually within a minute).
 */
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT_DIR = join(HERE, 'out');

// Our return address: lib/businessInfo.js BUSINESS_ADDRESS_LINES.
const FROM = { name: 'TaxAppeal USA', address_line1: '3130 Sabine St, Ste B', address_city: 'Forest Hill', address_state: 'TX', address_zip: '76119', address_country: 'US' };

// SAMPLE data only. Test mode never mails. Do not copy these addresses into
// production: production reads confirmed rows from lib/appealAddresses.js.
const SAMPLES = {
  GA: {
    form: 'PT-311A Appeal of Assessment',
    county: ['Cobb County Board of Tax Assessors', 'PO Box 649', 'Marietta GA 30061-0649'],
    deadlineNote: 'Postmarked by the deadline on your notice (45 days from the notice date).',
    extra: null,
  },
  TX: {
    form: 'Form 50-132 Notice of Protest',
    county: ['Sample Appraisal District', 'Appraisal Review Board', 'PO Box 0000', 'Sample City TX 75000'],
    deadlineNote: 'Postmarked by May 15, or 30 days after your notice, whichever is later.',
    extra: null,
  },
  FL: {
    form: 'DR-486 Petition to the Value Adjustment Board',
    county: ['Sample County Clerk', 'Value Adjustment Board', 'PO Box 0000', 'Sample City FL 33000'],
    deadlineNote: 'Must ARRIVE by the deadline on your TRIM notice. Mail it at least 5 days early.',
    extra: 'Enclose your own check for the VAB filing fee, payable to the Clerk.',
  },
};
// The test customer: Lob prints this in the top window of page 1.
const TO = { name: 'Sample Homeowner', address_line1: '3130 Sabine St, Ste B', address_city: 'Forest Hill', address_state: 'TX', address_zip: '76119', address_country: 'US' };

const PERFORATED_PAGE = 7;
const TOTAL_PAGES = 8;

function page(inner, { blank = false } = {}) {
  return `<div class="page">${blank ? '<div class="blank">This page intentionally left blank.</div>' : inner}</div>`;
}

export function buildKitHtml(st, s) {
  const css = `
  <style>
    @page { size: 8.5in 11in; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #000; }
    .page { position: relative; width: 8.5in; height: 11in; padding: 0.6in 0.75in; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 18pt; margin: 0 0 10pt; }
    h2 { font-size: 13pt; margin: 14pt 0 6pt; }
    .addr-clear { height: 3.1in; }   /* keep clear for Lob's address block (top_first_page) */
    .sign { border: 2px solid #000; padding: 10pt; margin-top: 18pt; }
    .tab { display: inline-block; background: #000; color: #fff; font-weight: bold; padding: 3pt 8pt; }
    .box { border: 1px solid #000; padding: 8pt; margin: 6pt 0; }
    table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
    td, th { border: 1px solid #000; padding: 3pt 5pt; text-align: left; }
    .blank { position: absolute; top: 5in; width: 7in; text-align: center; color: #555; font-size: 9pt; }
    .perf-line { position: absolute; left: 0; right: 0; bottom: 3.625in; border-top: 1px dashed #000; text-align: center; font-size: 8pt; }
    .slip { position: absolute; left: 0; right: 0; bottom: 0; height: 3.625in; }
    .window { position: absolute; left: 0.875in; bottom: 0.5in; width: 4.25in; height: 1.125in; padding: 0.08in 0.12in; font-size: 11pt; line-height: 1.25; }
    .slip-note { position: absolute; left: 0.875in; top: 0.35in; width: 6.6in; font-size: 9pt; }
    .stamp { position: absolute; right: 0.6in; top: 0.35in; width: 1in; height: 1.1in; border: 1px dashed #000; font-size: 8pt; text-align: center; padding-top: 0.3in; }
  </style>`;

  const p1 = page(`
    <div class="addr-clear"></div>
    <h1>Your property tax appeal is ready to sign.</h1>
    <p>Everything is filled in. You only need to do three things: <b>sign</b>, <b>add a stamp</b>, and <b>mail it</b>.</p>
    <p>Your appeal goes to:</p>
    <div class="box">${s.county.join('<br>')}</div>
    <p><b>Mail by:</b> ${s.deadlineNote}</p>
    <p style="font-size:9pt;margin-top:24pt">TaxAppeal USA prepares appeal documents. We do not file or appear on your behalf. You are the filer.</p>`);

  const p2 = page(`
    <h1>Checklist</h1>
    <div class="box">☐ <b>1. Sign</b> the form on page 3 where it says <span class="tab">SIGN HERE</span>, and date it.</div>
    <div class="box">☐ <b>2. Tear off</b> the bottom of page 7 along the dotted line.</div>
    <div class="box">☐ <b>3. Put in the envelope:</b> the signed form (page 3), the evidence (page 5), and the tear-off slip with the address showing in the window.</div>
    ${s.extra ? `<div class="box">☐ <b>4. ${s.extra}</b></div>` : ''}
    <div class="box">☐ <b>${s.extra ? 5 : 4}. Add a regular stamp</b> and mail it. ${s.deadlineNote}</div>
    <div class="box">☐ <b>${s.extra ? 6 : 5}. Tell us it's mailed</b> at taxappealusa.com/mailed so we can track your deadlines.</div>
    <p style="font-size:9pt">Tip: for proof of the mailing date, ask the post office counter for a Certificate of Mailing (PS Form 3817), about $2.</p>`);

  const p3 = page(`
    <h1>${s.form}</h1>
    <p style="color:#555">[TEST KIT: the completed official form goes here.]</p>
    <div class="box" style="height:4.6in">Owner, property, parcel ID, the value on the notice, and your opinion of value: all pre-filled.</div>
    <div class="sign"><span class="tab">SIGN HERE</span>&nbsp; Signature of property owner ____________________________ &nbsp; Date __________</div>`);

  const p4 = page('', { blank: true });

  const p5 = page(`
    <h1>Evidence: recent sales of similar homes</h1>
    <p style="color:#555">[TEST KIT: sample rows.]</p>
    <table>
      <tr><th>Address</th><th>Sold</th><th>Price</th><th>Sq ft</th><th>$/sq ft</th><th>Distance</th></tr>
      <tr><td>101 Sample St</td><td>Mar 2026</td><td>$385,000</td><td>2,010</td><td>$192</td><td>0.4 mi</td></tr>
      <tr><td>212 Example Ave</td><td>Jan 2026</td><td>$372,500</td><td>1,940</td><td>$192</td><td>0.6 mi</td></tr>
      <tr><td>33 Test Ct</td><td>Nov 2025</td><td>$401,000</td><td>2,150</td><td>$187</td><td>0.8 mi</td></tr>
    </table>
    <h2>Summary</h2>
    <div class="box">Median $/sq ft of comparable sales × your home's sq ft = the value the sales indicate.</div>`);

  const p6 = page(`
    <h1>Keep this page for your records</h1>
    <div class="box">Date you mailed it: ____________ &nbsp;&nbsp; Post office receipt kept? ☐</div>
    <div class="box">What happens next: the county reviews your appeal and writes to you. If it sends a changed value and you disagree, you may have only a short time to respond. We'll email you a ready-to-sign letter.</div>`);

  const p7 = `<div class="page">
    <h1>Return envelope slip</h1>
    <p>Tear along the dotted line. Put the bottom part in the small envelope so the address shows in the window.</p>
    <div class="perf-line">✂ tear here</div>
    <div class="slip">
      <div class="slip-note">APPEAL ENCLOSED: ${s.form}. Owner-signed.</div>
      <div class="stamp">PLACE<br>STAMP<br>ON<br>ENVELOPE</div>
      <div class="window">${s.county.join('<br>')}</div>
    </div>
  </div>`;

  const p8 = page('', { blank: true });

  return `<html><head><meta charset="utf-8">${css}</head><body>${p1}${p2}${p3}${p4}${p5}${p6}${p7}${p8}</body></html>`;
}

// ── key handling (same pattern as scripts/tx/push.mjs) ──────────────────────
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
  // The prompt goes on its own line: readline redraws (and blanks) the line it
  // reads on, which erased the prompt text on the first Mac run (10 Oct).
  process.stdout.write(q + '\n> ');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  try { return ((await new Promise((res) => rl.question('', res))) || '').trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

async function main() {
  const st = String(arg('state', 'GA')).toUpperCase();
  const s = SAMPLES[st];
  if (!s) { console.error(`--state must be one of ${Object.keys(SAMPLES).join(', ')}`); process.exit(1); }
  const html = buildKitHtml(st, s);

  if (arg('html-only', false)) {
    mkdirSync(OUT_DIR, { recursive: true });
    const p = join(OUT_DIR, `kit-${st}.html`);
    writeFileSync(p, html);
    console.log(`Wrote ${p} (no Lob call).`);
    return;
  }

  let key = process.env.LOB_TEST_API_KEY || keyFromEnvFile();
  const keySource = process.env.LOB_TEST_API_KEY ? 'the LOB_TEST_API_KEY environment variable' : key ? '.env.local' : 'the prompt';
  if (!key) key = await promptSecret('Lob TEST API key, starts with test_ (typing hidden): ');
  if (!key) { console.error('No Lob test key.'); process.exit(1); }
  key = key.replace(/^['"]|['"]$/g, '').trim();
  if (!key.startsWith('test_')) {
    // Say what it looked like without echoing the secret: only Lob's own prefix.
    const seen = key.startsWith('live_') ? 'a LIVE key (starts with "live_")'
      : !key ? 'nothing' : `a value starting with "${key.slice(0, 2)}…" (${key.length} characters)`;
    console.error(`Refusing: the key from ${keySource} is ${seen}. This needs the Lob TEST secret key, which starts with "test_".`);
    console.error('Find it in the Lob dashboard: switch the toggle to Test, then Settings > API Keys > Secret key.');
    console.error('A live key would mail and charge a real letter.');
    process.exit(1);
  }

  const payload = {
    description: `KIT TEST ${st} ${new Date().toISOString().slice(0, 10)}`,
    to: TO,
    from: FROM,
    file: html,
    color: false,
    double_sided: true,
    address_placement: 'top_first_page',
    mail_type: 'usps_first_class',
    return_envelope: true,
    perforated_page: PERFORATED_PAGE,
    metadata: { kind: 'kit_test', state: st },
  };
  const auth = `Basic ${Buffer.from(key + ':').toString('base64')}`;
  const res = await fetch('https://api.lob.com/v1/letters', {
    method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Lob refused the letter (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
    process.exit(1);
  }
  console.log(`\nLob accepted the test kit.`);
  console.log(`  id:        ${data.id}`);
  console.log(`  pages:     ${TOTAL_PAGES} (${TOTAL_PAGES / 2} sheets, double-sided)`);
  console.log(`  envelope:  standard #10 + #9 return envelope (no postage)`);
  console.log(`  proof URL: ${data.url}`);

  // The proof is rendered asynchronously; the URL 404s until it is ready.
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = join(OUT_DIR, `kit-proof-${st}-${stamp}.pdf`);
  for (let i = 0; i < 12; i++) {
    await sleep(10000);
    const r = await fetch(data.url).catch(() => null);
    if (r && r.ok) {
      writeFileSync(out, Buffer.from(await r.arrayBuffer()));
      console.log(`  saved:     ${out}`);
      return;
    }
    process.stdout.write('  waiting for Lob to render the proof...\r');
  }
  console.log('\n  The proof was not ready after 2 minutes. Open the proof URL above, or the letter in the Lob dashboard (Test mode).');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
