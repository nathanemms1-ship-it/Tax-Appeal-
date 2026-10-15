/**
 * lib/kit/txKit.js — the Texas Mailed Kit, on the shared kit layout
 * (lib/kit/assembleKit.js). Kit model, 10 Oct 2026: mailed to the CUSTOMER, who
 * signs Section 8 in ink, adds postage and mails it to the appraisal district.
 *
 * Nothing here re-decides the Texas case. The protest itself is the packet
 * lib/tx/protest.js buildProtest() already produces from the district's own
 * roll (equal-and-uniform comparables; Texas publishes no sale prices), and the
 * filed instrument is the Comptroller's own Form 50-132, filled by
 * lib/tx/fill50132.js with the evidence on its own pages. This file only puts
 * that into the kit:
 *
 *   p1 cover · p2 checklist · Form 50-132 (pages 1-2, one sheet) ·
 *   evidence pages (own sheet(s)) · record + tear-off window slip · blank
 *
 * Signature: fill50132 is called WITHOUT an e-signature, so Section 8's
 * signature and date stay blank for the owner's pen.
 *
 * Deadline (Tax Code § 41.44(a)(1)): May 15, or 30 days after the notice was
 * delivered, whichever is LATER, rolled to the next business day
 * (lib/tx/protestDeadline.js). The kit prints the statutory floor, the earlier
 * of the two, and says the later date may apply: telling someone an earlier
 * date costs them nothing; a later one can cost them the year.
 */
import { PDFDocument } from 'pdf-lib';
import { fill50132, FORM_REVISION } from '../tx/fill50132';
import { floor as txFloor } from '../tx/protestDeadline';
import { assembleKit, addSourcePage, LayoutError, KitError, postageStep } from './assembleKit';
import { GREY, winAnsi, money } from './pdfText';
import { isMailable, formatEnvelope } from '../appealAddresses';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

/** Every check that must pass before a Texas kit exists. */
export function validateTxOrder(order, { proof = false, now = new Date() } = {}) {
  const o = order || {};
  if (o.state !== 'TX') throw new KitError('wrong_state', `txKit builds Texas kits only, got "${o.state}"`);
  const taxYear = Number(o.taxYear);
  let fl;
  try { fl = txFloor(taxYear); } catch (e) { throw new KitError('bad_tax_year', e.message); }
  const f = o.packet?.form50132;
  if (!f) throw new KitError('no_packet', 'No Texas protest packet (buildProtest output) on the order');
  if (!nonEmpty(String(f.accountNumber || ''))) throw new KitError('property_incomplete', 'The district account number is missing');
  const ow = o.owner || {};
  for (const k of ['name', 'street', 'city', 'state', 'zip']) {
    if (!nonEmpty(ow[k])) throw new KitError('owner_incomplete', `Owner ${k} is missing`);
  }
  const row = o.countyAddress;
  if (!row) throw new KitError('no_county_address', `No protest address for ${o.property?.county || 'this'} County`);
  if (!proof && !isMailable(row, now)) {
    throw new KitError('address_not_mailable', `${o.property?.county} appraisal district address is "${row.confidence}": refusing to print it on a return envelope`);
  }
  const envelope = formatEnvelope(row);
  if (!envelope || envelope.length < 2 || envelope.length > 5) throw new KitError('bad_county_address', 'District address does not fit the window');
  // Section 1 is where the district sends its hearing notice. buildProtest fills
  // it only when the funnel passed owner.mailing; the kit order always has the
  // owner's mailing address, so a blank Section 1 is filled from it, never left
  // blank (15 Oct proof: Section 1 printed empty).
  const mailing = `${ow.street.trim()}${nonEmpty(ow.street2) ? ` ${ow.street2.trim()}` : ''}, ${ow.city.trim()}, ${ow.state.trim()} ${ow.zip.trim()}`;
  const packet = {
    ...o.packet,
    form50132: { ...f, ownerName: nonEmpty(f.ownerName) ? f.ownerName : ow.name.trim(), ownerMailing: nonEmpty(f.ownerMailing) ? f.ownerMailing : mailing },
  };
  return { ...o, packet, taxYear, floor: fl, envelope };
}

export async function buildTxKit(order, { proof = false, now = new Date() } = {}) {
  const o = validateTxOrder(order, { proof, now });
  const f = o.packet.form50132;
  const district = f.appraisalDistrict || o.envelope[0];
  const deadlineText = `Postmarked no later than ${o.floor.long}, or 30 days after your notice was delivered if that is later. Mail it as soon as you have signed it.`;

  // The Comptroller's form, filled; its evidence pages follow it in the same file.
  const filled = await PDFDocument.load(await fill50132(o.packet, null));
  const n = filled.getPageCount();
  if (n < 2) throw new KitError('form_incomplete', 'Form 50-132 came back with fewer than 2 pages');

  let built;
  try {
    built = await assembleKit({
      title: `Texas protest kit ${f.accountNumber}`,
      proof,
      envelope: o.envelope,
      slipLabel: `NOTICE OF PROTEST (FORM 50-132) ENCLOSED - ${String(district).toUpperCase()}`.slice(0, 90),
      drawCover(fl) {
        fl.h1('Your property tax protest is ready to sign.');
        fl.text(`Everything is filled in for ${winAnsi(f.propertyAddress || o.property?.address || '')}. You do three things: sign it, add postage, and mail it.`);
        fl.h2('Your protest goes to');
        fl.box(o.envelope);
        fl.h2('Deadline');
        fl.text(deadlineText);
        if (f.opinionOfValue) {
          fl.h2('Your case');
          fl.text(`Your protest asks for ${money(f.opinionOfValue)}, based on how the district itself values similar homes near yours.`);
        }
        if (o.savings?.yearlySaving > 0) fl.text(`If the district agrees, we estimate your yearly tax bill drops by about ${money(o.savings.yearlySaving)}.`);
        fl.space(10);
        fl.text('TaxAppeal USA prepares protest documents. We do not file your protest, represent you or appear for you. You sign and mail it, and you are the property owner of record on it.', { size: 8.5, color: GREY });
      },
      checklist: (L) => [
        `SIGN and DATE Section 8 of Form 50-132 (page ${L.blockPages[0][1]}) in ink. Your name is already printed there.`,
        'Take a photo of the signed form for your records.',
        `TEAR OFF the bottom of page ${L.perforatedPage} along the perforation.`,
        `Put in the small window envelope: the signed Form 50-132 (pages ${L.blockPages[0][0]}-${L.blockPages[0][1]}), ${L.blockPages[1] ? `your evidence (page${L.blockPages[1].length > 1 ? 's' : ''} ${L.blockPages[1].join(', ')}), ` : ''}and the tear-off with the address showing in the window. Seal it.`,
        `POSTAGE: ${postageStep(o.countyAddress.postageRestriction)}`,
        `MAIL IT. ${deadlineText}`,
        'Tell us it is mailed at taxappealusa.com/mailed so we can watch your dates.',
      ],
      checklistNotes: (L) => [
        'Your form asks the district for an informal conference: that is where most home protests settle, at no cost to you. The district will write to you with a date.',
        'Proof of mailing: the date that counts is the USPS postmark. For a receipt, ask the counter clerk for a Certificate of Mailing (PS Form 3817), about $2.',
        `Keep pages 1, 2 and the top of page ${L.perforatedPage}. Do not send them to the district.`,
      ],
      blocks: [
        // Form 50-132 pages 1-2: one sheet, front and back.
        async ({ kit }) => { await addSourcePage(kit, filled, 0); await addSourcePage(kit, filled, 1); },
        // The evidence pages fill50132 appends, on their own sheet(s).
        ...(n > 2 ? [async ({ kit }) => { for (let i = 2; i < n; i++) await addSourcePage(kit, filled, i); }] : []),
      ],
      drawRecord(fl) {
        fl.h1('Your record (keep this part)');
        fl.text(`Property: ${f.propertyAddress || ''}.  Account ${f.accountNumber}.  Tax year ${o.taxYear}.`, { size: 10 });
        fl.text(`Sent to: ${o.envelope.join(', ')}.`, { size: 10 });
        fl.text(`Deadline: ${deadlineText}`, { size: 10 });
        fl.text('Date I mailed it: ____________________', { size: 10, gap: 8 });
        fl.h2('What happens next');
        fl.text('The appraisal district writes to you with an informal conference or a hearing date. Open district mail the day it arrives. Email a photo of anything the district sends to customerservice@taxappealusa.com and we will tell you your options.', { size: 9.5 });
      },
    });
  } catch (e) {
    if (e instanceof LayoutError) throw new KitError(e.code, e.message);
    throw e;
  }
  return {
    pdf: built.pdf, layout: built.layout, lob: built.lob, deadline: new Date(`${o.floor.iso}T00:00:00Z`), envelope: o.envelope,
    form: { id: 'TX-50-132', label: 'Comptroller Form 50-132', revision: FORM_REVISION },
  };
}
