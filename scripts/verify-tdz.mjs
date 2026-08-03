#!/usr/bin/env node
/**
 * USE BEFORE DECLARATION. Runs from `npm run build`.
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

let failures = 0;
let scanned = 0;

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
        if (!binding) return;
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
if (failures) {
  console.error(`✗ ${failures} use-before-declaration ${failures === 1 ? 'error' : 'errors'} across ${scanned} files.`);
  process.exit(1);
}
console.log(`✓ ${scanned} files scanned — no identifier is read before the declaration that binds it`);
