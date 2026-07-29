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

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

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
    letterContent, propertyAddress, county, sessionId,
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
      const fullAttachmentHtml = letterContent;

      const checkPayload = {
        description: `${county} County VAB Filing Fee — ${propertyAddress}`,
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
        memo: `${county} County VAB Filing Fee`,
        // For FL: letterContent IS the complete DR-486 HTML generated by generate-dr486.js
        // It already contains: DR-486 form (all 5 parts) + DR-486A + evidence
        // We use it directly — do not use the rebuilt letterHtml template
        attachment: fullAttachmentHtml,
        merge_variables: { letter_content: fullAttachmentHtml },
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
