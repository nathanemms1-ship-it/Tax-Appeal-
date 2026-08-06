#!/usr/bin/env node
/**
 * WHAT THE DR-486 ACTUALLY SAYS.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * The 5 Aug 2026 test dispatch produced a real Lob proof of a real petition, and
 * reading it found nine defects that every existing suite passed straight over.
 * They were not crashes. The document rendered, the build was green, and the page
 * was wrong — on a filing sent to a government board over a homeowner's signature
 * sworn under penalty of perjury.
 *
 * The three that mattered most:
 *
 *   PROMISES OF EVIDENCE THAT WILL NEVER COME. Three separate sentences said the
 *   owner "will submit" or "will provide" comparable sales — while Part 2 declared
 *   the owner would not attend the hearing, and nothing further was ever going to be
 *   sent. A board reading that waits for a package that does not exist and rules on
 *   an apparently abandoned filing. The model was not hallucinating: the prompt
 *   instructed it to say exactly that.
 *
 *   RAW MARKDOWN ON A LEGAL FORM. "# EVIDENCE AND ARGUMENT", "## 1. BASIS OF
 *   PETITION", "**Florida Statutes**" printed literally, because evidenceText is
 *   rendered inside a white-space:pre-wrap block.
 *
 *   A SWORN ATTESTATION DATED A DAY LATE. Signed 22:09 US Central; the petition read
 *   the following day, because Vercel runs UTC and the date carried no timeZone.
 *
 * Every assertion below corresponds to something that was actually printed and
 * mailed in test. This suite reads the rendered document rather than trusting the
 * prompt, because "we told the model not to" is not a guarantee.
 */

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

register('./resolve-extensionless.mjs', import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0;
const failures = [];
const t = (name, cond, got) => (cond ? pass++ : failures.push(got === undefined ? name : `${name} — got: ${JSON.stringify(got)}`));

const { buildDR486Html, bareCounty, flDate, stripMarkdown } =
  await import('../pages/api/generate-dr486.js');

// ── The helpers, directly ─────────────────────────────────────────────────────
t('bareCounty strips a trailing suffix', bareCounty('Broward County') === 'Broward', bareCounty('Broward County'));
t('bareCounty leaves a bare name alone', bareCounty('Broward') === 'Broward');
t('bareCounty keeps hyphenated names intact', bareCounty('Miami-Dade County') === 'Miami-Dade');
t('bareCounty survives null', bareCounty(null) === '');
t('bareCounty does not eat an internal "County"', bareCounty('County Line') === 'County Line', bareCounty('County Line'));

// The exact timestamp from the 5 Aug order: signed 22:09 US Central, stored as UTC.
t('a signature at 22:09 Central renders as the SAME day in Florida',
  flDate('2026-08-06T03:09:59.829+00:00') === 'August 5, 2026',
  flDate('2026-08-06T03:09:59.829+00:00'));
t('flDate returns null for junk rather than "Invalid Date"', flDate('nonsense') === null);
t('flDate with no argument still produces a date', typeof flDate() === 'string');

{
  const md = '# EVIDENCE AND ARGUMENT\n\n## 1. BASIS OF PETITION\n\n**Florida Statutes § 193.011** applies.\n- a point\n* another\nThe `value` is wrong.';
  const out = stripMarkdown(md);
  t('headings lose their hashes', !/#/.test(out));
  t('bold markers are removed', !/\*\*/.test(out));
  t('backticks are removed', !/`/.test(out));
  t('bullets become real bullet characters', out.includes('• a point'));
  t('the WORDS survive stripping', out.includes('Florida Statutes § 193.011 applies.') && out.includes('EVIDENCE AND ARGUMENT'));
  t('a statutory § is untouched', out.includes('§ 193.011'));
  t('plain prose passes through unchanged',
    stripMarkdown('The assessed value exceeds just value.') === 'The assessed value exceeds just value.');
}

// ── The rendered petition ─────────────────────────────────────────────────────
// Deliberately hostile inputs: a county that already carries its suffix, and
// evidence full of the markdown the live document actually contained.
const HTML = buildDR486Html({
  ownerFirstName: 'Nathan',
  ownerLastName: 'Emms',
  ownerEmail: 'owner@example.com',
  ownerPhone: '',
  ownerStreet: '1130 GLENWOOD CT',
  ownerCity: 'WESTON',
  ownerState: 'FL',
  ownerZip: '33326',
  propertyAddress: '1130 GLENWOOD CT, WESTON, FL 33326',
  county: 'Broward County',
  parcelId: '504007071100',
  assessedValue: 1047630,
  requestedValue: 859057,
  taxYear: '2026',
  evidenceText: '# EVIDENCE AND ARGUMENT\n\n## 1. BASIS OF PETITION\n\n**The assessed value** exceeds just value.\n- point one',
  vabName: 'Broward County Value Adjustment Board',
  ownerSignatureName: 'Nathan Emms',
  ownerSignatureDate: '2026-08-06T03:09:59.829+00:00',
  filingDate: 'August 5, 2026',
  preview: false,
  willNotAttend: true,
  authorizeConfidential: true,
});

t('the county name is not doubled anywhere', !/County County/.test(HTML));
t('the VAB is still named in full', HTML.includes('Broward County Value Adjustment Board'));

t('no markdown headings survive to the page', !/(^|>)\s*#{1,6}\s/m.test(HTML));
t('no bold markers survive to the page', !/\*\*/.test(HTML));

t('the signature date is the Florida-local day', HTML.includes('August 5, 2026'));
t('the signature date is NOT the UTC day', !HTML.includes('August 6, 2026'));
t('no raw ISO timestamp is printed', !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(HTML));
t('no "Invalid Date" reaches the form', !/Invalid Date/.test(HTML));

// We enclose one petition with its evidence. We do not send duplicate copies, and
// on the 5 Aug document we sent no evidence at all while asserting we had.
t('does not claim duplicate copies were submitted', !/Duplicate copies submitted/i.test(HTML));
t('the non-attendance election is still stated', /will not attend the hearing/i.test(HTML));

// The footer used to declare the piece already mailed, on a document generated
// weeks before it is mailed — the same false tense as the email receipt.
t('the footer does not claim it has already been mailed', !/Prepared and mailed:/.test(HTML));
t('the footer still records when it was prepared', /Prepared:/.test(HTML));

// The parts that make the legal posture work must not be lost to any of this.
t('Part 3 carries the perjury attestation', /penalties of perjury/i.test(HTML));
t('Part 3 cites the signing statute', /194\.011\(3\)/.test(HTML));
t('Parts 4 and 5 remain not applicable', (HTML.match(/Not applicable/gi) || []).length >= 2);
t('the preparer is disclaimed as non-representative', /not the owner's representative/i.test(HTML));

// ── The prompt, since it is what generated the promises ──────────────────────
{
  const src = read('pages/api/generate-dr486.js');
  const prompt = src.slice(src.indexOf('const evidencePrompt'), src.indexOf('Professional, factual, first person'));

  t('the prompt no longer instructs the model to promise separate evidence',
    !/will submit comparable sales separately/i.test(prompt));
  t('the prompt forbids promising future evidence', /NEVER PROMISE FUTURE EVIDENCE/.test(prompt));
  t('the prompt names the phrases to avoid', /"I will submit"/.test(prompt));
  t('the prompt forbids markdown', /OUTPUT PLAIN PROSE ONLY/.test(prompt));
  t('the prompt forbids claiming unperformed analysis',
    /do not write that comparable sales were analysed/i.test(prompt));
  t('the anti-invention rule is still intact',
    /DO NOT invent, estimate, or state any specific comparable sale/.test(prompt));
  t('the cost-of-sale prohibition is still intact', /eighth criterion/.test(prompt));

  // Belt and braces: the render strips markdown even if the model ignores the rule.
  t('the renderer strips markdown regardless of the prompt',
    /stripMarkdown\(evidenceText\)/.test(src));
}

if (failures.length) {
  console.error(`verify-petition: ${failures.length} FAILED, ${pass} passed`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`verify-petition: ${pass} passed — the DR-486 promises nothing it will not deliver`);
