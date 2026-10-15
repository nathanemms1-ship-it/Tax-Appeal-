/**
 * lib/kit/lobKit.js — send one kit PDF to Lob as a letter to the CUSTOMER.
 *
 * Kit model (10 Oct 2026): we mail the customer, never the county. The layout's
 * Lob options (return envelope, perforated page 7, address on page 1, B&W,
 * double-sided, first class, NO certified) come from the kit builder, so a
 * layout change and its Lob options cannot drift apart.
 *
 * The PDF goes as a multipart upload: a kit is a few hundred KB to ~2 MB (Cobb's
 * form alone is 1.4 MB), far past what an inline HTML `file` can carry. Proven
 * against Lob test mode on 12 Oct (scripts/kit/ga-kit-proof.mjs).
 *
 * IDEMPOTENCY: every call carries Lob's Idempotency-Key header, derived from the
 * order id. Lob returns the original letter for a repeated key instead of
 * printing a second one, so a retried webhook, a cron re-run and an admin
 * "send now" can never mail the same customer twice.
 *
 * SPEND CEILING: checkSpend('lob') before every letter (lib/spendGuard.js), like
 * send-letter.js. A retry loop upstream must not be able to print unbounded mail.
 */
import { checkSpend as defaultCheckSpend } from '../spendGuard';

// Our return address: lib/businessInfo.js BUSINESS_ADDRESS_LINES.
export const KIT_FROM = Object.freeze({
  name: 'TaxAppeal USA', address_line1: '3130 Sabine St, Ste B',
  address_city: 'Forest Hill', address_state: 'TX', address_zip: '76119',
});

export class LobKitError extends Error {
  constructor(code, message, detail) { super(message); this.code = code; this.detail = detail; }
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** The customer's address as Lob wants it. Refuses rather than guessing. */
export function lobRecipient({ name, street, street2, city, state, zip }) {
  const to = {
    name: clean(name), address_line1: clean(street), address_line2: clean(street2) || undefined,
    address_city: clean(city), address_state: clean(state).toUpperCase(), address_zip: clean(zip),
  };
  if (!to.name || !to.address_line1 || !to.address_city || !to.address_zip) {
    throw new LobKitError('recipient_incomplete', 'The customer mailing address is incomplete');
  }
  if (!/^[A-Z]{2}$/.test(to.address_state)) throw new LobKitError('recipient_incomplete', `State "${state}" is not a 2-letter code`);
  if (!/^\d{5}(-\d{4})?$/.test(to.address_zip)) throw new LobKitError('recipient_incomplete', `ZIP "${zip}" is not valid`);
  // Lob's limits: name 40, address lines 64. A truncated name on a real letter is
  // a defect we would rather catch here than on the envelope.
  if (to.name.length > 40) to.name = to.name.slice(0, 40);
  if (to.address_line1.length > 64 || (to.address_line2 || '').length > 64) {
    throw new LobKitError('recipient_too_long', 'An address line is longer than Lob accepts (64)');
  }
  return to;
}

/**
 * @param {object} p
 * @param {Uint8Array} p.pdf           the kit
 * @param {object} p.to                from lobRecipient()
 * @param {object} p.lob               LOB_KIT_OPTIONS from the kit builder
 * @param {string} p.idempotencyKey    e.g. `kit-${orderId}`
 * @param {string} p.description
 * @param {object} [p.metadata]        flat string map (Lob: 20 keys, 500 chars)
 * @param {string} [p.apiKey]          defaults to LOB_API_KEY
 * @param {Function} [p.fetchImpl]     injectable for tests
 * @param {Function} [p.checkSpend]    injectable for tests
 * @returns {Promise<{ id: string, expectedDeliveryDate: string|null, url: string|null }>}
 */
export async function mailKit({ pdf, to, lob, idempotencyKey, description, metadata = {}, apiKey = process.env.LOB_API_KEY, fetchImpl = fetch, checkSpend = defaultCheckSpend }) {
  if (!apiKey) throw new LobKitError('no_key', 'LOB_API_KEY is not set');
  if (!idempotencyKey) throw new LobKitError('no_idempotency_key', 'Refusing to mail without an idempotency key');
  if (!pdf || !pdf.length) throw new LobKitError('no_pdf', 'No kit PDF');
  // These four are what make it a kit and not a filing. Checked here as well as in
  // the builder: this is the last line before a real letter is printed.
  if (lob?.return_envelope !== true || !lob?.perforated_page || lob?.address_placement !== 'top_first_page' || 'extra_service' in (lob || {})) {
    throw new LobKitError('bad_lob_options', 'Kit Lob options are not the kit layout (return envelope, perforated page, address on page 1, no certified)');
  }

  if (!(await checkSpend('lob', 1)).ok) {
    throw new LobKitError('mail_ceiling', 'Daily Lob ceiling reached: refusing to mail a kit');
  }

  const form = new FormData();
  form.append('description', String(description || 'Appeal kit').slice(0, 255));
  for (const [k, v] of Object.entries(to)) if (v !== undefined) form.append(`to[${k}]`, v);
  for (const [k, v] of Object.entries(KIT_FROM)) form.append(`from[${k}]`, v);
  for (const [k, v] of Object.entries(lob)) form.append(k, String(v));
  for (const [k, v] of Object.entries(metadata)) form.append(`metadata[${k}]`, String(v).slice(0, 500));
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'kit.pdf');

  const res = await fetchImpl('https://api.lob.com/v1/letters', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`, 'Idempotency-Key': idempotencyKey },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) {
    throw new LobKitError('lob_refused', `Lob refused the kit (${res.status}): ${data?.error?.message || 'no id returned'}`, data);
  }
  return { id: data.id, expectedDeliveryDate: data.expected_delivery_date || null, url: data.url || null };
}
