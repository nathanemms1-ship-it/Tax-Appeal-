#!/usr/bin/env node
/**
 * THE PETITION HAS TWO ADDRESSES ON IT AND THEY ARE NOT THE SAME ADDRESS.
 *
 * ============================================================================
 * WHAT THIS GUARDS
 * ============================================================================
 * The DR-486 carries the PROPERTY under appeal, which identifies the parcel to
 * the Board, and separately the petitioner's MAILING address, beneath which the
 * petition we generate prints, in bold:
 *
 *   "Direct all correspondence and the Board's determination to the property
 *    owner at the address above."
 *
 * pages/api/generate-dr486.js has always taken those as separate parameters.
 * pages/apply.js filled both from the property, at three call sites, so a
 * landlord's county mail went to their tenant and a snowbird's went to a house
 * nobody was standing in. Found 25 Aug 2026 by a customer who asked before
 * buying — nobody had asked in the life of the product, because the thing that
 * goes missing is a letter you were not expecting to receive.
 *
 * ============================================================================
 * THE ASSERTION THAT MATTERS MOST IS NOT THE OBVIOUS ONE
 * ============================================================================
 * "The mailing address reaches the petition" is what the feature is for. But the
 * dangerous failure is the opposite one: an owner who lives in another state now
 * types a NEW YORK address into this funnel, and if that state leaks into
 * `stateCode` the funnel switches filing rules, deadline and destination board
 * for a property that is still in Florida. Nobody would see it until a petition
 * went to the wrong office.
 *
 * So this asserts both directions: the mailing address must move, and the
 * property's state must not.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} (got: ${JSON.stringify(got)})`));

const { resolveOwnerMailing } = await import('../lib/ownerMailing.js');

// Comments are stripped before every source assertion. This codebase has more
// than once proved a property of its own documentation rather than its code —
// the words "ownerStreet: property.street" appear in four explanatory comments
// in apply.js precisely BECAUSE that was the bug.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const apply = strip(readFileSync('pages/apply.js', 'utf8'));

const PROPERTY = { street: '10941 NW 43 LN', city: 'Doral', state: 'FL', zip: '33178' };

// ---------------------------------------------------------------------------
// 1. THE DEFAULT. Blank is an ANSWER — "send it to the property" — not missing
//    data, because the panel is closed by default and most owners never open it.
// ---------------------------------------------------------------------------
{
  for (const [label, account] of [
    ['no mailing keys at all', {}],
    ['empty string', { mailStreet: '' }],
    ['whitespace only', { mailStreet: '   ' }],
    ['undefined', { mailStreet: undefined }],
  ]) {
    const r = resolveOwnerMailing(account, PROPERTY);
    t(`${label} -> the property address`,
      r.street === PROPERTY.street && r.city === PROPERTY.city && r.state === PROPERTY.state && r.zip === PROPERTY.zip, r);
    t(`${label} -> isDifferent is false`, r.isDifferent === false, r.isDifferent);
  }
}

// ---------------------------------------------------------------------------
// 2. A REAL MAILING ADDRESS REPLACES IT. This is Richard's case: a Doral rental,
//    an owner who lives elsewhere.
// ---------------------------------------------------------------------------
{
  const r = resolveOwnerMailing(
    { mailStreet: '88 Ocean Dr Apt 4', mailCity: 'Boca Raton', mailState: 'FL', mailZip: '33432' },
    PROPERTY,
  );
  t('a full mailing address wins over the property',
    r.street === '88 Ocean Dr Apt 4' && r.city === 'Boca Raton' && r.zip === '33432', r);
  t('and reports itself as different', r.isDifferent === true);
  t('the property address is NOT what the county would be told to write to',
    r.street !== PROPERTY.street && r.zip !== PROPERTY.zip);
}

// ---------------------------------------------------------------------------
// 3. PARTIAL INPUT FALLS BACK PER PART, NOT ALL-OR-NOTHING. Somebody who opens
//    the panel to correct one line must not silently lose the rest.
// ---------------------------------------------------------------------------
{
  const r = resolveOwnerMailing({ mailStreet: '88 Ocean Dr', mailCity: '  ' }, PROPERTY);
  t('a blank city borrows the property city rather than emptying it', r.city === PROPERTY.city, r.city);
  t('the street the owner typed still wins', r.street === '88 Ocean Dr', r.street);
  t('values are trimmed', resolveOwnerMailing({ mailStreet: '  88 Ocean Dr  ' }, PROPERTY).street === '88 Ocean Dr');
}

// ---------------------------------------------------------------------------
// 4. It cannot throw. This runs inside doCheckout, between the Stripe conversion
//    event and the network call; an exception there loses the sale silently.
// ---------------------------------------------------------------------------
{
  for (const [label, a, p] of [
    ['both missing', undefined, undefined],
    ['no property', { mailStreet: 'x' }, undefined],
    ['nulls', null, null],
  ]) {
    let r = null, threw = null;
    try { r = resolveOwnerMailing(a, p); } catch (e) { threw = e.message; }
    t(`${label} does not throw`, threw === null, threw);
    t(`${label} still yields strings`, r && typeof r.street === 'string' && typeof r.zip === 'string', r);
  }
}

// ---------------------------------------------------------------------------
// 5. THE WIRING. All three call sites, and no survivors.
// ---------------------------------------------------------------------------
{
  const leftovers = [...apply.matchAll(/owner(Street|City|State|Zip):\s*property\.\w+/g)].map((m) => m[0]);
  t('no call site still copies the property into the owner address fields',
    leftovers.length === 0, leftovers);

  const wired = [...apply.matchAll(/ownerStreet:\s*ownerMail\.street/g)].length;
  t('all three ownerStreet call sites read the resolved mailing address',
    wired === 3,
    `${wired} of 3 — the order row, the signed petition and the preview petition`);

  const derived = [...apply.matchAll(/const ownerMail = resolveOwnerMailing\(account, property\)/g)].length;
  t('ownerMail is derived from the shared resolver in both scopes that need it',
    derived === 2, derived);

  t('apply.js imports the resolver rather than defining its own',
    /import \{ resolveOwnerMailing \} from ['"]\.\.\/lib\/ownerMailing['"]/.test(apply));
}

// ---------------------------------------------------------------------------
// 6. THE DANGEROUS DIRECTION. An out-of-state owner must not move the filing.
// ---------------------------------------------------------------------------
{
  t('stateCode still comes from the PROPERTY, not the mailing address',
    /stateCode:\s*property\.state\s*\?/.test(apply),
    'an owner in New York with a Florida rental would otherwise be filed under New York rules');

  t('no stateCode is taken from ownerMail',
    !/stateCode:\s*ownerMail/.test(apply));

  // The same trap one level down: the county and the filing window are property
  // facts. If either ever reads the mailing address the petition goes to the
  // wrong board.
  t('the resolver exposes no county and no filing state of its own',
    !('county' in resolveOwnerMailing({}, PROPERTY)),
    'a mailing address must not be able to answer "which board hears this"');
}

// ---------------------------------------------------------------------------
// 7. THE UI CONTRACT. Closed by default — the whole point of Nathan's call is
//    that most owners never see these four fields.
// ---------------------------------------------------------------------------
{
  t('StepAccount is given the property so it can show the default',
    /<StepAccount data=\{account\} property=\{property\}/.test(apply));

  t('the mailing panel starts closed unless an address was already given',
    /useState\(!!data\.mailStreet\)/.test(apply),
    'defaulting it open puts four inputs in front of everyone who does not need them');

  t('opening it prefills from the property, so it is an edit not a retype',
    /onChange\("mailStreet", property\.street \|\| ""\)/.test(apply));

  t('there is a way back to the property address',
    /onChange\("mailStreet", ""\)/.test(apply),
    'clearing the street is what resolveOwnerMailing reads as "use the property"');

  t('a half-filled mailing address is refused at the step, not silently patched',
    /Please complete the mailing address/.test(apply),
    'per-part fallback would otherwise pair a new street with the old ZIP');
}

// ---------------------------------------------------------------------------
// 8. IT HAS TO SURVIVE TO THE PETITION. Three files downstream, none of which
//    this change touched — which is the point: they were always correct.
// ---------------------------------------------------------------------------
{
  const checkout = strip(readFileSync('pages/api/checkout.js', 'utf8'));
  const saveOrder = strip(readFileSync('pages/api/save-order.js', 'utf8'));
  const finalize = strip(readFileSync('pages/api/finalize-order.js', 'utf8'));
  const dr486 = strip(readFileSync('pages/api/generate-dr486.js', 'utf8'));
  const cols = strip(readFileSync('lib/orderColumns.js', 'utf8'));

  t('checkout accepts ownerStreet', /ownerStreet/.test(checkout));
  t('save-order writes it to owner_street', /owner_street:\s*ownerStreet/.test(saveOrder));
  t('owner_street is a declared column — no migration was needed',
    /'owner_street'/.test(cols));
  t('property_address is a SEPARATE declared column',
    /'property_address'/.test(cols),
    'if these shared one column the mailing address would overwrite the parcel');
  t('the mail-time re-render reads owner_street back',
    /ownerStreet:\s*order\.owner_street/.test(finalize),
    'without this the signed petition that actually posts loses the mailing address');
  t('the petition prints it in its own Mailing Address field',
    /Mailing Address/.test(dr486) && /Property Address/.test(dr486));
}

// ---------------------------------------------------------------------------
console.log(`\nverify-owner-mailing: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('The county writes to the owner, and the petition still goes to the right board.');
