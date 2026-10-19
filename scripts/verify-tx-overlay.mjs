/**
 * verify-tx-overlay — in-season values on last year's records (19 Oct 2026).
 *   scripts/tx/overlay-values.mjs  Dallas notice file / Tarrant daily file
 *   scripts/tx/push.mjs            a reload clears ONE tax year, never the roll beside it
 * Offline. Where a line says INJECTION, reintroducing that bug fails the assertion.
 */
import { readFileSync } from 'node:fs';
const { overlayRow, FORMATS, parseCsvLine, makeLineReader } = await import('./tx/overlay-values.mjs');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const base = (o = {}) => ({ cad_id: '220', account_number: '000000006483', tax_year: '2026', market_value: '101114', appraised_value: '50920', homestead_cap_loss: '50194', nhs_cap_loss: '0', land_value: '11840', improvement_value: '89274', living_area: '939', year_built: '1910', neighborhood_code: '2ABC', state_class_code: 'A', has_homestead: 'true', arb_protest_flag: 'true', source_format: 'PACS', ...o });

// Values given (Dallas): appraised comes from the file.
let r = overlayRow(base({ cad_id: '57' }), { market: '120000', land: '20000', appraised: '60000' }, { year: 2027 });
t('a given capped value is used as is, and the loss is market minus appraised', r.appraised_value === '60000' && r.homestead_cap_loss === '60000' && r.nhs_cap_loss === '0' && r.improvement_value === '100000');
t('...on THIS year, keeping last year\'s neighborhood, size and age', r.tax_year === '2027' && r.neighborhood_code === '2ABC' && r.living_area === '939' && r.year_built === '1910' && r.source_format === 'PACS+INSEASON');
t('...and last year\'s protest flag is not carried into the new year', r.arb_protest_flag === '');

// No capped value (Tarrant): estimated from the statute.
r = overlayRow(base(), { market: '130000', land: '12000', improvement: '118000' }, { year: 2027 });
// INJECTION: estimate from last year's MARKET instead of appraised -> FAILS.
t('a homestead is capped at last year\'s appraised + 10%', r.appraised_value === String(Math.round(50920 * 1.1)) && r.homestead_cap_loss === String(130000 - Math.round(50920 * 1.1)) && r.source_format.endsWith('+CAPEST'));
r = overlayRow(base(), { market: '52000', land: '12000', improvement: '40000' }, { year: 2027 });
t('...never above market', r.appraised_value === '52000' && r.homestead_cap_loss === '0');
r = overlayRow(base({ has_homestead: 'false', appraised_value: '90000' }), { market: '130000', land: '12000', improvement: '118000' }, { year: 2027 });
// INJECTION: default nhsCap to 0.20 -> FAILS (§ 23.231 expires 31 Dec 2026).
t('a non-homestead has no cap in 2027 unless the 20% cap is extended', r.appraised_value === '130000' && r.nhs_cap_loss === '0');
r = overlayRow(base({ has_homestead: 'false', appraised_value: '90000' }), { market: '130000', land: '12000', improvement: '118000' }, { year: 2027, nhsCap: 0.2 });
t('...and is capped at +20% when told the Legislature extended it', r.appraised_value === '108000' && r.nhs_cap_loss === '22000' && r.homestead_cap_loss === '0');
t('a row with no market value is dropped', overlayRow(base(), { market: '0', land: '1' }, { year: 2027 }) === null);

// The column picks, on lines shaped like the real files.
const dcad = ['2027', '00000100006000000', '1', '755310', '120000', ...Array(63).fill('0'), '640000', ...Array(25).fill('0')];
const D = FORMATS['dcad-notice'];
t('Dallas: year, account, market [3], land [4], appraised [68]', D.year(dcad) === '2027' && D.account(dcad) === '00000100006000000' && D.market(dcad) === '755310' && D.land(dcad) === '120000' && D.appraised(dcad) === '640000' && D.cad === 57);
// DCAD flipped the file shape between years (2025 comma + header, 2026 tab, none).
let rd = makeLineReader(D);
const tabRow = rd(dcad.join('\t'));
t('Dallas: a tab file with no header is read by position', D.market(tabRow) === '755310' && D.appraised(tabRow) === '640000');
rd = makeLineReader(D);
const hdr = ['APPRAISAL_YR', 'ACCOUNT_NUM', 'MAILING_NUMBER', 'TOT_VAL', 'LAND_VAL', ...Array(63).fill('X'), 'CAP_VALUE', ...Array(25).fill('Y')];
rd(hdr.join(','));
const csvRow = rd(dcad.map((c) => `${c} `).join(','));
t('Dallas: a comma file with a header is read too, cells trimmed', D.market(csvRow) === '755310' && D.account(csvRow) === '00000100006000000' && D.appraised(csvRow) === '640000');
// INJECTION: read by position even when a header is present -> FAILS once DCAD moves a column.
rd = makeLineReader(D);
const moved = [...hdr]; [moved[3], moved[20]] = [moved[20], moved[3]];
rd(moved.join(','));
const mv = [...dcad]; [mv[3], mv[20]] = [mv[20], mv[3]];
t('Dallas: with a header, columns are taken by NAME wherever they move', D.market(rd(mv.join(','))) === '755310');
rd = makeLineReader(D);
let threw = false; try { rd(hdr.filter((h) => h !== 'CAP_VALUE').join(',')); } catch { threw = true; }
t('Dallas: a header missing a column we need stops the run', threw);
const T = FORMATS['tad-r'];
t('Tarrant: the account is padded to the 12 digits our roll uses, and no capped value is read', T.account({ Account_Num: '1309' }) === '000000001309' && T.appraised === null && T.cad === 220);
t('our CSV reader handles quotes and empty fields', JSON.stringify(parseCsvLine('"57","00000738168000000","2026",,"A11"')) === JSON.stringify(['57', '00000738168000000', '2026', '', 'A11']));

const push = read('scripts/tx/push.mjs');
// INJECTION: put back `delete from tx_parcels where cad_id = $1` -> FAILS (loading 2027 would wipe 2026).
t('a reload clears only that file\'s tax year', /delete from tx_parcels where cad_id = \$1 and tax_year = \$2', \[cad, year\]/.test(push) && !/delete from tx_parcels where cad_id = \$1'/.test(push));
const ov = read('scripts/tx/overlay-values.mjs');
t('the overlay refuses a base roll from another district or a year that is not later', /base file is cad/.test(ov) && /must be after the base roll's year/.test(ov));

console.log(`verify-tx-overlay: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
