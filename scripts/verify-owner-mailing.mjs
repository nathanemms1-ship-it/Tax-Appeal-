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
 * (17 Oct 2026: the letter pipeline — generate-dr486, save-order, finalize-order —
 * is gone. The address now travels kit component -> checkout -> order row ->
 * lib/kit/dispatchKit.js; sections 5, 6 and 8 follow it there.)
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
import { register } from 'node:module';
// lib/kit/dispatchKit.js imports without extensions, as the app does.
register('./resolve-extensionless.mjs', import.meta.url);

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
/**
 * The three kit checkouts. Since 17 Oct 2026 these — not apply.js — build the
 * /api/checkout body: GA, TX and FL are sold only as kits, and the letter
 * pipeline that used to send ownerStreet from apply.js was deleted.
 */
const KIT_UIS = ['components/GaKitStep.js', 'components/FlKitStep.js', 'components/TxKitCheckout.js'];
const kits = Object.fromEntries(KIT_UIS.map((f) => [f, strip(readFileSync(f, 'utf8'))]));
const KIT_TAG = { 'components/GaKitStep.js': 'GaKitStep', 'components/FlKitStep.js': 'FlKitStep', 'components/TxKitCheckout.js': 'TxKitCheckout' };

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

  for (const f of KIT_UIS) {
    const left = [...kits[f].matchAll(/owner(Street|City|State|Zip):\s*property\??\.\w+/g)].map((m) => m[0]);
    t(`${KIT_TAG[f]} does not copy the property into the owner address fields`, left.length === 0, left);
  }

  /**
   * RE-POINTED 17 Oct 2026. This counted `ownerStreet: ownerMail.street` in
   * apply.js (the order row and the preview petition). Both call sites were
   * deleted with the letter pipeline; the order row is now written from the
   * checkout body each kit component builds. So: every kit component must send
   * all four owner fields from its ownerMail prop, and apply.js must hand each
   * of them the shared resolver's answer.
   *
   * INJECTION: change any kit to `ownerStreet: property.street` -> FAILS twice
   *   (the leftover sweep above and this one); drop ownerMail= from one render
   *   in apply.js -> FAILS naming that component.
   */
  for (const f of KIT_UIS) {
    const src = kits[f];
    t(`${KIT_TAG[f]} sends all four owner fields from ownerMail`,
      ['Street', 'City', 'State', 'Zip'].every((k) =>
        new RegExp(`owner${k}:\\s*ownerMail\\??\\.${k.toLowerCase()}\\b`).test(src)));
    t(`${KIT_TAG[f]} takes ownerMail as a prop rather than deriving its own`,
      /export default function \w+\(\{[^)]*\bownerMail\b/.test(src) && !/resolveOwnerMailing|const ownerMail\s*=/.test(src));
    const render = new RegExp(`<${KIT_TAG[f]}\\b[^>]*?ownerMail=\\{resolveOwnerMailing\\(account, property\\)\\}`);
    t(`apply.js passes ownerMail={resolveOwnerMailing(account, property)} to ${KIT_TAG[f]}`, render.test(apply));
  }

  /**
   * ==========================================================================
   * COUNTS THE PROPERTY, NOT THE OCCURRENCES — 15 Sept 2026
   * ==========================================================================
   * This read `derived === 2`. A third scope was added that needs an owner
   * mailing address — retryTxWithCounty, which re-runs the Texas lookup against
   * a different district's roll — and it derives it from the shared resolver,
   * correctly. The assertion failed anyway, because it counted call sites
   * instead of checking the thing that matters.
   *
   * The real invariant is the one the section header states: the resolver is the
   * only way an owner mailing address is ever built. An exact count does not
   * test that — it fails on correct additions and would pass a hand-rolled
   * object if someone deleted a good call site in the same change.
   *
   * So: every declaration must use the resolver, and there must still be more
   * than one. Adding a fourth correct scope is fine; hand-building one is not.
   *
   * INJECTION: change any of them to `const ownerMail = { street: property.street }`
   *   -> "every ownerMail is built by the shared resolver, never by hand"
   */
  const allDecls = [...apply.matchAll(/const ownerMail\s*=/g)].length;
  const derived = [...apply.matchAll(/const ownerMail = resolveOwnerMailing\(account, property\)/g)].length;
  t('every ownerMail is built by the shared resolver, never by hand',
    allDecls > 0 && derived === allDecls, `${derived} of ${allDecls} declarations`);
  t('and more than one scope needs it, so the resolver is genuinely shared',
    derived >= 2, derived);
  // The kit renders call the resolver inline (ownerMail={resolveOwnerMailing(...)}),
  // so they are not `const ownerMail` declarations; no OTHER expression may feed
  // an ownerMail= prop.
  const props = [...apply.matchAll(/ownerMail=\{([^}]*\)?)\}/g)].map((m) => m[1]);
  t('every ownerMail= prop is the shared resolver',
    props.length >= 3 && props.every((p) => p === 'resolveOwnerMailing(account, property)'), props);

  t('apply.js imports the resolver rather than defining its own',
    /import \{ resolveOwnerMailing \} from ['"]\.\.\/lib\/ownerMailing['"]/.test(apply));
}

// ---------------------------------------------------------------------------
// 6. THE DANGEROUS DIRECTION. An out-of-state owner must not move the filing.
// ---------------------------------------------------------------------------
{
  /**
   * RE-POINTED 17 Oct 2026 from apply.js's `stateCode: property.state ?` (the
   * deleted letter checkout). Each kit component now sends the state of the KIT
   * it is, as a literal — and which kit renders is decided by the property's
   * state in apply.js. Neither can be moved by a mailing address.
   *
   * INJECTION: `stateCode: ownerMail.state` in any kit -> FAILS.
   */
  for (const [f, sc] of [['components/GaKitStep.js', 'GA'], ['components/FlKitStep.js', 'FL'], ['components/TxKitCheckout.js', 'TX']]) {
    t(`${KIT_TAG[f]} sends stateCode '${sc}' — the kit's state, not the owner's`,
      new RegExp(`stateCode:\\s*'${sc}'`).test(kits[f]) && (kits[f].match(/stateCode:/g) || []).length === 1,
      'an owner in New York with a Florida rental would otherwise be filed under New York rules');
  }

  t('no stateCode is taken from ownerMail, in apply.js or any kit',
    ![apply, ...Object.values(kits)].some((src) => /stateCode:\s*ownerMail/.test(src)));

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
// 8. IT HAS TO SURVIVE TO THE KIT. checkout -> Stripe metadata -> the order
//    row -> the kit printed at dispatch.
//
//    RE-POINTED 17 Oct 2026. This followed the letter: save-order wrote
//    owner_street, finalize-order read it back for the mail-time re-render, and
//    generate-dr486 printed it. All three were deleted. The live path is
//    checkout (metadata) -> lib/fulfillOrder.js (the insert) -> dispatchKit's
//    kitOrderFromRow (which builds the kit from the ROW at send time).
// ---------------------------------------------------------------------------
{
  const checkout = strip(readFileSync('pages/api/checkout.js', 'utf8'));
  const fulfil = strip(readFileSync('lib/fulfillOrder.js', 'utf8'));
  const cols = strip(readFileSync('lib/orderColumns.js', 'utf8'));

  t('checkout accepts ownerStreet', /ownerStreet/.test(checkout));
  t('checkout carries all four owner fields into the session metadata',
    ['Street', 'City', 'State', 'Zip'].every((k) => new RegExp(`owner${k}: owner${k} \\|\\| ''`).test(checkout)));
  t('fulfillOrder writes them to owner_street / city / state / zip',
    ['street', 'city', 'state', 'zip'].every((k) =>
      new RegExp(`owner_${k}:\\s*m\\.owner${k[0].toUpperCase()}${k.slice(1)}\\b`).test(fulfil)));
  t('owner_street is a declared column — no migration was needed',
    /'owner_street'/.test(cols));
  t('property_address is a SEPARATE declared column',
    /'property_address'/.test(cols),
    'if these shared one column the mailing address would overwrite the parcel');

  // EXECUTED, not matched: the kit is built from what kitOrderFromRow returns.
  const { kitOrderFromRow, KIT_ROW_COLUMNS } = await import('../lib/kit/dispatchKit.js');
  t('the dispatch read selects the owner_* columns',
    ['owner_street', 'owner_city', 'owner_state', 'owner_zip'].every((c) => KIT_ROW_COLUMNS.includes(c)));
  const built = kitOrderFromRow({
    state_code: 'FL', county: 'Miami-Dade', customer_name: 'Pat Owner', customer_email: 'p@example.com',
    owner_street: '88 Ocean Dr', owner_city: 'Brooklyn', owner_state: 'NY', owner_zip: '11201',
    kit_order: {
      property: { ...PROPERTY, county: 'Miami-Dade' },
      owner: { street: PROPERTY.street, city: PROPERTY.city, state: 'FL', zip: PROPERTY.zip },
    },
  }, { addressLookup: () => null });
  t('the mail-time kit takes the owner address from the order row',
    built?.owner?.street === '88 Ocean Dr' && built.owner.city === 'Brooklyn' && built.owner.state === 'NY' && built.owner.zip === '11201',
    built?.owner);
  t('...and the PROPERTY on the kit is untouched by it',
    built?.property?.street === PROPERTY.street && built.property.state === 'FL', built?.property);
  t('...and the kit\'s filing state is the property\'s, not the owner\'s', built?.state === 'FL', built?.state);
}

// ---------------------------------------------------------------------------
console.log(`\nverify-owner-mailing: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('The county writes to the owner, and the petition still goes to the right board.');
