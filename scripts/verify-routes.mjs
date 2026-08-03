#!/usr/bin/env node
/**
 * SMOKE TEST EVERY API ROUTE. Runs from `npm run build`.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * On 2 August 2026 six runtime bugs reached a human clicking through the site,
 * past a build where all six verification suites passed. Every one of them lived
 * in the same blind spot: the suites test library functions and scan source text,
 * and not one of them had ever invoked an API route.
 *
 * The worst was `pages/api/generate-dr486.js` referring to `comps`, a field the
 * request handler never destructured from the body. Every Florida petition died
 * with "ReferenceError: comps is not defined" at the final step — and the
 * assertion covering it PASSED, because it was matching the parameter list of
 * buildDR486Html, a different function that had always had the field.
 *
 * A test that passes while the feature is broken is worse than no test, because
 * it is the reason nobody looks.
 *
 * ============================================================================
 * WHAT THIS DOES AND DOES NOT PROVE
 * ============================================================================
 * It calls each handler with a realistic body and a mock res, and asserts the
 * handler does not THROW. That is a low bar on purpose — it needs no database,
 * no API keys and no network, so it can run on every build including a fresh
 * clone in CI.
 *
 * It is not a correctness test. A route returning 500 because Supabase is absent
 * is a PASS here: the code ran, reached its own error handling, and answered.
 * What fails is a route that cannot execute at all — a missing destructure, a
 * temporal dead zone, a typo'd import, a renamed field nobody rewired. Those are
 * exactly the six from 2 August.
 */
import { register } from 'node:module';

// The app imports without file extensions (webpack resolves them, Node does
// not). Registered before any dynamic import below.
register('./resolve-extensionless.mjs', import.meta.url);

const FL = { street: '1130 GLENWOOD CT', city: 'WESTON', state: 'FL', zip: '33326' };

/** A body per route, shaped like what the funnel actually sends. */
const ROUTES = [
  { name: 'check',            body: { street: FL.street, zip: FL.zip, city: FL.city } },
  { name: 'suggest',          body: { query: '1130 glenwood', zip: FL.zip } },
  { name: 'comps',            body: { street: FL.street, city: FL.city, state: 'FL', zip: FL.zip } },
  { name: 'lookup',           body: { street: FL.street, city: FL.city, state: 'FL', zip: FL.zip } },
  { name: 'autocomplete',     body: { query: '1130 glenwood' } },
  { name: 'resolve-county',   body: { street: FL.street, city: FL.city, state: 'FL', zip: FL.zip } },
  { name: 'join-waitlist',    body: { email: 'smoke@example.com', state: 'FL' } },
  { name: 'health',           body: {}, method: 'GET' },
  {
    // The route that broke. Every field the funnel sends, so a field that stops
    // being wired through fails here rather than in front of a customer.
    name: 'generate-dr486',
    body: {
      ownerFirstName: 'Test', ownerLastName: 'Owner', ownerEmail: 'smoke@example.com',
      ownerStreet: FL.street, ownerCity: FL.city, ownerState: 'FL', ownerZip: FL.zip,
      propertyAddress: '1130 GLENWOOD CT, WESTON, FL, 33326',
      county: 'Broward', parcelId: '504007071100',
      assessedValue: 1047630, requestedValue: 859057, taxYear: '2026',
      comps: [{ address: '1170 LAGUNA SPRINGS DR, WESTON', parcelId: '504007071310', saleDate: '2026-04-01', salePrice: 869000, sqft: 2952, pricePerSqft: 294, yearBuilt: 1989 }],
      askRestsOn: 'mass_appraisal_floor', costToCureTotal: 102600,
      valuationBasis: '1. Fla. Stat. § 193.011(6) — condition defects priced at cost to cure.',
      valuationGrounds: [{ criterion: 'Fla. Stat. § 193.011(6)', basis: 'Condition.' }],
      issues: ['Roof damage or age (leaks, missing shingles, sagging)'],
      propertyDetails: '2,952 sq ft, built 1989', notes: '', zip: FL.zip,
      ownerSignatureName: '', ownerSignatureDate: '',
      willNotAttend: true, authorizeConfidential: false, preview: true,
    },
  },
];

/**
 * A bug in our code, versus this machine not having a database.
 *
 * The first list is what a JavaScript mistake looks like when it surfaces as a
 * string: an identifier that does not exist, a field read off undefined, a
 * temporal dead zone. All six of the 2 August runtime failures match one of
 * these. The second list is the environment being absent, which is the normal
 * state when this runs in CI or on a fresh clone, and must not fail the build.
 */
const CODE_DEFECT = /\b(?:is not defined|is not a function|Cannot read propert|Cannot access .* before initialization|undefined is not|null is not|Assignment to constant)\b/i;
const ENVIRONMENT = /\b(?:fetch failed|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|Missing Supabase|Invalid API key|credentials|not configured|unauthorized|API key)\b/i;

function mockRes() {
  const r = { statusCode: null, payload: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.send = (p) => { r.payload = p; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  return r;
}

let failures = 0;
let checks = 0;
console.log(`API routes — ${ROUTES.length} handlers invoked\n`);

for (const route of ROUTES) {
  const path = `../pages/api/${route.name}.js`;
  let mod;
  checks++;
  try {
    mod = await import(new URL(path, import.meta.url));
  } catch (e) {
    failures++;
    console.error(`  ✗ ${route.name}: will not import — ${e.message.split('\n')[0]}`);
    continue;
  }

  const handler = mod.default;
  checks++;
  if (typeof handler !== 'function') {
    failures++;
    console.error(`  ✗ ${route.name}: no default export handler`);
    continue;
  }

  const req = {
    method: route.method || 'POST',
    body: route.body,
    query: {},
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = mockRes();

  checks++;
  try {
    await handler(req, res);
    const code = res.statusCode ?? '(none)';

    // A CAUGHT ERROR IS STILL AN ERROR.
    //
    // Most of these routes wrap their body in try/catch and return 500 with the
    // message. So a ReferenceError never reaches the catch above — it arrives as
    // a tidy 500 and would have been recorded as a pass, which is exactly the
    // blind spot this file exists to close. The 2 August outage looked like this:
    // "ReferenceError: comps is not defined", returned as a 500, funnel dead.
    //
    // So the payload gets read, and a code defect is told apart from the
    // environment being absent. No database and no API keys is EXPECTED here and
    // must stay a pass, or nobody will be able to run this on a fresh clone.
    const msg = String(res.payload?.error ?? res.payload?.message ?? '');
    if (CODE_DEFECT.test(msg)) {
      failures++;
      console.error(`  ✗ ${route.name.padEnd(16)} answered ${code} with a CODE DEFECT: ${msg.split('\n')[0]}`);
    } else if (msg && ENVIRONMENT.test(msg)) {
      console.log(`  ✓ ${route.name.padEnd(16)} ran, answered ${code} (no network/db here — expected)`);
    } else {
      console.log(`  ✓ ${route.name.padEnd(16)} ran, answered ${code}`);
    }
  } catch (e) {
    failures++;
    console.error(`  ✗ ${route.name.padEnd(16)} THREW: ${e.message.split('\n')[0]}`);
  }
}

console.log('');
if (failures) {
  console.error(`✗ ${failures} of ${checks} route checks failed — a handler cannot execute.`);
  console.error('  This is the class of bug that let every Florida petition fail silently.');
  process.exit(1);
}
console.log(`✓ ${checks} checks passed — every route imports, exports a handler, and executes`);
