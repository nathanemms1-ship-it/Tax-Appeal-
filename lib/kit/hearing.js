/**
 * lib/kit/hearing.js — the hearing help pack. 17 Oct 2026.
 *
 * When the county, district or board sets a hearing (or a Texas informal
 * conference), the customer tells us the date on /outcome. We email a one-page
 * "your hearing" sheet straight away, remind them two days before, and ask how
 * it went the day after. We never attend, represent or speak for them: the
 * sheet helps the owner present their own case.
 *
 * The state rules on the sheet are the published ones, with their sources:
 *   TX  Tax Code s. 41.461: at least 14 days before the hearing the district
 *       must tell the owner they may REQUEST the data, schedules and formulas it
 *       will use; copies are free. The Comptroller's protest page: appear in
 *       person, by phone or video, or by written affidavit; bring copies as the
 *       ARB's procedures say.
 *   FL  s. 194.011(4): the petitioner gives the property appraiser a list of
 *       evidence and copies at least 15 days before the hearing; if they also
 *       ask IN WRITING, the appraiser must give theirs at least 7 days before.
 *   GA  Ga. Comp. R. & Regs. 560-11-12: either side may request the other's
 *       documents in writing at least 10 days before (produced at least 7 days
 *       before); the board of assessors carries the burden of proof on value;
 *       a hearing may be postponed on a timely request, at the board's discretion.
 * Each sheet also says: your notice and the board's own procedures govern.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Flow, PAGE_W, PAGE_H, GREY, money, winAnsi } from './pdfText';
import { daysToDeadline } from './delivery';

const DOC = { GA: 'appeal', TX: 'protest', FL: 'petition' };
const BOARD = { GA: 'the board (board of assessors or board of equalization)', TX: 'the appraisal district or appraisal review board', FL: 'the Value Adjustment Board or special magistrate' };

export const HEARING_KINDS = Object.freeze({
  informal: 'Informal conference or meeting with the appraiser',
  hearing: 'Formal hearing before the board',
});

export const STATE_RULES = Object.freeze({
  TX: [
    'Ask the appraisal district, in writing, for a copy of the evidence it will use at your hearing (Texas Tax Code s. 41.461 entitles you to it, free). Do it as soon as you get your hearing notice.',
    'You can appear in person, by phone or video, or send a sworn affidavit with your evidence instead of attending. Boards generally dismiss a protest when the owner does neither.',
    'Bring the number of evidence copies your ARB\'s hearing procedures ask for (they come with your notice).',
  ],
  FL: [
    'At least 15 days before the hearing, give the property appraiser a list of your evidence and copies of it (s. 194.011(4)(a), Florida Statutes). Your kit\'s evidence pages are that evidence.',
    'In the same letter, ask IN WRITING for the property appraiser\'s evidence. They must then give it to you at least 7 days before the hearing (s. 194.011(4)(b)).',
    'If you ticked "I will not attend", the board decides on the papers you sent. You do not need to go.',
  ],
  GA: [
    'If you want the county\'s documents (its comparable sales and worksheets), ask in writing at least 10 days before the hearing; they are due at least 7 days before (Ga. Comp. R. & Regs. 560-11-12-.02).',
    'On value, the county board of assessors carries the burden of proof. You present your evidence; they must support theirs.',
    'Need a different date? Ask the board in writing as early as you can. Postponement is at the board\'s discretion (560-11-12-.04).',
  ],
});

const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };

/** The figures of their own case, from the kit we built. Unknown figures are left out, never guessed. */
export function caseSummary(kitOrder, state) {
  const k = kitOrder || {};
  const st = String(state || k.state || '').toUpperCase();
  if (st === 'GA') return { countyValue: n(k.noticeValue), asked: n(k.requestedValue), indicated: n(k.evidence?.indicatedValue), comps: Array.isArray(k.comps) ? k.comps.length : null, basis: 'recorded sales of similar homes' };
  if (st === 'TX') return { countyValue: n(k.packet?.grid?.subject?.appraisedValue), asked: n(k.packet?.requestedValue ?? k.packet?.form50132?.opinionOfValue), indicated: n(k.packet?.grid?.indicatedAppraised), comps: n(k.packet?.grid?.compCount), basis: 'how the district itself values similar homes nearby (equal and uniform)' };
  if (st === 'FL') return { countyValue: n(k.parcel?.jv), asked: n(k.requestedValue), indicated: n(k.comps?.indicatedValue), comps: Array.isArray(k.comps?.list) ? k.comps.list.length : null, basis: 'sales the property appraiser itself qualified' };
  return { countyValue: null, asked: null, indicated: null, comps: null, basis: null };
}

/** The hearing as entered. Pure: rejects dates in the past or more than a year out. */
export function cleanHearing(b, now = new Date()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.date || '')) ? b.date : null;
  if (!date) return { error: 'date' };
  const days = daysToDeadline(new Date(`${date}T00:00:00Z`), now);
  if (days === null || days < 0 || days > 366) return { error: 'date' };
  const time = /^\d{1,2}:\d{2}$/.test(String(b?.time || '')) ? b.time : null;
  const kind = HEARING_KINDS[b?.kind] ? b.kind : 'hearing';
  const mode = ['in_person', 'phone_video', 'affidavit', 'not_attending'].includes(b?.mode) ? b.mode : null;
  return { date, time, kind, mode };
}

/** What the daily cron sends for a row today: 'reminder' | 'followup' | null. Pure. */
export function hearingDue(row, now = new Date()) {
  const h = row?.kit_order?.after?.hearing;
  if (!h?.date || row?.payment_status !== 'paid') return null;
  if (['approved', 'partial', 'denied'].includes(row?.dispute_status)) return null;
  if (row?.kit_order?.after?.outcome && row.kit_order.after.outcome.answer !== 'waiting') return null;
  const days = daysToDeadline(new Date(`${h.date}T00:00:00Z`), now);
  if (days === null) return null;
  if (days >= 0 && days <= 2 && !h.remindedAt) return 'reminder';
  if (days <= -1 && days >= -10 && !h.followedAt) return 'followup';
  return null;
}

const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The one-page sheet, as PDF bytes. */
export async function hearingSheetPdf(row) {
  const st = String(row.state_code || '').toUpperCase();
  const k = row.kit_order || {};
  const h = k.after?.hearing || {};
  const c = caseSummary(k, st);
  const doc = await PDFDocument.create();
  doc.setTitle('Your hearing'); doc.setProducer('TaxAppeal USA');
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const f = new Flow(doc.addPage([PAGE_W, PAGE_H]), fonts);
  f.h1(`Your ${h.kind === 'informal' ? 'informal conference' : 'hearing'}: what to bring and what to say`);
  f.text(`${winAnsi(k.property?.address || '')}${k.taxYear ? `, tax year ${k.taxYear}` : ''}.`, { size: 10 });
  if (h.date) f.text(`${longDay(h.date)}${h.time ? ` at ${h.time}` : ''}. Check the exact time and place on your notice.`, { size: 10, bold: true, gap: 8 });

  f.h2('Your case in one minute');
  const lines = [];
  if (c.countyValue) lines.push(`The value set for your home: ${money(c.countyValue)}.`);
  if (c.indicated) lines.push(`What ${c.basis} indicate: ${money(c.indicated)}${c.comps ? ` (${c.comps} comparable homes, in the evidence pages of your kit)` : ''}.`);
  if (c.asked) lines.push(`The value you asked for: ${money(c.asked)}.`);
  lines.push('Say it in that order, point to the evidence pages, and stop. Stick to the evidence about the value: the board decides what the home is worth, not what the tax bill should be.');
  for (const l of lines) f.text(l, { size: 10.5, gap: 2 });
  f.space(4);

  f.h2('Bring');
  for (const l of [
    'Your notice and this sheet.',
    'The evidence pages from your kit, printed again from the PDF copy we emailed you, with spare copies (check your notice for how many).',
    'Photos or repair estimates for anything wrong with the house that the county may not know about.',
  ]) f.check(l, { size: 10 });

  f.h2(`Rules for ${({ GA: 'Georgia', TX: 'Texas', FL: 'Florida' })[st] || 'your state'}`);
  for (const l of STATE_RULES[st] || []) f.text(`- ${l}`, { size: 9.5, gap: 3 });

  f.h2('At the meeting');
  for (const l of [
    `Listen to ${BOARD[st] || 'the board'} first if they go first; note any sale or number they use that you have not seen.`,
    'If they offer a lower value before or at the meeting, you may accept or decline. Ask for any agreement in writing.',
    'Be brief and polite. Most meetings take 15 minutes or less.',
  ]) f.text(`- ${l}`, { size: 9.5, gap: 3 });

  f.space(6);
  f.text(`TaxAppeal USA prepares ${DOC[st] || 'appeal'} documents. We do not attend hearings or represent you. Your notice and the board's own procedures govern; if they differ from this sheet, follow them. Questions: customerservice@taxappealusa.com`, { size: 8, color: GREY });
  return doc.save();
}

export function hearingEmail(row, stage, link) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const h = row.kit_order?.after?.hearing || {};
  const when = h.date ? longDay(h.date) : 'your hearing date';
  const word = h.kind === 'informal' ? 'informal conference' : 'hearing';
  if (stage === 'followup') {
    return {
      subject: `How did your ${word} go?`,
      text: [`Hi ${first},`, '', `Your ${word} was on ${when}. When you hear the decision, tell us here (it takes ten seconds):`, '', link, '', 'If the value was not lowered, next year\'s kit is free once you upload the decision letter on the same page.', '', 'Questions: customerservice@taxappealusa.com'].join('\n'),
    };
  }
  return {
    subject: stage === 'reminder' ? `Your ${word} is on ${when}` : `Your ${word} sheet: what to bring and what to say`,
    text: [
      `Hi ${first},`,
      '',
      stage === 'reminder' ? `A reminder: your ${word} is on ${when}${h.time ? ` at ${h.time}` : ''}.` : `Thank you for telling us about your ${word} on ${when}.`,
      '',
      'Attached is a one-page sheet: your case in one minute, what to bring, and the rules for your state (including how to get the county\'s evidence before the day).',
      'Print the evidence pages again from the PDF copy of your kit we emailed you, and bring spare copies.',
      '',
      `Changed date or need to tell us something? ${link}`,
      '',
      'TaxAppeal USA does not attend hearings or represent you; the sheet is there to help you present your own case.',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}
