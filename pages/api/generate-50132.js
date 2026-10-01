/**
 * ============================================================================
 * FORM 50-132 + THE EQUITY PACKET — the Texas filing, rendered
 * ============================================================================
 *
 * Written 7 Sept 2026. Decisions: claude/TX_Model_Decided_2026-09-04.md.
 * Anatomy and citations: claude/TX_Protest_Document_Anatomy_2026-09-01.md.
 *
 * ── WHY THERE IS NO MODEL CALL IN THIS FILE ─────────────────────────────────
 *
 * generate-pt311a.js asks Claude to write a comparable-sales analysis, because
 * Georgia gives us no roll and there is nothing else to write it from. Texas is
 * the opposite case: we hold El Paso's certified roll, so every number in this
 * document is COMPUTED from the district's own published data and every
 * comparable carries a real account number the panel can look up.
 *
 * That difference is the product. A generated paragraph about comparables is
 * argument; a grid of the district's own parcels with their own account numbers
 * is evidence. Do not add a model call here to make the prose warmer.
 *
 * ── THE 5-MINUTE CONSTRAINT ─────────────────────────────────────────────────
 *
 * Travis allots 15 minutes per hearing INCLUDING both parties, panel questions,
 * deliberation and decision — about 5-6 minutes of owner time. The packet's
 * first page therefore has to carry the entire argument: the test, the grid, the
 * median, the ask. Everything else is appendix. That constraint drove this
 * layout more than anything else.
 */

import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { getSupabaseAdmin } from './supabase';
import { buildProtest } from '../../lib/tx/protest';
import { DEFAULT_TAX_RATE } from '../../lib/tx/qualify';
import { findComps } from '../../lib/tx/comps';
import { isCovered, LOADED_CADS, coveredCadFromName } from '../../lib/tx/coverage';
import { findParcel, TX_LOOKUP, ROLL_YEAR } from '../../lib/tx/parcels';
import { resolveCounty } from './resolve-county';

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (e) { console.log('Redis init failed:', e.message); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Matches the other generators, tightened one notch: this route runs the comp
  // ladder, which can touch several hundred roll rows per call.
  if (await enforceRateLimit(req, res, 'p50132', 8, 60)) return;
  if (await enforceRateLimit(req, res, 'p50132', 60, 3600)) return;

  const b = req.body || {};
  let cadId = Number(b.cadId);
  let accountNumber = typeof b.accountNumber === 'string' ? b.accountNumber.trim() : '';
  const taxYear = Number(b.taxYear) || ROLL_YEAR;

  /**
   * ========================================================================
   * AN ADDRESS IS ENOUGH. Added 7 Sept 2026, before this shipped broken.
   * ========================================================================
   * pages/apply.js was wired to send `pd.cadId` and `pd.parcelId`. Neither
   * exists: `cadId` appeared in exactly one place in that file — the line that
   * reads it — and `parcelId` comes from the Florida property lookup, which
   * has no Texas account number. Every Texas order would have arrived here as
   * `{ accountNumber: '', cadId: null }` and been refused.
   *
   * Threading both through sessionStorage and lib/checkHandoff.js would have
   * worked and is the wrong shape: it makes a filed document depend on browser
   * storage surviving a funnel, and it puts the account number — the field the
   * whole petition hangs on — in the client's hands.
   *
   * So the route takes what the customer actually has, an address, and does
   * the same resolution /api/check does: Census county -> CAD -> findParcel.
   * That keeps this route's own rule intact — it takes no VALUE from the
   * client, only an identifier it verifies against the roll itself.
   */
  if (!accountNumber || !Number.isFinite(cadId)) {
    const street = typeof b.street === 'string' ? b.street.trim() : '';
    if (!street) {
      return res.status(400).json({ error: 'Either accountNumber and cadId, or a street address, are required.' });
    }
    try {
      const place = await resolveCounty({ street, city: b.city, zip: b.zip });
      if (!place?.found || place.state !== 'TX') {
        return res.status(400).json({ error: 'not_texas', county: place?.county || null, state: place?.state || null });
      }
      cadId = coveredCadFromName(place.county);
      if (!cadId || !isCovered(cadId)) {
        return res.status(400).json({ error: 'not_covered', county: place.county });
      }
      const found = await findParcel({ street, cadId, zip: b.zip || null, taxYear });
      if (found.status !== TX_LOOKUP.MATCHED) {
        // The same named failures /check reports. A document cannot be built on
        // an address the roll did not resolve, and guessing which parcel was
        // meant is how a petition gets filed for a house somebody does not own.
        return res.status(400).json({ error: found.status, reason: found.reason || null,
          candidates: found.candidates || null });
      }
      accountNumber = found.parcel.accountNumber;
    } catch (e) {
      console.error('[50132] address resolution failed:', e.message);
      return res.status(503).json({ error: 'lookup_failed', reason: 'county_unresolved' });
    }
  }
  // Coverage before the query, for the same reason findParcel checks it first:
  // without a roll we cannot tell "not on it" from "we never downloaded it".
  if (!isCovered(cadId)) {
    return res.status(400).json({ error: 'not_covered', county: LOADED_CADS[cadId] || null });
  }

  try {
    const db = getSupabaseAdmin();
    if (!db) return res.status(503).json({ error: 'lookup_failed', reason: 'no_database' });

    const { data, error } = await db.from('tx_parcels').select('*')
      .eq('cad_id', cadId).eq('account_number', accountNumber).eq('tax_year', taxYear).limit(1);
    if (error) return res.status(503).json({ error: 'lookup_failed', reason: 'query_error' });
    if (!data || !data.length) return res.status(404).json({ error: 'no_parcel' });

    // The untouched roll row. buildProtest, qualify and findComps all read the
    // roll's own column names -- see the seam note in lib/tx/parcels.js.
    const parcel = data[0];
    const comps = await findComps(parcel, { rollYear: taxYear, db });
    /**
     * ISSUES AND COST OVERRIDES WERE BEING DISCARDED HERE.
     *
     * pages/apply.js has sent `issues` and `costOverrides` in this body since
     * the Texas branch was written. This route never read either one — the
     * words did not appear in the file. So every defect a Texas customer
     * reported was posted, received, and dropped: the condition exhibit existed
     * only in scripts/tx/preview-protest.mjs and had never once reached a real
     * packet. Same shape as `pd.cadId` above — a field the sender sets and the
     * receiver never reads.
     */
    const issues = Array.isArray(b.issues) ? b.issues : [];
    const costOverrides = (b.costOverrides && typeof b.costOverrides === 'object')
      ? b.costOverrides : {};

    const packet = buildProtest({
      parcel, comps, taxYear, issues, costOverrides, owner: b.owner || {},
    });

    /**
     * ======================================================================
     * PREVIEW MODE: THE REAL FORM, PAGE ONE, WATERMARKED.
     * ======================================================================
     * Added 1 Oct 2026. The Texas dispute step showed a "Dispute Letter
     * Preview" panel reading "the rest of your letter is being prepared" — a
     * promise that could never come true, because on 20 Sept this route stopped
     * returning a document at all and Texas has no prose letter. It has Form
     * 50-132 and the s 41.43(b)(3) grid.
     *
     * So show the form. Not a rendering OF it — the actual Comptroller PDF,
     * filled by lib/tx/fill50132.js, which is the same function that produces
     * the filing. An HTML look-alike is exactly the defect febfec5 removed.
     *
     * UNSIGNED. fill50132(packet) with no second argument leaves Section 8's
     * signature and date blank, which is what a pre-payment preview must be.
     *
     * PAGE ONE ONLY, and that is a product decision, not a technical limit.
     * Page one is the Comptroller's form carrying the owner's own name, account
     * number and the district's own values — the proof that the work is real.
     * The comps grid and the condition exhibit are the evidence a homeowner
     * cannot assemble alone, and they stay behind the paywall.
     *
     * fill50132 calls form.flatten() before returning, so the field values are
     * page content by the time this copies page one. An unflattened copy would
     * lose them to the widget dictionaries left behind.
     *
     * SAME ROUTE, NOT A NEW ONE, DELIBERATELY. next.config.js traces
     * ./forms/tx/** into the bundle for '/api/generate-50132' and nothing else.
     * A new endpoint would read the blank form from a path that is not in its
     * bundle, pass every local test, and throw in production — the exact
     * failure the error text in fill50132.js:93 describes. It also avoids
     * duplicating the parcel resolution above.
     *
     * NOT IN THE JSON. The blank form alone is 684 KB, so base64 on every
     * packet response would put roughly 930 KB on a funnel step that does not
     * always show a preview. The browser asks for this separately, as a blob.
     */
    if (b.preview === true) {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
      const { fill50132 } = await import('../../lib/tx/fill50132');

      const filled = await PDFDocument.load(await fill50132(packet));
      const out = await PDFDocument.create();
      const [page] = await out.copyPages(filled, [0]);
      out.addPage(page);

      const font = await out.embedFont(StandardFonts.HelveticaBold);
      const { width, height } = page.getSize();
      const label = 'PREVIEW - NOT FILED';
      // ASCII only. These are WinAnsi fonts and an em dash or a middot is a
      // throw at draw time, in a route that has no other way to fail.
      const size = 44;
      const w = font.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: (width - w * Math.cos(Math.PI / 4)) / 2,
        y: (height - w * Math.sin(Math.PI / 4)) / 2,
        size,
        font,
        color: rgb(0.78, 0.12, 0.12),
        opacity: 0.22,
        rotate: degrees(45),
      });

      const bytes = await out.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="protest-preview.pdf"');
      // Same rule as /apply itself in next.config.js: this renders the owner's
      // address, account number and appraised value and must never sit in a
      // shared proxy.
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(200).send(Buffer.from(bytes));
    }

    // A refusal is a 200. It is a finding, not an error, and the caller has to
    // show it to the customer rather than retry.
    /**
     * buildProtest no longer refuses on the merits, so there is no refusal
     * branch here any more. What used to be five dead ends now arrive as
     * `packet.cautions` and travel WITH the document: the customer reads them,
     * sees the packet they would be buying, and decides.
     *
     * The one case that still throws is a parcel row that is not a roll row —
     * see the ROLL_KEYS check in buildProtest. That is our bug, not a finding,
     * and it lands in the 500 below.
     */
    /**
     * =======================================================================
     * THE ROUTE NO LONGER RENDERS A DOCUMENT. 20 Sept 2026.
     * =======================================================================
     *
     * It used to call renderProtestHtml(packet) and cache the result in Redis
     * on a 2-hour TTL, handing the caller a `letterKey` and the markup. Three
     * things were wrong with that and they compounded.
     *
     * 1. THE DOCUMENT WAS THE WRONG DOCUMENT. lib/tx/protestHtml.js renders an
     *    HTML page titled as Form 50-132. That is the defect that got a Florida
     *    petition refused at the Hillsborough front desk and again at
     *    Miami-Dade five days later. lib/tx/fill50132.js fills the
     *    Comptroller's own PDF and has since 15 Sept; nothing called it.
     *
     * 2. THE CACHE OUTLIVED NOTHING. A pre-order taken on 1 February is
     *    dispatched in April. A 2-hour TTL means the key is long gone, and
     *    lib/fulfillOrder.js flips the row to needs_review and pages ops. The
     *    document that survived would have been the wrong one anyway, built
     *    from February's roll against April's assessment.
     *
     * 3. NOBODY READ THE MARKUP. `html` reached pages/apply.js and was assigned
     *    to propData.letterContent and propData.protestPreview, both of which
     *    were written and never read anywhere in the file. The review screen
     *    renders from the structured fields below.
     *
     * So: this route returns FACTS, and the document is built when it is
     * printed, from whatever the roll says then. That is the file-first model
     * doing what it was decided to do on 17 Sept — the packet is assembled at
     * filing time, not at purchase time.
     *
     * WHAT STILL HAS TO HAPPEN, and it is a workflow decision rather than a
     * code one: a Texas order currently reaches lib/fulfillOrder.js
     * attemptMail(), which POSTs to /api/send-letter — the Lob route, which is
     * FLORIDA ONLY by decision (Nathan hand-prints and hand-mails TX and GA).
     * With no letter to find, that path now stops at needs_review instead of
     * mailing a look-alike, which is the safe failure and not the finished one.
     * The Texas dispatch path is the next piece.
     */

    const v = packet.verdict || {};
    return res.status(200).json({
      success: true, filable: true, isTX: true,
      requestedValue: packet.requestedValue,
      reductionSought: packet.reductionSought,
      hasGrid: packet.hasGrid,
      // Everything that used to end the sale. Empty array on a clean packet.
      cautions: packet.cautions || [],
      confidence: packet.hasGrid ? packet.grid.confidence : null,
      compCount: packet.hasGrid ? packet.grid.compCount : 0,
      county: LOADED_CADS[cadId] || null,
      taxYear,
      accountNumber,

      /**
       * THE SAVING THIS PACKET ACTUALLY SUPPORTS.
       *
       * qualify() estimates from a GENERIC reduction — REDUCTION_BY_CAD where a
       * county has been measured, otherwise PLAUSIBLE_REDUCTION_PCT at 6.3%.
       * That is the right figure before the comps have run, which is where
       * /api/check uses it. It is the wrong figure here, because by this point
       * the comp ladder HAS run and the ask is a measured number.
       *
       * Denton is the worked example. The generic path assumes 6.3% of
       * $732,970 = $46,177 and reports about $1,016 a year. The packet asks for
       * $599,337 — a $133,633 reduction, 18.2% — which at the same rate is about
       * $2,940. The screen was quoting a third of what the evidence supports,
       * under a label reading "at most".
       *
       * STILL A CEILING, AND STILL LABELLED ONE. DEFAULT_TAX_RATE is 2.2%
       * statewide, not this county's adopted rate; tx_parcel_entities is not
       * populated so exemptions are not subtracted per taxing unit; and it
       * assumes the board grants the full ask. What changed is the REDUCTION the
       * ceiling is built on, from an assumption to the one we are filing for.
       */
      estimatedSaving: packet.reductionSought > 0
        ? Math.round(packet.reductionSought * DEFAULT_TAX_RATE) : null,
      // NOT sending estimateIsUpperBound: it would always be true here and
      // nothing reads it — verify-tx-dispatch asserts every field in this
      // response is consumed, and it was right to object. The screen states the
      // ceiling in words beside the figure instead.

      /**
       * WHAT THE OWNER CONFIRMS — added 15 Sept 2026.
       *
       * The district is chosen by the GEOCODER, not derived from the match:
       * resolveCounty -> coveredCadFromName -> findParcel({cadId}), where cadId
       * is an .eq() filter on the roll. So a geocoder miss searches the wrong
       * district, and in a metro where street names repeat across four CADs that
       * can return a real parcel belonging to somebody else. Mansfield alone
       * straddles Tarrant, Johnson and Ellis, and we hold only Tarrant.
       *
       * A homeowner cannot reliably confirm "Harris" — plenty of people do not
       * know their appraisal district. They can confirm their own square footage
       * and appraised value. So the review screen shows the matched ROLL RECORD
       * and asks whether it is their house, which catches the wrong-parcel case
       * that a county-only confirmation would pass straight over.
       */
      cadId,
      situsAddress: packet.form50132?.propertyAddress || null,
      livingArea: packet.grid?.subject?.livingArea ?? null,
      yearBuilt: packet.grid?.subject?.yearBuilt ?? null,
      marketValue: v.marketValue ?? null,
      appraisedValue: v.appraisedValue ?? null,
      requiredReduction: v.requiredReduction ?? null,
      breakEvenMarketValue: v.breakEvenMarketValue ?? null,
      isCapped: v.isCapped ?? null,
      issuesUntried: issues.length === 0,
    });
  } catch (err) {
    console.error('50-132 error:', err);
    return res.status(500).json({ error: err.message || '50-132 generation failed' });
  }
}
