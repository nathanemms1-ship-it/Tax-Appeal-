/**
 * lib/kit/flKit.js — the Florida petition kit, on the shared kit layout
 * (lib/kit/assembleKit.js). 16 Oct 2026.
 *
 * Mailed to the CUSTOMER, who signs Part 3 of the DR-486 in ink, writes the
 * county's filing-fee check, and mails (or hand-delivers) it all to the Value
 * Adjustment Board. We never file, pay the fee, represent anyone or attend.
 *
 *   p1 cover · p2 checklist · DR-486 pages 1-2 (one sheet) · evidence (own
 *   sheet) · [a second copy of the evidence when the owner will not attend] ·
 *   record + tear-off window slip · blank
 *
 * The petition is the Department of Revenue's own fillable DR-486
 * (lib/fl/fillDr486.js), never a look-alike: two VABs refused the HTML one.
 *
 * FLORIDA COUNTS RECEIPT. A petition is filed when the VAB clerk RECEIVES it,
 * with the fee (s. 194.011(3)(d), s. 194.013). Postmarks do not count. So the
 * checklist says mail it the day it arrives, or hand-deliver it, and the
 * deadline is printed as "received by".
 *
 * "I WILL NOT ATTEND". The DR-486 says the owner must then submit DUPLICATE
 * copies of the evidence. When the owner chose that box, the kit carries the
 * evidence twice, so they never have to find a copier.
 */
import { fillDr486, FORM_REVISION } from '../fl/fillDr486';
import { assembleKit, addSourcePage, LayoutError, KitError } from './assembleKit';
import { Flow, GREY, winAnsi, money, longDate } from './pdfText';
import { getFlVabAddress, flVabMailingLines } from '../flVabAddresses';
import { flSellability, flKitDeadline, flTotalCost } from './flQuote';
import { formatVabFee } from '../flCountyFees';

const cleanCounty = (c) => String(c || '').replace(/\s+County$/i, '').trim();

/** The window lines for the county's VAB, from the confirmed table. Null if unconfirmed. */
export function flEnvelope(county) {
  const c = cleanCounty(county);
  const entry = getFlVabAddress(c);
  if (!entry) return null;
  const lines = flVabMailingLines(c);
  const attn = String(lines?.line2 || '').replace(/^\s*attn:?\s*/i, '').trim();
  const out = [`${c} County Value Adjustment Board`];
  // Only the routing part ("c/o Board Records") is worth a line: the board's name is already on line 1.
  if (/c\/o/i.test(attn)) out.push(attn.slice(attn.search(/c\/o/i)));
  out.push(entry.street, `${entry.city}, ${entry.state || 'FL'} ${entry.zip}`);
  return out.map(winAnsi);
}

/** Every check that must pass before a Florida kit exists. */
export function validateFlOrder(order, { proof = false, now = new Date() } = {}) {
  const o = order || {};
  if (o.state !== 'FL') throw new KitError('wrong_state', `flKit builds Florida kits only, got "${o.state}"`);
  if (!proof) {
    const sell = flSellability(o, { now });
    // deadline_too_close is dispatchKit's call (it pages a person); everything else is a refusal here.
    if (!sell.ok && sell.reason !== 'deadline_too_close') throw new KitError(sell.reason, `Florida kit refused: ${sell.reason}`);
  }
  const envelope = flEnvelope(o.property?.county);
  if (!envelope) throw new KitError('address_not_confirmed', `No confirmed VAB address for ${o.property?.county}`);
  const cost = flTotalCost(o.property?.county);
  if (!cost) throw new KitError('fee_not_confirmed', `No confirmed VAB fee for ${o.property?.county}`);
  const dl = flKitDeadline({ county: o.property?.county, taxYear: o.taxYear, trimDeadline: o.trimDeadline });
  if (!dl && !proof) throw new KitError('need_deadline', 'No petition deadline on the order');
  return { ...o, envelope, cost, deadline: dl };
}

function drawEvidence(f, o, { copy = null } = {}) {
  const p = o.parcel; const ev = o.comps;
  f.h1(copy ? `Evidence of Just Value (${copy})` : 'Evidence of Just Value');
  f.text(`Petition to the ${cleanCounty(o.property.county)} County Value Adjustment Board, tax year ${o.taxYear}. Petitioner: ${o.owner.name}.`, { size: 10 });
  f.text(`Property: ${o.property.address}.  Parcel: ${o.property.parcelId}.`, { size: 10 });
  f.text(`Living area: ${Number(p.tot_lvg_area).toLocaleString('en-US')} sq ft${p.act_yr_blt ? `.  Year built: ${p.act_yr_blt}` : ''}.  Source: ${o.property.source}.`, { size: 10, gap: 8 });
  const cure = Number(o.cure?.total) || 0;
  f.box([
    `Just value on the ${o.taxYear} roll (TRIM notice): ${money(p.jv)}`,
    `Value indicated by qualified sales of similar homes: ${money(ev.indicatedValue)}`,
    ...(cure > 0 ? [`Less cost to cure the conditions listed below: ${money(cure)}`] : []),
    `Petitioner's opinion of just value: ${money(o.requestedValue)}`,
  ], { size: 11, bold: true });
  f.h2('Qualified sales of similar homes');
  f.table([
    { head: 'Address', width: 0.40 }, { head: 'Sold', width: 0.13 }, { head: 'Price', width: 0.14, align: 'right' },
    { head: 'Sq ft', width: 0.1, align: 'right' }, { head: '$/sq ft', width: 0.12, align: 'right' }, { head: 'Built', width: 0.11, align: 'right' },
  ], ev.list.map((c) => [c.address, c.saleDate, money(c.salePrice), Number(c.sqft).toLocaleString('en-US'), c.pricePerSqft ? `$${c.pricePerSqft}` : '-', c.yearBuilt ? String(c.yearBuilt) : '-']));
  f.h2('Method');
  f.text(`Arms-length sales the property appraiser itself qualified (DOR qualification codes 01 and 02), from the ${ev.level === 'neighborhood' ? "appraiser's own neighborhood code for this home" : "appraiser's market area for this home"}, with living area within ${ev.sizeBandPct}% and age within ${ev.ageBandYears} years of it. The median sale price per square foot, $${ev.medianPricePerSqft}, times this home's ${Number(p.tot_lvg_area).toLocaleString('en-US')} sq ft gives ${money(ev.indicatedValue)}. Sale prices are shown as recorded.`, { size: 9.5 });
  if (cure > 0) {
    f.h2('Condition of the property (cost to cure)');
    for (const it of o.cure.items || []) f.text(`${it.issue}: ${money(it.asked)}${it.ownerSupplied ? " (the owner's contractor estimate)" : it.source ? ` (source: ${it.source})` : ''}`, { size: 9.5, gap: 1 });
    f.space(4);
  }
  f.text(`${ev.attribution || ''} Submitted by the petitioner as evidence under s. 194.011(4), F.S.`, { size: 8.5, color: GREY });
}

export async function buildFlKit(order, { proof = false, now = new Date() } = {}) {
  const o = validateFlOrder(order, { proof, now });
  const county = cleanCounty(o.property.county);
  const feeText = `${formatVabFee(o.cost.feeCents)} check or money order payable to "${o.cost.payableTo}"`;
  const deadlineLong = o.deadline ? longDate(o.deadline.date) : 'the date on your TRIM notice';
  const deadlineText = `It must be RECEIVED by the Value Adjustment Board clerk by ${deadlineLong}. Florida does not count postmarks. Mail it the day you sign it, or hand-deliver it.`;

  const filled = await fillDr486({
    county, taxYear: o.taxYear, owner: o.owner, parcelId: o.property.parcelId,
    propertyAddress: o.property.address, willNotAttend: o.willNotAttend === true,
  });

  const evidenceBlock = (copy) => async ({ newPage, fonts }) => drawEvidence(new Flow(newPage(), fonts), o, { copy });
  let built;
  try {
    built = await assembleKit({
      title: `Florida petition kit ${o.property.parcelId}`,
      proof,
      envelope: o.envelope,
      slipLabel: `PETITION (FORM DR-486) AND FILING FEE ENCLOSED - ${county.toUpperCase()} COUNTY VAB`.slice(0, 90),
      drawCover(f) {
        f.h1('Your Value Adjustment Board petition is ready to sign.');
        f.text(`Everything is filled in for ${winAnsi(o.property.address)}. You do three things: sign it, write the county's filing-fee check, and get it to the board before the deadline.`);
        f.h2('Your petition goes to');
        f.box(o.envelope);
        f.h2('Deadline');
        f.text(deadlineText);
        f.h2('Your case');
        f.text(`Your petition asks for a just value of ${money(o.requestedValue)}, based on sales the property appraiser itself qualified. The county's value is ${money(o.parcel.jv)}.`);
        if (o.savings?.yearlySaving > 0) f.text(`If the board agrees, we estimate your yearly tax bill drops by about ${money(o.savings.yearlySaving)}.`);
        f.h2('The county filing fee');
        f.text(`${county} County charges ${formatVabFee(o.cost.feeCents)} to file. You pay it to the county with a check in the envelope. It is not part of our fee.`);
        f.space(8);
        f.text('TaxAppeal USA prepares petition documents. We do not file your petition, pay the county fee, represent you or appear at any hearing. You sign and send it, and you are the petitioner.', { size: 8.5, color: GREY });
      },
      checklist: (L) => [
        `SIGN and DATE Part 3 of the DR-486 (page ${L.blockPages[0][1]}) in ink. Your name is already printed there. Leave Parts 4 and 5 blank.`,
        `WRITE the filing fee: a ${feeText}. Put parcel ${o.property.parcelId} in the memo line.`,
        'Take a photo of the signed petition and the check for your records.',
        `TEAR OFF the bottom of page ${L.perforatedPage} along the perforation.`,
        `Put in the window envelope: the signed DR-486 (pages ${L.blockPages[0][0]}-${L.blockPages[0][1]}), your evidence (page${L.blockPages.slice(1).flat().length > 1 ? 's' : ''} ${L.blockPages.slice(1).flat().join(', ')}), the check, and the tear-off with the address showing in the window. Seal it.`,
        'POSTAGE: put a first-class stamp on it (two if it feels heavy), or have a post office counter weigh it.',
        `GET IT THERE IN TIME. ${deadlineText}`,
        'Tell us it is sent at taxappealusa.com/mailed so we can watch your dates.',
      ],
      checklistNotes: (L) => [
        `Hand delivery: take the sealed envelope to the clerk at ${o.envelope.slice(1).join(', ')} during office hours and ask for a date-stamped copy. That is the surest way to meet a receipt deadline.`,
        o.willNotAttend
          ? 'You ticked "I will not attend the hearing". The board then needs TWO copies of your evidence: both are in this kit. Send both.'
          : 'The board will write to you with a hearing date. You can attend in person or, in many counties, by phone or video.',
        `Keep pages 1, 2 and the top of page ${L.perforatedPage}. Do not send them to the board.`,
      ],
      blocks: [
        async ({ kit }) => { await addSourcePage(kit, filled, 0); await addSourcePage(kit, filled, 1); },
        evidenceBlock(o.willNotAttend === true ? 'copy 1 of 2' : null),
        ...(o.willNotAttend === true ? [evidenceBlock('copy 2 of 2')] : []),
      ],
      drawRecord(f) {
        f.h1('Your record (keep this part)');
        f.text(`Property: ${o.property.address}.  Parcel ${o.property.parcelId}.  Tax year ${o.taxYear}.`, { size: 10 });
        f.text(`Sent to: ${o.envelope.join(', ')}.`, { size: 10 });
        f.text(`Deadline: received by ${deadlineLong}.  Fee: ${feeText}.`, { size: 10 });
        f.text('Date I mailed or delivered it: ____________________   Check number: __________', { size: 10, gap: 8 });
        f.h2('What happens next');
        f.text('The clerk sends you a confirmation and, later, a hearing notice; the property appraiser must also give you their evidence before the hearing if you ask for it. Open board mail the day it arrives. Email a photo of anything the board sends to customerservice@taxappealusa.com and we will tell you your options.', { size: 9.5 });
      },
    });
  } catch (e) {
    if (e instanceof LayoutError) throw new KitError(e.code, e.message);
    throw e;
  }
  return {
    pdf: built.pdf, layout: built.layout, lob: built.lob,
    deadline: o.deadline ? o.deadline.date : null, envelope: o.envelope,
    fee: { cents: o.cost.feeCents, payableTo: o.cost.payableTo },
    form: { id: 'FL-DR-486', label: 'Form DR-486', revision: FORM_REVISION },
  };
}
