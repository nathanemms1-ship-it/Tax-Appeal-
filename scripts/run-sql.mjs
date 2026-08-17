#!/usr/bin/env node
/**
 * ============================================================================
 * RUN A .sql FILE AGAINST THE DATABASE
 * ============================================================================
 *   node scripts/run-sql.mjs scripts/migrations/2026-08-17-partner-perk.sql
 *   node scripts/run-sql.mjs <file> --dry     print the file, connect to nothing
 *
 * WHY THIS EXISTS
 *
 * psql is not installed on this machine and Homebrew is not either, so the
 * options were pasting a two-hundred-line migration into the Supabase SQL editor
 * or writing this. A truncated paste is a partially applied migration, which is
 * the worst of the available outcomes — some columns exist, some functions do
 * not, and nothing says so until a checkout fails.
 *
 * `pg` is already a dependency (scripts/tx/push.mjs uses it). This is twenty
 * lines of glue around it.
 *
 * SENT AS ONE QUERY, DELIBERATELY. The file contains `do $$ ... $$` blocks and
 * dollar-quoted function bodies, and naive splitting on ';' would cut straight
 * through them. node-postgres sends a multi-statement string over the simple
 * query protocol, where Postgres itself does the parsing — which is the only
 * parser that can be trusted with dollar quoting.
 *
 * ONE QUERY ALSO MEANS ONE IMPLICIT TRANSACTION: if any statement fails, the
 * whole file rolls back. A migration that half-applied would be far worse than
 * one that cleanly refused, so this is the behaviour we want and it is free.
 */

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-sql.mjs <file.sql> [--dry]');
  process.exit(2);
}

let sql;
try {
  sql = readFileSync(file, 'utf8');
} catch (e) {
  console.error(`✗ Could not read ${file}: ${e.message}`);
  process.exit(2);
}

if (!sql.trim()) {
  // An empty file would "succeed" against the database and report nothing done,
  // which reads exactly like a migration that applied.
  console.error(`✗ ${file} is empty. Nothing was sent.`);
  process.exit(2);
}

console.log(`\n${file} — ${sql.split('\n').length} lines, ${sql.length.toLocaleString()} characters`);

if (process.argv.includes('--dry')) {
  console.log('\n--dry: not connecting.\n');
  process.exit(0);
}

// Same connection handling as scripts/tx/push.mjs. Prompts rather than requiring
// an exported variable, because instructing anyone to run `read -rs PGURL`
// followed by `export PGURL` feeds the second line in as the value of the first.
async function promptSecret(q) {
  if (!process.stdin.isTTY) return null;
  process.stdout.write(q);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  try { return ((await new Promise((r) => rl.question('', r))) || '').trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}

function urlFromEnvFile() {
  try {
    const txt = readFileSync('.env.local', 'utf8');
    for (const key of ['PGURL', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL']) {
      const m = txt.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)`, 'm'));
      if (m && /^postgres(ql)?:\/\//.test(m[1])) return m[1].trim();
    }
  } catch { /* no .env.local */ }
  return null;
}

let url = process.env.PGURL || process.env.DATABASE_URL || urlFromEnvFile();
if (url && !/^postgres(ql)?:\/\//.test(url)) url = null;
if (!url) url = await promptSecret('Paste the connection string (nothing will appear): ');
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('\n✗ No usable connection string. Nothing was sent anywhere.');
  process.exit(2);
}
if (/\[YOUR-PASSWORD\]/i.test(url)) {
  console.error('\n✗ The connection string still has the [YOUR-PASSWORD] placeholder in it.');
  process.exit(2);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url) || process.env.PGSSL === 'disable';
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });

const t0 = Date.now();
try {
  await client.connect();
  const result = await client.query(sql);

  // A multi-statement query returns an array of results, one per statement.
  // Print the ones that returned rows — migrations here end with verification
  // SELECTs, and those are the whole point of running it interactively.
  const results = Array.isArray(result) ? result : [result];
  for (const r of results) {
    if (r?.rows?.length) {
      console.log('');
      console.table(r.rows);
    }
  }

  console.log(`\n✓ applied in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
} catch (e) {
  // Postgres reports the character offset; turning it into a line number is the
  // difference between "syntax error at or near ..." and knowing where to look.
  const pos = Number(e.position);
  const where = Number.isFinite(pos) ? ` (line ${sql.slice(0, pos).split('\n').length})` : '';
  console.error(`\n✗ ${e.message}${where}`);
  if (e.detail) console.error(`  ${e.detail}`);
  console.error('\n  Nothing was applied — the whole file runs in one transaction.\n');
  process.exit(1);
} finally {
  await client.end();
}
