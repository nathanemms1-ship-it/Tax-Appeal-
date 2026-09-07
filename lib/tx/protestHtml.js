/**
 * ============================================================================
 * THE DOCUMENT ITSELF — Form 50-132 and the § 41.43(b)(3) equity grid
 * ============================================================================
 *
 * Split out of pages/api/generate-50132.js on 7 Sept 2026 so the thing a
 * homeowner signs and an ARB panel reads can be rendered, inspected and
 * asserted on WITHOUT a database. A document that can only be produced by a
 * live POST to production is a document nobody proof-reads.
 *
 * Pure: packet in, HTML out. No network, no clock, no randomness.
 * scripts/tx/preview-protest.mjs writes a sample to disk from a fixture.
 *
 * ── THE 5-MINUTE CONSTRAINT ─────────────────────────────────────────────────
 *
 * Travis allots 15 minutes per hearing INCLUDING both parties, panel questions,
 * deliberation and decision — about 5-6 minutes of owner time. The packet's
 * first evidence page therefore carries the entire argument: the test, the grid,
 * the median, the ask. Everything else is appendix. That constraint drove this
 * layout more than anything else in it.
 */

const CONTACT_EMAIL = 'customerservice@taxappealusa.com';

/**
 * Escape for HTML. Owner-supplied name, address and phone are concatenated into
 * a document we render, cache and mail. generate-pt311a.js shipped without this
 * and had raw owner input in the filed appeal; same data here, same treatment.
 */
export function e(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const money = (v) => (Number.isFinite(Number(v)) ? '$' + Math.round(Number(v)).toLocaleString() : '—');
const psf = (v) => (Number.isFinite(Number(v)) ? '$' + Number(v).toFixed(2) : '—');

const STY = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;line-height:1.35}
.page{padding:34px 46px;max-width:816px;margin:0 auto}
.pb{page-break-before:always}
h1{font-size:13pt;font-weight:bold;text-align:center}
h2{font-size:10pt;font-weight:bold;text-align:center;margin-bottom:12px}
.rev{font-size:8pt;color:#555;text-align:right;margin-bottom:8px}
.sec{border:1.5px solid #000;margin-bottom:9px}
.sh{background:#222;color:#fff;font-weight:bold;font-size:9.5pt;padding:4px 8px}
.sb{padding:8px 10px}
.row{display:flex;gap:12px;margin-bottom:7px}
.f{flex:1}
.fl{font-size:7.5pt;color:#444;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
.fv{border-bottom:1px solid #000;min-height:17px;font-size:10pt;padding:1px 2px}
.cbr{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;font-size:9.5pt}
.cb{width:13px;height:13px;border:1.5px solid #000;flex-shrink:0;margin-top:1px;
    display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px}
.note{background:#fffbe6;border:1px solid #e0b83a;padding:7px 9px;font-size:8.5pt;margin:7px 0}
.sl{border-bottom:1.5px solid #000;min-height:30px;margin-bottom:3px}
.slb{font-size:7.5pt;color:#444;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:9pt;margin-top:8px}
th{background:#222;color:#fff;padding:5px 6px;text-align:left;font-size:8.5pt}
td{padding:4px 6px;border-bottom:1px solid #ccc}
tr.subject td{background:#f0f4fa;font-weight:bold;border-top:2px solid #000;border-bottom:2px solid #000}
tr.median td{background:#eaf6ea;font-weight:bold;border-top:2px solid #000}
.num{text-align:right;font-variant-numeric:tabular-nums}
.statute{border-left:3px solid #222;padding:8px 12px;font-size:9pt;background:#f7f7f7;margin-bottom:10px}
.ask{border:2px solid #000;padding:10px 12px;margin-top:12px;display:flex;
     justify-content:space-between;align-items:center}
.askv{font-size:16pt;font-weight:bold}
.foot{font-size:7.5pt;color:#555;margin-top:14px;border-top:1px solid #ccc;padding-top:7px}
</style>`;

/** Section 3 of the form. Box 1 is ticked; the rest print unticked, as printed forms do. */
const GROUNDS = [
  ['incorrect_value_and_or_unequal', 'Incorrect appraised (market) value and/or value is unequal compared with other properties.'],
  [null, 'Owner’s name or property description is incorrect.'],
  [null, 'Property should not be taxed in this appraisal district or in one or more taxing units.'],
  [null, 'Failure to send required notice. (State which notice: ______)'],
  [null, 'Exemption was denied, modified or cancelled.'],
  [null, 'Ag-use, open-space or other special appraisal was denied, modified or cancelled.'],
  [null, 'Change in use of land appraised as ag-use, open-space or timber land.'],
  [null, 'Temporary disaster damage exemption or damage assessment rating.'],
  [null, 'Circuit breaker limitation on non-homestead property was denied or incorrectly calculated.'],
  [null, 'Other: ______________________________'],
];

export function renderForm(p) {
  const f = p.form50132;
  const tick = (id) => (f.grounds.includes(id) ? 'X' : '');
  return `<div class="page">
  <div class="rev">Form ${e(f.revision)} &nbsp;|&nbsp; Texas Tax Code § 41.41 &nbsp;|&nbsp; Tax Year ${e(f.taxYear)}</div>
  <h1>NOTICE OF PROTEST</h1>
  <h2>${e(f.appraisalDistrict || '')} &nbsp;·&nbsp; Appraisal Review Board</h2>

  <div class="sec"><div class="sh">SECTION 1 — PROPERTY OWNER</div><div class="sb">
    <div class="row">
      <div class="f"><div class="fl">Name</div><div class="fv">${e(f.ownerName)}</div></div>
      <div class="f"><div class="fl">Phone</div><div class="fv">${e(f.ownerPhone)}</div></div>
    </div>
    <div class="row">
      <div class="f"><div class="fl">Mailing address</div><div class="fv">${e(f.ownerMailing)}</div></div>
      <div class="f"><div class="fl">Email</div><div class="fv">${e(f.ownerEmail)}</div></div>
    </div>
    <div class="note"><b>The appraisal district will write to you at this address, not to TaxAppeal.</b>
      Any hearing notice, settlement offer or decision comes directly to you.</div>
  </div></div>

  <div class="sec"><div class="sh">SECTION 2 — PROPERTY DESCRIPTION</div><div class="sb">
    <div class="row">
      <div class="f"><div class="fl">Appraisal district account number</div><div class="fv">${e(f.accountNumber)}</div></div>
    </div>
    <div class="row">
      <div class="f"><div class="fl">Physical address of the property</div><div class="fv">${e(f.propertyAddress)}</div></div>
    </div>
  </div></div>

  <div class="sec"><div class="sh">SECTION 3 — REASONS FOR YOUR PROTEST</div><div class="sb">
    ${GROUNDS.map(([id, label]) =>
      `<div class="cbr"><div class="cb">${tick(id)}</div><div>${label}</div></div>`).join('')}
    <div class="note">The first box covers <b>both</b> an incorrect market value and an unequal
      appraisal compared with other properties. Ticking it preserves both grounds — nothing is
      waived by not ticking a second box.</div>
  </div></div>

  <div class="sec"><div class="sh">SECTION 4 — YOUR OPINION OF VALUE</div><div class="sb">
    <div class="row"><div class="f">
      <div class="fl">What is your opinion of your property’s value?</div>
      <div class="fv"><b>${money(f.opinionOfValue)}</b></div>
    </div></div>
    <div style="font-size:8.5pt;color:#333;margin-top:4px">
      Supported by the comparable-property analysis on the following page, drawn from
      ${e(p.county)} Central Appraisal District’s own ${e(f.taxYear)} appraisal roll.
    </div>
  </div></div>

  <div class="sec"><div class="sh">SECTION 5 — HEARING</div><div class="sb">
    <div class="cbr"><div class="cb">${f.requestInformalConference ? 'X' : ''}</div>
      <div>I request an informal conference with the appraisal district before my hearing.</div></div>
    <div style="font-size:9pt;margin:8px 0 5px"><b>How do you want to take part in the ARB hearing?
      Tick one before you sign.</b></div>
    <div class="cbr"><div class="cb"></div><div>In person.</div></div>
    <div class="cbr"><div class="cb"></div><div>By telephone conference — <i>requires a notarised
      Form 50-283 affidavit of evidence, filed before the hearing begins.</i></div></div>
    <div class="cbr"><div class="cb"></div><div>By videoconference — <i>requires a notarised
      Form 50-283 affidavit.</i></div></div>
    <div class="cbr"><div class="cb"></div><div>On written affidavit only — <i>requires a notarised
      Form 50-283 affidavit.</i></div></div>
    <div class="note"><b>This choice is yours and we have deliberately left it blank.</b>
      TaxAppeal prepares documents; we do not represent you and we do not attend hearings.
      Every option other than appearing in person requires a notarised affidavit that you would
      file yourself. <b>If a hearing is scheduled and you neither attend nor file an affidavit,
      your protest is dismissed</b> and you may lose your right to appeal for this tax year.
      Most residential protests are resolved before any hearing takes place.</div>
  </div></div>

  <div class="sec"><div class="sh">SECTION 6 — CERTIFICATION</div><div class="sb">
    <div style="font-size:9pt;margin-bottom:10px">I am the owner of the property described above,
      or the owner’s authorised employee or affiliated entity. The information in this notice is
      true and correct to the best of my knowledge and belief.</div>
    <div class="row">
      <div class="f" style="flex:2"><div class="sl"></div><div class="slb">Signature of property owner</div></div>
      <div class="f"><div class="sl"></div><div class="slb">Date</div></div>
    </div>
    <div class="note"><b>This form is not filed until you sign it.</b> TaxAppeal USA prepared this
      document at your request and is not your agent or representative. No Form 50-162 agent
      appointment has been filed and none will be. Questions: ${CONTACT_EMAIL}.</div>
  </div></div>
</div>`;
}

export function renderGrid(p) {
  const g = p.grid;
  const rows = g.comps.map((c) => `<tr>
    <td>${e(c.accountNumber)}</td>
    <td class="num">${Number(c.livingArea).toLocaleString()}</td>
    <td class="num">${e(c.yearBuilt)}</td>
    <td class="num">${money(c.appraisedValue)}</td>
    <td class="num">${psf(c.appraisedPerSqft)}</td></tr>`).join('');

  return `<div class="page pb">
  <div class="rev">Evidence — Account ${e(g.subject.accountNumber)} &nbsp;|&nbsp; Tax Year ${e(p.taxYear)}</div>
  <h1>UNEQUAL APPRAISAL — COMPARABLE PROPERTY ANALYSIS</h1>
  <h2>Texas Tax Code § 41.43(b)(3)</h2>

  <div class="statute">${e(g.statute)}</div>

  <table>
    <thead><tr>
      <th>Account</th><th class="num">Living area</th><th class="num">Year</th>
      <th class="num">Appraised value</th><th class="num">Per sq ft</th>
    </tr></thead>
    <tbody>
      <tr class="subject">
        <td>${e(g.subject.accountNumber)} — <b>subject</b></td>
        <td class="num">${Number(g.subject.livingArea).toLocaleString()}</td>
        <td class="num">${e(g.subject.yearBuilt)}</td>
        <td class="num">${money(g.subject.appraisedValue)}</td>
        <td class="num">${psf(g.subject.appraisedPerSqft)}</td>
      </tr>
      ${rows}
      <tr class="median">
        <td>MEDIAN of ${g.compCount} comparable properties</td>
        <td class="num"></td><td class="num"></td>
        <td class="num">${money(g.indicatedAppraised)}</td>
        <td class="num">${psf(g.medianAppraisedPerSqft)}</td>
      </tr>
    </tbody>
  </table>

  <div class="ask">
    <div>
      <div style="font-size:8.5pt;text-transform:uppercase;letter-spacing:.5px;color:#444">
        Value requested</div>
      <div style="font-size:8.5pt;color:#333">Reduction sought from ${money(g.subject.marketValue)}:
        <b>${money(p.reductionSought)}</b></div>
    </div>
    <div class="askv">${money(p.requestedValue)}</div>
  </div>

  <div class="foot">
    <b>How these comparables were selected.</b> ${e(g.disclosure || '')}
    ${g.neighborhoodCode ? `Selection was confined to the appraisal district’s own neighborhood
    code ${e(g.neighborhoodCode)} — the district’s grouping, not a radius chosen by us.` : ''}
    ${e(g.adjustments || '')}
    <br><br>
    <b>Stated plainly:</b> ${g.cappedCompCount} of ${g.compCount} comparable properties carry a
    § 23.23 or § 23.231 assessment cap.
    ${g.cappedCompCount === 0
      ? 'None of the median is attributable to another owner’s length of tenure.'
      : 'Where a comparable is capped, part of the difference reflects that owner’s length of ownership rather than the district’s appraisal of this property.'}
    <br><br>
    Every value above is taken from ${e(p.county)} Central Appraisal District’s own appraisal roll
    for tax year ${e(p.taxYear)}. Prepared by TaxAppeal USA at the property owner’s request.
    TaxAppeal USA is not the owner’s agent and did not sign the notice of protest.
  </div>
</div>`;
}


/** The whole filed document: notice of protest, then the evidence page. */
export function renderProtestHtml(packet) {
  if (!packet || !packet.filable) {
    throw new Error('renderProtestHtml: refusals are not rendered — show packet.message instead');
  }
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>Notice of Protest — ' + e(packet.form50132.accountNumber) + '</title>'
    + STY + '</head><body>' + renderForm(packet) + renderGrid(packet) + '</body></html>';
}

export default { renderProtestHtml, renderForm, renderGrid };
