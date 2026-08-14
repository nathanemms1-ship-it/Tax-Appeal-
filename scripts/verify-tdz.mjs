#!/usr/bin/env node
/**
 * USE BEFORE DECLARATION, AND NEVER DECLARED AT ALL. Runs from `npm run build`.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * The same bug shipped to customers twice in two days, in the same function:
 *
 *   2 Aug — `const sc = savings?.scenarios?.likely` placed above
 *           `const savings = ...`. Reached customers as "Lookup failed".
 *   3 Aug — `cureTotal: cure.total` inside an object literal declared above
 *           `const cure = totalCostToCure(...)`. Same message, same screen.
 *
 * Both are the JavaScript temporal dead zone: a `const` or `let` referenced
 * earlier in the same scope than its declaration. It is legal to write, parses
 * cleanly, passes a JSX compile, and throws only when that line actually runs.
 *
 * Neither verify-routes nor verify-render catches it. Both stop at the boundary
 * of an event handler — renderToString does not run handlers, and run() is only
 * reachable by a real click. So the code path where this project keeps making
 * this exact mistake is the one path with no runtime coverage at all.
 *
 * A static check does not need to run the code. Walk the scopes, and if an
 * identifier is read at a position before the declaration that binds it, say so.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY IGNORES
 * ============================================================================
 * Function declarations hoist, and a closure may legitimately reference a
 * binding declared later because it is not called until afterwards. Only
 * references in the SAME function body as the declaration are flagged — a
 * reference from inside a nested function is skipped, because when it runs is
 * not something a static position can tell you.
 *
 * ============================================================================
 * SECOND CHECK: IDENTIFIERS WITH NO DECLARATION ANYWHERE (added 14 Aug 2026)
 * ============================================================================
 * The check above finds a name declared in the wrong ORDER. It says nothing
 * about a name that was never declared at all, and the repo had shipped two:
 *
 *   pages/check.js — `stashProperty(...)` on the "Get started" CTA. Never
 *       written. Every click on the highest-intent button on the site threw
 *       ReferenceError, so the address was never handed to /apply and next/link's
 *       client navigation was cancelled into a full page reload.
 *   pages/api/cron/notify-waitlist.js — `entry.email` inside buildEmail(), whose
 *       caller's loop variable is not in its scope. buildEmail() is called
 *       outside the per-row try/catch, so the throw escaped to the handler's
 *       outer catch and returned 500 on the FIRST waitlist row. Not one filing
 *       reminder had ever been sent, and it looked like a server error.
 *
 * Both are invisible to every other guard here for the same reason the TDZ bugs
 * were: renderToString does not run click handlers, and no test calls that cron.
 * Both are trivially visible to a scope walk.
 *
 * The allowlist is DERIVED, not hand-written: anything that really is a property
 * of globalThis under Node counts as resolved, plus an explicit list of browser
 * globals Node does not have. Hand-maintained lists rot — the first file to use
 * a built-in nobody thought of fails a build for no reason.
 *
 * Third-party injected globals (gtag, fbq, Stripe, dataLayer) are deliberately
 * NOT allowlisted. They are absent until their script loads, so reading one bare
 * is the same class of defect this check exists to catch; read them off `window.`
 * behind a guard and this stays quiet.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const parser = require('next/dist/compiled/babel/parser');
const traverseMod = require('next/dist/compiled/babel/traverse');
const traverse = traverseMod.default || traverseMod;

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['pages', 'lib', 'components'];

function jsFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

// Everything Node itself exposes: JSON, Math, Date, fetch, URL, Buffer, process,
// setTimeout, AbortController and so on. Derived so it cannot fall behind.
const NODE_GLOBALS = new Set(Object.getOwnPropertyNames(globalThis));

// Browser globals Node has no equivalent for. This list is short on purpose.
const BROWSER_GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'screen',
  'localStorage', 'sessionStorage', 'alert', 'confirm', 'prompt',
  'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'getComputedStyle',
  'Image', 'Element', 'HTMLElement', 'Node', 'NodeList', 'XMLHttpRequest',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
]);

const isGlobal = (n) =>
  NODE_GLOBALS.has(n) || BROWSER_GLOBALS.has(n) || n === 'undefined' || n === 'globalThis';

let failures = 0;
let scanned = 0;
let unresolved = 0;

for (const dir of DIRS) {
  for (const file of jsFiles(join(ROOT, dir))) {
    scanned++;
    let ast;
    try {
      ast = parser.parse(readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['jsx', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread', 'classProperties', 'topLevelAwait'],
      });
    } catch (e) {
      failures++;
      console.error(`  ✗ ${relative(ROOT, file)}: will not parse — ${e.message.split('\n')[0]}`);
      continue;
    }

    traverse(ast, {
      ReferencedIdentifier(path) {
        const binding = path.scope.getBinding(path.node.name);

        if (!binding) {
          const name = path.node.name;
          // A lowercase JSX tag (<div>) is a host element, not a variable.
          if (path.node.type === 'JSXIdentifier') return;
          if (isGlobal(name)) return;
          unresolved++;
          console.error(
            `  ✗ ${relative(ROOT, file)}:${path.node.loc?.start.line} — "${name}" is used here but is not declared, imported, or a global.\n` +
            `      This throws "${name} is not defined" the moment the line runs.`
          );
          return;
        }

        // const and let only. var hoists; function declarations hoist.
        if (binding.kind !== 'const' && binding.kind !== 'let') return;
        if (!binding.path.node.loc || !path.node.loc) return;

        // Same function body only. A reference from a nested function may run
        // long after the declaration and is not decidable from position.
        const refFn = path.getFunctionParent();
        const declFn = binding.path.getFunctionParent();
        if (refFn !== declFn) return;

        // Its own declarator, and destructuring patterns, are not reads.
        if (path.parentPath === binding.path) return;
        if (path.isBindingIdentifier && path.isBindingIdentifier()) return;

        const refLine = path.node.loc.start.line;
        const declLine = binding.path.node.loc.start.line;
        if (refLine < declLine) {
          failures++;
          console.error(
            `  ✗ ${relative(ROOT, file)}:${refLine} — "${path.node.name}" is used here but declared on line ${declLine}.\n` +
            `      This throws "Cannot access '${path.node.name}' before initialization" when the line runs.`
          );
        }
      },
    });
  }
}

console.log('');
if (failures || unresolved) {
  if (failures) console.error(`✗ ${failures} use-before-declaration ${failures === 1 ? 'error' : 'errors'} across ${scanned} files.`);
  if (unresolved) console.error(`✗ ${unresolved} undeclared ${unresolved === 1 ? 'identifier' : 'identifiers'} across ${scanned} files.`);
  process.exit(1);
}
console.log(`✓ ${scanned} files scanned — no identifier is read before the declaration that binds it, and none is read that was never declared`);
