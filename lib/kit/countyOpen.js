/**
 * lib/kit/countyOpen.js — is a county open for kit orders? 15 Oct 2026.
 *
 * The county half of gaSellability / txSellability, on its own, for the one
 * caller that has a county and no order: the waitlist cron, which owes every
 * `ga_county_not_open` / `tx_county_not_open` row exactly one email, "your
 * county is open". If this said open while checkout still refused, that email
 * would send someone to a purchase we then decline: worse than silence. So it
 * runs the SAME calls the sellability gates run (formForCounty for Georgia's
 * county form, getAppealAddress + isMailable for both states), and
 * scripts/verify-kit-dispatch.mjs holds the three together.
 */
import { getAppealAddress, isMailable } from '../appealAddresses';
import { formForCounty, FormError } from './forms/gaForms';

export function kitCountyOpen(state, county, { now = new Date(), taxYear = now.getUTCFullYear(), addressLookup = getAppealAddress } = {}) {
  const st = String(state || '').toUpperCase();
  if (st !== 'GA' && st !== 'TX') return { open: false, reason: 'not_a_kit_state' };
  if (!county) return { open: false, reason: 'no_county' };
  if (st === 'GA') {
    try { formForCounty(county, { taxYear }); } catch (e) {
      if (e instanceof FormError) return { open: false, reason: e.code };
      throw e;
    }
  }
  const row = addressLookup(st, county);
  if (!row || !isMailable(row, now)) return { open: false, reason: 'address_not_confirmed' };
  return { open: true, reason: null };
}
