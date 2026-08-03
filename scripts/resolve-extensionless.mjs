/**
 * A Node loader so the verification scripts can import the app as it is written.
 *
 * Two things Next's bundler does that plain Node does not:
 *
 *   1. RESOLVES EXTENSIONLESS IMPORTS. `import { qualify } from '../lib/dor/qualify'`
 *      is ordinary in a Next codebase. Node refuses it — which is why
 *      verify-routes.mjs could not import a single handler, and why a missing
 *      `.js` in lib/valuation.js failed the Vercel build on 2 August while
 *      working perfectly in `next dev`.
 *
 *   2. COMPILES JSX. Pages and components are .js files containing JSX. Node
 *      reads them literally and stops at the first `<`.
 *
 * Doing both here means the test scripts import real application modules with no
 * bundler, no build step and no new dependency — the Babel used is the one that
 * already ships inside Next.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Relative, absolute, and file: URLs. Bare specifiers (react, next/head) are
    // left to Node — those resolve from node_modules and should fail loudly if
    // they cannot.
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
      for (const suffix of ['.js', '.mjs', '/index.js']) {
        try {
          return await nextResolve(specifier + suffix, context);
        } catch { /* try the next */ }
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  // Project source only. node_modules is already compiled, and running Babel
  // over it would be slow and pointless.
  const isProjectJs = url.startsWith('file:') && url.endsWith('.js') && !url.includes('/node_modules/');
  if (!isProjectJs) return nextLoad(url, context);

  const source = readFileSync(fileURLToPath(url), 'utf8');
  const { code } = babel.transformSync(source, {
    filename: fileURLToPath(url),
    presets: [[presetReact, { runtime: 'classic' }]],
    configFile: false,
    babelrc: false,
    sourceType: 'module',
  });

  // React must be in scope for the classic JSX transform. Added only when the
  // file actually produced createElement calls and does not already import it.
  const needsReact = code.includes('React.createElement') && !/^\s*import\s+React\b/m.test(code);
  return {
    format: 'module',
    shortCircuit: true,
    source: needsReact ? `import React from 'react';\n${code}` : code,
  };
}
