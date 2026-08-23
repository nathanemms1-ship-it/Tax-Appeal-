// pages/api/send-letter.js
//
// Delivery-only model: the property owner signs their own protest electronically
// and TaxAppeal prepares + mails it.
//
// SECURITY — THIS ENDPOINT WRITES REAL CHECKS FROM A REAL BANK ACCOUNT.
// It was previously unauthenticated with the check amount, payee, and destination
// address all taken from req.body, drawn on LOB_BANK_ACCOUNT_ID. A single curl
// could mail an arbitrary-value check to an arbitrary address. It is now:
//   1. Restricted to internal server-side callers via INTERNAL_API_SECRET.
//   2. Deriving the FL fee, payee, and mailing address SERVER-SIDE from the
//      verified tables — client-supplied values are ignored entirely.
//   3. Idempotent per Stripe session, so a page refresh cannot cut a second check.
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { getFlVabFee } from '../../lib/flCountyFees';
import { getFlVabAddress } from '../../lib/flVabAddresses';
import { checkSpend } from '../../lib/spendGuard';
import { getFilingWindowStatus } from '../../lib/filingWindows';
import { alertOps } from '../../lib/alertOps';

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

/** See the memo comment in the FL cheque payload for why this exists. */
function buildCheckMemo({ parcelId, ownerName, county }) {
  const parcel = String(parcelId || '').trim();
  if (parcel) return `VAB fee - Parcel ${parcel}`.slice(0, 40);
  const surname = String(ownerName || '').trim().split(/\s+/).filter(Boolean).pop();
  if (surname) return `VAB fee - ${surname}`.slice(0, 40);
  // Same strip-then-append as pages/api/checkout.js. This one lands in the MEMO
  // FIELD OF A REAL CHEQUE to the Clerk, so "Broward County County VAB Filing
  // Fee" would be printed and posted. Usually shadowed by the parcel-number memo
  // above, which is why it never surfaced.
  return `${String(county || '').replace(/\s+County$/i, '').trim()} County VAB Filing Fee`.slice(0, 40);
}

function authorized(req) {
  const secret = process.env.INTERNAL_API_SECRET;
  // Fail CLOSED. If the secret isn't configured we refuse rather than fall back
  // to "anyone can mail a check" — the previous cron-secret bug taught us that
  // `!== \`Bearer ${undefined}\`` is an authentication bypass, not a default.
  if (!secret) return false;
  const provided = req.headers['x-internal-secret'];
  if (!provided || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const {
    districtName, districtAddress, districtCity, districtState, districtZip,
    ownerName, ownerStreet, ownerCity, ownerState, ownerZip, ownerEmail,
    letterContent, propertyAddress, county, parcelId, sessionId,
    stateCode, isFL, ownerSignatureName, ownerSignatureDate,
    // Owner e-signature (all states)
    signedName, signedAt, signatureImage,
  } = req.body;

  if (!letterContent || !ownerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // The owner must sign their own protest before it is mailed.
  // FL captures the owner's Part 3 signature; other states use signedAt.
  if (!signedAt && !ownerSignatureName) {
    return res.status(400).json({ error: 'Protest has not been signed by the owner' });
  }

  // IDEMPOTENCY. /success previously re-ran this on every mount, so a refresh,
  // a back-button, or reopening the emailed link mailed a second petition and cut
  // a second check — and save-order's dedupe silently discarded the second Lob id
  // so it never even appeared in the database.
  const idemKey = sessionId ? `sent-letter:${sessionId}` : null;
  if (idemKey && redis) {
    try {
      const prior = await redis.get(idemKey);
      if (prior) {
        console.log(`send-letter: already mailed for session ${sessionId}, returning cached result`);
        return res.status(200).json({ ...prior, idempotent: true });
      }
    } catch (e) { /* non-fatal; fall through */ }
  }

  const LOB_AUTH = `Basic ${Buffer.from(process.env.LOB_API_KEY + ':').toString('base64')}`;

  const remember = async (payload) => {
    if (idemKey && redis) {
      try { await redis.set(idemKey, payload, { ex: 60 * 60 * 24 * 90 }); } catch (e) { /* non-fatal */ }
    }
    return payload;
  };

  try {
    // NOTE: There is no DR-486A (or DR-486POA) attachment under the preparer model.
    // The owner signs Part 3 of the DR-486 itself, which under s. 194.011(3) is a
    // complete, independent alternative to any representative-authorization document.
    // The old DR-486A block that used to live here attached the UNCOMPENSATED
    // representative form to a petition that declared us a COMPENSATED representative,
    // citing s. 194.011(3)(h) — a provision that governs service of process and confers
    // no representation authority. See pages/api/generate-dr486.js header.

    // Owner signature block appended to non-FL protest letters (TX / GA / AR / AL)
    const sigDate = signedAt ? new Date(signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const signatureBlock = (!isFL && (signatureImage || signedName || signedAt)) ? `
<div style="margin-top:32px;font-family:Georgia,'Times New Roman',serif;font-size:11pt;color:#000;">
  <div style="border-top:1px solid #000;padding-top:12px;max-width:320px;">
    ${signatureImage
      ? `<img src="${signatureImage}" alt="Signature" style="max-height:60px;display:block;margin-bottom:4px;" />`
      : `<div style="font-style:italic;font-size:14pt;border-bottom:1px solid #000;padding-bottom:2px;">/s/ ${signedName || ownerName}</div>`}
    <div style="font-size:10pt;margin-top:4px;">${ownerName} — Property Owner${sigDate ? `, electronically signed ${sigDate}` : ''}</div>
  </div>
</div>` : '';

    const letterHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.6;color:#000;margin:0;padding:0;}.letter-body{white-space:pre-wrap;word-wrap:break-word;}</style>
</head>
<body>
  <div class="letter-body">{{letter_content}}</div>
  ${signatureBlock}
</body>
</html>`;

    // ========================================================================
    // FLORIDA PATH — Lob Checks API: VAB filing-fee check + DR-486 petition
    // ========================================================================
    if (isFL) {
      // Derive EVERYTHING server-side from the verified tables. Client-supplied
      // vabFee / vabPayableTo / district* are ignored.
      //
      // Two bugs are fixed here:
      //   1. The check was made payable to `districtName` — the PROPERTY APPRAISER
      //      resolved by /api/lookup. vabPayableTo (the actual Clerk of the VAB)
      //      appeared only in the memo line and a console.log, never as the payee.
      //      The county could not deposit the check.
      //   2. Worse, the PETITION went to the Property Appraiser too. A VAB petition
      //      filed with the property appraiser is not a filed petition — it bounces,
      //      the 25-day window closes, and the homeowner loses the year.
      const feeInfo = getFlVabFee(county);
      const vabAddr = getFlVabAddress(county);

      if (!vabAddr) {
        console.error(`send-letter: refusing to mail — no verified VAB address for ${county} County, FL`);
        return res.status(400).json({
          error: `No verified Value Adjustment Board address for ${county} County. Refusing to mail.`,
          code: 'FL_COUNTY_UNSUPPORTED',
        });
      }
      if (!feeInfo || !feeInfo.vabFee || feeInfo.vabFee <= 0) {
        return res.status(400).json({ error: `No verified VAB filing fee for ${county} County. Refusing to mail.` });
      }
      // The address table and the fee table are verified independently. Columbia,
      // Levy and Nassau have a CONFIRMED address but an ESTIMATED ($50 guess) fee,
      // so they passed the address gate and would have had a guessed check mailed.
      // An overpayment creates refund friction; an underpayment gets the petition
      // rejected and the homeowner loses the year.
      if (feeInfo.confidence !== 'confirmed') {
        console.error(`send-letter: refusing to mail — ${county} County VAB fee is ${feeInfo.confidence}, not confirmed`);
        return res.status(400).json({
          error: `The Value Adjustment Board filing fee for ${county} County has not been confirmed. Refusing to mail a guessed amount.`,
          code: 'FL_FEE_UNCONFIRMED',
        });
      }

      const checkAmountDollars = (feeInfo.vabFee / 100).toFixed(2);
      console.log(`FL order: Lob check $${checkAmountDollars} payable to "${feeInfo.payableTo}" → ${vabAddr.vabName}`);

      // letterContent is the complete DR-486 HTML from generate-dr486.js. Under the
      // preparer model the owner signs Part 3 and Parts 4/5 are N/A, so there is no
      // DR-486A (or any other authorization form) to attach — the signature on the
      // petition itself is the authorization under s. 194.011(3).
      //
      // ====================================================================
      // WHY THE PETITION GOES IN merge_variables AND NOT IN `attachment`
      // ====================================================================
      // Lob caps INLINE HTML at 10,000 characters:
      //   "HTML must be less than 10000 characters (to use longer HTML, pass a
      //    remote URL)"
      // This block used to set `attachment: letterContent` directly. A real DR-486
      // measured 14,625 characters, so Lob rejected every Florida cheque and NO
      // Florida petition could be mailed at all. Found 5 Aug 2026 by the first live
      // end-to-end purchase; nothing else had ever exercised this call.
      //
      // The fix is the pattern the non-Florida path below has always used and which
      // has mailed successfully in production: put a SMALL wrapper in the file/
      // attachment parameter with a {{merge_variable}} placeholder, and send the long
      // content in merge_variables, which is not subject to the inline-HTML cap.
      //
      // The old code set BOTH — the full HTML in `attachment` AND the same string in
      // merge_variables, where it was never used because the attachment contained no
      // placeholder. So the duplicate was already there; it was simply the wrong half
      // that Lob was reading.
      //
      // VERIFY THIS BY EYE BEFORE TRUSTING IT. Merge substitution is documented for a
      // letter's `file`; that it also applies to a cheque's `attachment` is proven by
      // the test-mode PDF proof, not by the docs. If a proof ever renders a literal
      // "{{letter_content}}" or a blank page, this is why. scripts/verify-fl-dispatch.mjs
      // asserts the wrapper stays under the cap and carries the placeholder.
      const attachmentWrapper = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.6;color:#000;margin:0;padding:0;}.petition-body{word-wrap:break-word;}</style>
</head>
<body><div class="petition-body">{{letter_content}}</div></body>
</html>`;

      const checkPayload = {
        description: `${String(county || '').replace(/\s+County$/i, '').trim()} County VAB Filing Fee — ${propertyAddress}`,
        to: {
          name: feeInfo.payableTo,
          address_line1: vabAddr.street,
          address_line2: vabAddr.attn || undefined,
          address_city: vabAddr.city,
          address_state: vabAddr.state,
          address_zip: vabAddr.zip,
          address_country: 'US',
        },
        from: {
          name: 'TaxAppeal USA',
          address_line1: '3130 Sabine St, STE B',
          address_city: 'Forest Hill',
          address_state: 'TX',
          address_zip: '76119',
          address_country: 'US',
        },
        bank_account: process.env.LOB_BANK_ACCOUNT_ID,
        amount: parseFloat(checkAmountDollars),
        /**
         * THE MEMO IS THE ONLY THING THAT SURVIVES THE MAILROOM.
         *
         * The petition rides as this cheque's attachment, so they arrive joined —
         * but county mailrooms split them: the cheque goes to finance for deposit,
         * the petition goes to the VAB clerk. Once separated, a memo reading only
         * "<County> County VAB Filing Fee" leaves finance holding money from a Texas
         * company for an unidentifiable petition, and the clerk holding a petition
         * with no evidence the fee was paid. Under s. 194.013 the fee is a condition
         * of filing, and Florida's deadline is RECEIPT — so an unmatched fee is a
         * petition quietly held or refused, with no notice to us.
         *
         * The parcel/folio number is the right key: it is the county's own primary
         * key, it is printed in Part 1 of the DR-486 they are holding, it is short,
         * and it is public record — no personal data on the outside of a negotiable
         * instrument. Owner names have spelling variants; parcel numbers do not.
         *
         * Truncated to 40 characters deliberately. Lob does not publish the memo
         * limit and 40 is the commonly cited figure; overrunning it would error the
         * cheque and mail NOTHING, while undershooting only costs us characters.
         */
        memo: buildCheckMemo({ parcelId, ownerName, county }),
        // A small wrapper carrying the placeholder; the DR-486 itself rides in
        // merge_variables. See the long note above attachmentWrapper for why.
        attachment: attachmentWrapper,
        merge_variables: { letter_content: letterContent },
        mail_type: 'usps_first_class',
        metadata: {
          property_address: propertyAddress,
          county: county,
          owner_email: ownerEmail,
          stripe_session_id: sessionId || '',
          state_code: 'FL',
          vab_fee_cents: String(feeInfo.vabFee),
          fl_signer: ownerSignatureName || '',
        },
      };

      console.log('Sending FL Lob check:', JSON.stringify({ to: checkPayload.to, amount: checkPayload.amount, memo: checkPayload.memo }));

      // REAL MONEY, REAL MAIL, IRREVERSIBLE. This endpoint is already restricted to
      // internal callers, so the ceiling is not defending against the public — it
      // bounds the damage if a bug upstream (a retry storm, a bad cron, a loop in
      // fulfillment) starts dispatching. See lib/spendGuard.js.
      if (!(await checkSpend('lob', 1)).ok) {
        console.error('[send-letter] daily Lob ceiling reached; refusing to write a check.');
        return res.status(503).json({ error: 'Mail dispatch is paused. Please contact support.', code: 'MAIL_CEILING' });
      }

      const lobRes = await fetch('https://api.lob.com/v1/checks', {
        method: 'POST',
        headers: { 'Authorization': LOB_AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify(checkPayload),
      });

      const lobData = await lobRes.json();
      console.log('Lob check response:', JSON.stringify(lobData));

      if (!lobRes.ok) {
        console.error('Lob check error:', lobData);
        return res.status(500).json({ error: lobData?.error?.message || 'Failed to send FL check via Lob', details: lobData });
      }

      /**
       * DOES LOB THINK THIS WILL ARRIVE IN TIME?
       *
       * Florida is satisfied by physical RECEIPT, not postmark. lib/filingWindows.js
       * protects that with minDays — a static buffer, set by judgement, applied to
       * every county and every piece identically.
       *
       * On 6 Aug 2026 a live Lob cheque reported its own Expected Delivery Date Range
       * as 7-14 DAYS from creation. A buffer of 12 leaves Lob's worst case two days
       * past the deadline. Rather than pick a number and hope, check the number Lob
       * actually gives us for THIS piece.
       *
       * This does not block the mailing — by the time we know, the cheque exists and
       * cancelling it would leave the customer with nothing at all. It pages, so a
       * human has the days that remain to act: call the Clerk, confirm receipt, or
       * refund. Silence here would mean finding out in October from a dismissal notice.
       */
      const expected = lobData.expected_delivery_date;
      if (expected) {
        try {
          const ws = getFilingWindowStatus('FL', county, { strict: true });
          const expectedDate = new Date(`${expected}T00:00:00`);
          if (ws?.hardDeadline && !Number.isNaN(expectedDate.getTime()) && expectedDate > ws.hardDeadline) {
            await alertOps(
              'Petition may arrive AFTER the filing deadline',
              `county=${county} lob=${lobData.id} session=${sessionId || 'n/a'}\n\n` +
              `Lob expects delivery ${expected}. The ${county} County VAB deadline is ` +
              `${ws.hardDeadline.toISOString().slice(0, 10)}, and Florida requires physical ` +
              `RECEIPT by that date — a postmark is not sufficient.\n\n` +
              `The cheque and petition are already in Lob's hands. Act now: confirm receipt ` +
              `with the Clerk, or refund the customer before the window closes.`,
              { force: true }
            );
          }
        } catch (e) {
          console.error('[send-letter] delivery-date check failed:', e.message);
        }
      }

      return res.status(200).json(await remember({
        success: true,
        type: 'fl-check',
        letterId: lobData.id,
        trackingNumber: lobData.tracking_number || null,
        expectedDelivery: lobData.expected_delivery_date || null,
        status: lobData.status,
        url: lobData.url || null,
        checkAmount: checkAmountDollars,
        checkPayableTo: feeInfo.payableTo,
        vabName: vabAddr.vabName,
      }));
    }

    // Non-FL path: standard Lob certified letter (owner-signed, no agent form)
    const lobPayload = {
      description: `Property tax protest — ${propertyAddress}`,
      to: { name: districtName, address_line1: districtAddress, address_city: districtCity, address_state: districtState, address_zip: districtZip, address_country: 'US' },
      from: { name: ownerName, address_line1: ownerStreet, address_city: ownerCity, address_state: ownerState, address_zip: ownerZip, address_country: 'US' },
      file: letterHtml,
      merge_variables: { letter_content: letterContent },
      color: false,
      double_sided: true,
      address_placement: 'insert_blank_page',
      mail_type: 'usps_first_class',
      extra_service: 'certified',
      return_envelope: true,
      perforated_page: 1,
      metadata: { property_address: propertyAddress, county: county, owner_email: ownerEmail, stripe_session_id: sessionId || '', state_code: stateCode || '', signed_at: signedAt || '' },
    };

    console.log('Sending Lob letter:', JSON.stringify({ to: lobPayload.to, from: lobPayload.from, extra_service: lobPayload.extra_service }));

    // Same ceiling as the check path above — certified mail is ~$8-12 and cannot be
    // recalled once Lob accepts it.
    if (!(await checkSpend('lob', 1)).ok) {
      console.error('[send-letter] daily Lob ceiling reached; refusing to mail a letter.');
      return res.status(503).json({ error: 'Mail dispatch is paused. Please contact support.', code: 'MAIL_CEILING' });
    }

    const lobRes = await fetch('https://api.lob.com/v1/letters', {
      method: 'POST',
      headers: { 'Authorization': LOB_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(lobPayload),
    });

    const lobData = await lobRes.json();
    console.log('Lob response:', JSON.stringify(lobData));

    if (!lobRes.ok) {
      console.error('Lob error:', lobData);
      return res.status(500).json({ error: lobData?.error?.message || 'Failed to send letter via Lob', details: lobData });
    }

    return res.status(200).json({
      success: true, type: 'letter',
      letterId: lobData.id,
      trackingNumber: lobData.tracking_number || null,
      expectedDelivery: lobData.expected_delivery_date || null,
      status: lobData.status,
      url: lobData.url,
    });

  } catch (err) {
    console.error('Send letter error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
