/**
 * lib/tx/countyOffer.js — what a Texas county or city page may promise. 2 Nov 2026.
 *
 * Until now every one of the 254 Texas county pages carried the same three "$89"
 * buttons, including the 221 counties whose roll we do not hold. A visitor from
 * Bexar clicked "Start My Protest — $89", typed their address, and only then read
 * "We do not yet hold the appraisal roll for that county". No Texas page said
 * when ordering opens (31 January), because lib/season.js's SEASON table on the
 * county template never included Texas.
 *
 * Nathan, 2 Nov 2026: keep advertising every county, so the pages are already
 * ranking when we add counties. So every page stays, with its title. What it
 * PROMISES depends on what we can do there, from the same facts checkout uses:
 *
 *   reserve          we hold the roll, the district published its values before
 *                    the deadline last year (lib/tx/inSeason.js), and its protest
 *                    address is confirmed. Reservations open 31 January.
 *   data_late        we hold the roll and the address, but last year the district
 *                    published nothing in time (or we could not confirm it did).
 *                    No reservations; we write if it publishes in time.
 *   address_pending  we hold the roll but have not confirmed where the district
 *                    takes protests. Not on sale; we write when it opens.
 *   not_covered      we do not hold the roll. The page still teaches how to
 *                    protest, and offers a notification when we open the county.
 *
 * The day a county is loaded, confirmed or researched, its pages change with it:
 * nothing here names a county.
 */
import { LOADED_CADS } from './coverage.js';
import { canReserve, lastYearText } from './inSeason.js';
import { getAppealAddress, isMailable } from '../appealAddresses.js';
import { seasonDates } from '../season.js';

const clean = (c) => String(c || '').replace(/\s+County$/i, '').trim().toLowerCase();

/** cad_id of a county whose roll we hold, by name, or null. */
export function loadedCadFor(county) {
  const c = clean(county);
  const hit = Object.entries(LOADED_CADS).find(([, name]) => clean(name) === c);
  return hit ? Number(hit[0]) : null;
}

/**
 * @returns {{ kind, county, cadId, district, preOrderText, preOrderISO, reservationsOpen,
 *             lastYear, heading, body, promise, blockedReason, sells }}
 */
export function txCountyOffer(county, { now = new Date(), district = null } = {}) {
  const name = String(county || '').replace(/\s+County$/i, '').trim();
  const cadId = loadedCadFor(name);
  const s = seasonDates('TX', now);
  const reservationsOpen = s.preOrder ? now.getTime() >= s.preOrder.getTime() : false;
  const row = getAppealAddress('TX', name);
  const addressOk = !!row && isMailable(row, now);
  const dist = district || `${name} County appraisal district`;
  const base = { county: name, cadId, district: dist, preOrderText: s.preOrderText, preOrderISO: s.preOrderISO, reservationsOpen, year: s.year };

  if (!cadId) {
    return { ...base, kind: 'not_covered', sells: false, lastYear: null, blockedReason: 'tx_county_not_open',
      heading: `We don't serve ${name} County yet`,
      body: `We build every protest from the appraisal district's own roll, and we don't hold ${name} County's yet, so we can't sell you a kit here. Leave your email and we'll write once we open ${name} County. Below is how to protest on your own, free.`,
      promise: `as soon as we open ${name} County.` };
  }
  if (!addressOk) {
    return { ...base, kind: 'address_pending', sells: false, lastYear: null, blockedReason: 'tx_county_not_open',
      heading: `${name} County opens soon`,
      body: `We hold the ${dist}'s roll, and we're confirming where the district takes protests so the envelope we send you is addressed correctly. Until then we don't take orders here. Leave your email and we'll write when ${name} County opens.`,
      promise: `when ${name} County opens.` };
  }
  if (!canReserve(cadId)) {
    return { ...base, kind: 'data_late', sells: false, lastYear: null, blockedReason: 'tx_awaiting_data',
      heading: `Get told if ${name} County opens in time`,
      body: `We hold the ${dist}'s roll, but last year the district didn't publish its new values before the protest deadline, and a kit built on last year's values isn't a case. So we don't take orders here unless it publishes in time. Leave your email: if it does, we'll write, and you can order then.`,
      promise: `if the ${dist} publishes its ${s.year} values in time.` };
  }
  const ly = lastYearText(cadId);
  // blockedReason tx_county_not_open: notify-waitlist emails it once the county is
  // open AND the season lets them buy (canPreOrder), i.e. on the reservation date.
  return { ...base, kind: 'reserve', sells: true, lastYear: ly, blockedReason: 'tx_county_not_open',
    heading: reservationsOpen ? `Reserve your ${name} County kit` : `Reservations open ${s.preOrderText}`,
    body: `${reservationsOpen ? 'You can reserve your kit now.' : `You can reserve your ${s.year} kit from ${s.preOrderText}.`} We build it from the ${dist}'s ${s.year} data, so it goes out once the district publishes that${ly ? ` (last year ${ly.replace(/ last year$/, '')})` : ''}. If a protest no longer lowers your bill on the new values, we refund you in full.`,
    promise: `on ${s.preOrderText}, when reservations open.` };
}

export default { txCountyOffer, loadedCadFor };
