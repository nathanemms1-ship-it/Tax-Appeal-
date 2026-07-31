/**
 * GLOBAL SALES KILL SWITCH.
 *
 * Purpose: make it impossible to complete a purchase while the service is not
 * ready to fulfil one. As of 2026-07-30 the Florida path still has unverified
 * county fees and payees, no comparable-sales evidence, no refund path, and no
 * order has ever gone checkout -> sign -> mail end to end. A customer who pays
 * today buys something we cannot reliably deliver.
 *
 * FAILS CLOSED, DELIBERATELY.
 *
 *   SALES_ENABLED === 'true'  ->  sales on
 *   anything else, including unset, missing, typo'd, or an env var that did not
 *   survive a redeploy  ->  sales OFF
 *
 * That direction is chosen on purpose. The cost of being wrongly closed is lost
 * signups on a service that is not launched. The cost of being wrongly open is
 * charging a homeowner $104-$139 for a petition that does not get filed, in a
 * state where the deadline is receipt and a missed year cannot be recovered.
 * Those are not symmetric, so the default is off.
 *
 * This is the SERVER-side gate and it is the one that actually matters. The UI
 * flag (NEXT_PUBLIC_SALES_ENABLED) only changes what buttons say; a stale tab, a
 * cached bundle, a direct POST from curl, or someone replaying a checkout URL all
 * bypass the UI entirely and land here.
 *
 * Turning sales back on: set SALES_ENABLED=true in Vercel AND REDEPLOY. Saving an
 * env var alone changes nothing — that has bitten this project before.
 */

export function salesEnabled() {
  return process.env.SALES_ENABLED === 'true';
}

/**
 * Refuse the request if sales are paused. Returns true when it has responded, so
 * callers use the same shape as enforceRateLimit:
 *
 *   if (blockIfSalesPaused(res)) return;
 *
 * 503 rather than 403: this is "temporarily unavailable", which is true, and it
 * keeps the door open to reopening without the client treating it as permanent.
 */
export function blockIfSalesPaused(res) {
  if (salesEnabled()) return false;
  res.status(503).json({
    error: 'TaxAppeal USA is not accepting orders yet.',
    code: 'SALES_PAUSED',
    action: 'waitlist',
  });
  return true;
}
