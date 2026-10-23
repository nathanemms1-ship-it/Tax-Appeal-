/**
 * lib/kit/forms/gaForms.js — WHICH appeal form each Georgia county gets, and how
 * to fill it.
 *
 * The Florida lesson (claude/Filing_Instrument_Audit_All_States_2026-09-10.md):
 * fill the official form, never a look-alike, and where a county publishes its
 * own version, use the county's. The 12 Oct 2026 sweep of the top 25 counties
 * (claude/GA_County_Form_Sweep_2026-10-12.md) sorted every county into one of:
 *
 *   'state'    county posts or links the DOR PT-311A (or asks for it by name)
 *   'county'   county publishes its own version, embedded here, used instead
 *   'pending'  county publishes its own version but we do not hold the file yet.
 *              Not sellable until added.
 *
 * A county form with a PRE-PRINTED digest year (Cobb prints "2026") is only
 * usable for that year: the kit refuses any other tax year until the county's
 * new form is embedded. A wrong year on the form is a defective appeal.
 *   'call'     the county's website does not settle it. Not sellable until the
 *              phone call is made and this table updated.
 *
 * A county missing from the table is not sellable. Proof kits (`proof: true`)
 * fall back to the state form so a sample can always be rendered; they carry the
 * SAMPLE watermark and can never be filed.
 */
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { PT311A_BASE64, PT311A_SHA256, PT311A_REVISION } from './pt311a';
import { DEKALB_BASE64, DEKALB_SHA256 } from './dekalb';
import { CHATHAM_BASE64, CHATHAM_SHA256 } from './chatham';
import { FULTON_BASE64, FULTON_SHA256 } from './fulton';
import { COBB_BASE64, COBB_SHA256 } from './cobb';
import { winAnsi, money } from '../pdfText';

export class FormError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const GA_COUNTY_FORMS = Object.freeze({
  // county's own version, embedded
  DEKALB: 'county', CHATHAM: 'county', FULTON: 'county', COBB: 'county',
  // state form: posted byte-identical, same text, linked, or asked for by name
  GWINNETT: 'state', HALL: 'state', PAULDING: 'state', COLUMBIA: 'state', MUSCOGEE: 'state',
  RICHMOND: 'state', FAYETTE: 'state', BARTOW: 'state', HENRY: 'state', COWETA: 'state',
  WALTON: 'state', LOWNDES: 'state', WHITFIELD: 'state', FORSYTH: 'state',
  // Settled online, 22 Oct 2026 (no phone calls, Nathan's rule):
  //   BIBB     its "Appeal of Assessment Form" link downloads the PT-311A from dor.georgia.gov
  //   CARROLL  its appeals page (qPublic) posts a PT-311A copy; email appeals need the form attached
  //   HOUSTON  FAQ: file "a written appeal", names no county form; sends owners to DOR for forms
  //   CLAYTON  "The appeal must be made in writing"; no county paper form exists (online portal only)
  BIBB: 'state', CARROLL: 'state', HOUSTON: 'state', CLAYTON: 'state',
  // Its own form (a .docx with digest year 2026 and a 30 July 2026 deadline printed):
  // not held, and a 2027 version is needed before 2027 kits.
  CHEROKEE: 'pending',
  // Not settled online: Douglas's form link is a 404; Newton names no form and blocks access.
  DOUGLAS: 'call', NEWTON: 'call',
});

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const shortComment = (o) => `Above fair market value. Sales of ${o.comps.length} similar homes indicate ${money(o.evidence.indicatedValue)}. See attached evidence.`;

/**
 * Each form: the file, its hash, and a pure function saying exactly what goes in
 * which field. Signature and date fields are never filled: the owner signs and
 * dates in ink. Agent fields are never filled: the owner is the appellant.
 */
export const GA_FORMS = Object.freeze({
  STATE: {
    id: 'STATE', label: 'Georgia DOR PT-311A', revision: PT311A_REVISION,
    base64: PT311A_BASE64, sha256: PT311A_SHA256,
    signStep: 'SIGN and DATE the appeal form (page 3) on the line "Signature of Property Owner or Agent". Use a pen. The owner named on the form signs.',
    fields(o) {
      const ow = o.owner;
      const text = {
        Year: [String(o.taxYear), 11],
        Name: [ow.name, 10],
        Address: [ow.street, 10],
        City: [ow.city, 10],
        State: [ow.state, 10],
        Zip: [ow.zip, 10],
        'Property ID Number': [o.property.parcelId, 10],
        'Property Description': [o.property.address, o.property.address.length > 38 ? 7 : 9],
        'Owners value assertion': [money(o.requestedValue), 11],
        'Property Owner Comments': [`The value on the notice (${money(o.noticeValue)}) is above fair market value.`, 9],
        'Property Owner Comments2': [`Recorded sales of ${o.comps.length} similar homes indicate ${money(o.evidence.indicatedValue)}. See the attached evidence page.`, 9],
      };
      if (nonEmpty(ow.street2)) text.Address_2 = [ow.street2, 10];
      if (nonEmpty(ow.phone)) text['Home Phone'] = [ow.phone, 9];
      if (nonEmpty(ow.email)) text['Email Address'] = [ow.email, ow.email.length > 22 ? 6 : 8];
      return { text, checks: ['Real', 'Value', 'Residential'], radios: [['Group11', 'Choice1']] }; // Choice1 = BOE
    },
  },
  DEKALB: {
    id: 'DEKALB', label: 'DeKalb County PT-311-A (Modernized)', revision: 'PT-311-A (Modernized), fillable 08/31/2026',
    base64: DEKALB_BASE64, sha256: DEKALB_SHA256,
    signStep: 'SIGN and DATE the appeal form (page 3) in the "Signature of Property Owner or Agent" and "Date" boxes. Use a pen. The owner named on the form signs.',
    fields(o) {
      const ow = o.owner;
      const text = {
        digest_year: [String(o.taxYear), 10],
        owner_name: [ow.name, 10],
        address1: [ow.street, 10],
        city: [ow.city, 10],
        state: [ow.state, 10],
        zip: [ow.zip, 10],
        property_id: [o.property.parcelId, 10],
        property_description: [o.property.address, 10],
        owners_value: [money(o.requestedValue), 11],
        owner_comments: [shortComment(o), 9],       // field maxLength 100
      };
      if (nonEmpty(ow.street2)) text.address2 = [ow.street2, 10];
      if (nonEmpty(ow.phone)) text.home_phone = [ow.phone, 9];
      if (nonEmpty(ow.email)) text.email = [ow.email, 8];
      return { text, checks: ['class_res', 'ground_value'], radios: [['property_type', 'Real'], ['appeal_path', 'BOE']] };
    },
  },
  CHATHAM: {
    id: 'CHATHAM', label: 'Chatham County Property Assessment Appeal Form', revision: 'Chatham BOA PT311A (LiveCycle, 2018)',
    base64: CHATHAM_BASE64, sha256: CHATHAM_SHA256,
    signStep: 'PRINT your name on the "PRINT NAME" line, then SIGN on the "SIGNATURE" line of the appeal form (page 3). Use a pen. The owner named on the form signs.',
    needs: ['ownedOnJan1'],
    fields(o) {
      const P = 'Form1[0].Page1[0].';
      const ow = o.owner;
      const text = {
        [`${P}TAXYEAR[0]`]: [String(o.taxYear), 10],
        [`${P}OWNERSNAME[0]`]: [ow.name, 10],
        [`${P}APPEALLANTADDRESS[0]`]: [[ow.street, ow.street2, `${ow.city}, ${ow.state} ${ow.zip}`].filter(nonEmpty).join('\n'), 10],
        [`${P}PIN[0]`]: [o.property.parcelId, 9],
        [`${P}PROPERTYDESCRIPTION[0]`]: [o.property.address, 9],
        [`${P}TextField10[0]`]: [money(o.requestedValue), 11],   // Owner's value assertion
        [`${P}TextField5[0]`]: [shortComment(o), 9],             // Appellant comments
      };
      if (nonEmpty(ow.phone)) text[`${P}TextField1[0]`] = [ow.phone, 9];   // Primary phone
      if (nonEmpty(ow.email)) text[`${P}TextField3[0]`] = [ow.email, 9];   // Email address
      return {
        text,
        checks: [`${P}#subform[0].#subform[1].Value_Check[0]`],
        radios: [
          [`${P}APPEALTYPELIST[0]`, '1'],                 // 1 = Real
          [`${P}#subform[2].APPEALTOLIST[0]`, '1'],       // 1 = BOE (top choice)
          [`${P}#subform[3].PROPCLASS[0]`, 'R'],          // R = Residential
          [`${P}SIGNEDBYLIST[0]`, o.ownedOnJan1 ? '1' : '2'], // 1 = owner on Jan 1, 2 = new owner after Jan 1
        ],
      };
    },
  },
  FULTON: {
    id: 'FULTON', label: 'Fulton County PT-311-A', revision: 'Fulton BOA PT-311-A (235 Peachtree St NE Suite 1400), 2023',
    base64: FULTON_BASE64, sha256: FULTON_SHA256,
    signStep: 'SIGN the appeal form (page 3) on the line "Signature of Property Owner or Agent". Use a pen. The owner named on the form signs. Your name is already printed below it.',
    needs: ['fultonBilling100'],
    fields(o) {
      const ow = o.owner;
      const G = 'Specify Grounds for Appeal Value Uniformity Taxability Check all that apply Exemption Denied Breach of Covenant Denial of Covenant';
      const addr = [ow.street, ow.street2, `${ow.city}, ${ow.state} ${ow.zip}`].filter(nonEmpty).join(', ');
      const text = {
        'Property Owners Name': [ow.name, 9],
        Address: [addr, addr.length > 40 ? 6.5 : 8],          // the form has one address line
        'Property ID Number': [o.property.parcelId, 9],
        'Property Description': [o.property.address, 9],
        [`${G}Row1`]: ['X', 9],                               // the cell under "Value"
        'You must select one of the following optionsRow1': ['X', 9], // the BOE row
        "Owner's Value": [money(o.requestedValue).replace('$', ''), 10], // the form prints the $
        'Property Owner CommentsRow1': [`The value on the notice (${money(o.noticeValue)}) is above fair market value.`, 9],
        'Property Owner CommentsRow2': [`Recorded sales of ${o.comps.length} similar homes indicate ${money(o.evidence.indicatedValue)}.`, 9],
        'Property Owner CommentsRow3': ['See the attached evidence page.', 9],
        'Print Name OwnerAgent': [ow.name, 9],               // printed name, not a signature
      };
      if (nonEmpty(ow.phone)) text['Home Phone'] = [ow.phone, 9];
      if (nonEmpty(ow.email)) text['Email Address'] = [ow.email, 9];
      // Billing Preference: Check Box6 = 85% (the statutory default), Check Box7 = 100%.
      const checks = [o.fultonBilling100 ? 'Check Box7' : 'Check Box6'];
      // Virtual hearing consent: Check Box4 = Yes, Check Box5 = No. Only if the customer answered.
      if (typeof o.virtualHearing === 'boolean') checks.push(o.virtualHearing ? 'Check Box4' : 'Check Box5');
      return { text, checks, radios: [['Group1', 'Choice1']] };    // Choice1 = Real Property
    },
    // The digest-year box on Fulton's form has no field. Write the year in it,
    // as the owner would by hand (x/y in points from the bottom-left).
    overlays: (o) => [{ text: String(o.taxYear), x: 382, y: 650, size: 10 }],
  },
  COBB: {
    id: 'COBB', label: 'Cobb County Appeal Form (PT-311-A Rev May 2020)', revision: 'Cobb BTA PT-311-A (Rev May 2020), digest year 2026 pre-printed',
    base64: COBB_BASE64, sha256: COBB_SHA256,
    printedYear: 2026,
    signStep: 'SIGN and DATE the appeal form (page 3) on the line "Signature of Property Owner or Agent". Use a pen. The owner named on the form signs.',
    // "Clear Form" / "Print Form" buttons would print on the page.
    removeFields: ['Button1', 'Button2'],
    fields(o) {
      const ow = o.owner;
      const text = {
        Name: [ow.name, 9],
        Mailing: [ow.street, 9],
        City: [ow.city, 9],
        State: [ow.state, 9],
        Zip: [ow.zip, 9],
        'Property ID Number': [o.property.parcelId, 9],
        'Property Description': [o.property.address, 8],
        'Owners Value': [money(o.requestedValue).replace('$', ''), 12], // the form prints the $
        'Property Owner Comments': [`The value on the notice (${money(o.noticeValue)}) is above fair market value.`, 9],
        'Property Owner Comments1': [`Recorded sales of ${o.comps.length} similar homes indicate ${money(o.evidence.indicatedValue)}.`, 9],
        'Property Owner Comments2': ['See the attached evidence page.', 9],
      };
      if (nonEmpty(ow.street2)) text.Address = [ow.street2, 9];
      if (nonEmpty(ow.phone)) text['Home Phone'] = [ow.phone, 9];
      if (nonEmpty(ow.email)) text['Email address'] = [ow.email, 7];
      return {
        text, checks: [],
        radios: [['Property Appeal Type', 'Real'], ['Value', 'Value'], ['Hearing Options', 'BOE'], ['Property Class', 'Choice1']], // Choice1 = Residential
      };
    },
  },
});

const normCounty = (c) => String(c || '').toUpperCase().replace(/\s+COUNTY$/, '').trim();

/** The form spec for a county, or a FormError saying why it cannot be sold yet. */
export function formForCounty(county, { proof = false, taxYear = null } = {}) {
  const c = normCounty(county);
  const status = GA_COUNTY_FORMS[c];
  if (status === 'county') {
    const f = GA_FORMS[c];
    if (f.printedYear && taxYear && f.printedYear !== Number(taxYear)) {
      if (proof) return GA_FORMS.STATE;
      throw new FormError('county_form_wrong_year', `${c} County's form has digest year ${f.printedYear} printed on it; tax year ${taxYear} needs the county's new form`);
    }
    return f;
  }
  if (status === 'state') return GA_FORMS.STATE;
  if (proof) return GA_FORMS.STATE;
  if (status === 'pending') throw new FormError('county_form_missing', `${c} County publishes its own appeal form and we do not hold it yet`);
  throw new FormError('county_form_unconfirmed', `${c} County: which appeal form it accepts is not confirmed`);
}

/** Fill a form spec for an order. Returns a one-page, flattened PDFDocument. */
export async function fillForm(spec, o) {
  for (const k of spec.needs || []) {
    if (typeof o[k] !== 'boolean') throw new FormError(`need_${k}`, `${spec.label} needs the order field "${k}"`);
  }
  const doc = await PDFDocument.load(Buffer.from(spec.base64, 'base64'));
  // LiveCycle forms (Chatham) carry an XFA copy that some renderers prefer to the
  // AcroForm we fill. Drop it so every renderer prints the filled fields.
  doc.catalog.lookup(PDFName.of('AcroForm'))?.delete(PDFName.of('XFA'));
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  for (const name of spec.removeFields || []) form.removeField(form.getField(name));
  const v = spec.fields(o);
  for (const [name, [value, size]] of Object.entries(v.text)) {
    const f = form.getTextField(name);
    const text = winAnsi(value);
    const max = f.getMaxLength();
    if (max !== undefined && text.length > max) throw new FormError('field_too_long', `${spec.id} field "${name}" holds ${max} characters, got ${text.length}`);
    f.setText(text);
    f.setFontSize(size);
  }
  for (const name of v.checks) form.getCheckBox(name).check();
  for (const [name, value] of v.radios) form.getRadioGroup(name).select(value);
  form.updateFieldAppearances(helv);
  // County and DOR "on" appearances can draw ZapfDingbats glyphs that are not
  // embedded ("NO GLYPH" in the box). Redraw the ones we set with pdf-lib's
  // vector marks.
  for (const name of v.checks) form.getCheckBox(name).updateAppearances();
  for (const [name] of v.radios) form.getRadioGroup(name).updateAppearances();
  form.flatten();
  // A flattened appearance stream without /Subtype is rejected by viewers
  // ("XObject subtype is missing"); the DOR file has one.
  const page = doc.getPage(0);
  const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'));
  for (const [, ref] of xobjects ? xobjects.entries() : []) {
    const d = doc.context.lookup(ref)?.dict;
    if (!d) continue;
    if (!d.get(PDFName.of('Subtype'))) d.set(PDFName.of('Subtype'), PDFName.of('Form'));
    if (!d.get(PDFName.of('Type'))) d.set(PDFName.of('Type'), PDFName.of('XObject'));
  }
  // Flatten leaves /Annots pointing at removed widgets. A printed form keeps none.
  page.node.delete(PDFName.of('Annots'));
  for (const ov of spec.overlays ? spec.overlays(o) : []) {
    page.drawText(winAnsi(ov.text), { x: ov.x, y: ov.y, size: ov.size, font: helv });
  }
  return doc;
}
