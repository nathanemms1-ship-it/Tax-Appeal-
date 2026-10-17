/**
 * lib/kit/freeKit.js — finding and claiming a proved free kit. 17 Oct 2026.
 *
 * A verified guarantee (lib/kit/guarantee.js) lives on LAST year's order. When
 * the same property is checked for the free year, checkout finds it by parcel
 * (or by the one-time code, which must still match that parcel and year), claims
 * it with a conditional update so two tabs cannot both use it, and fulfils the
 * new kit at $0 without Stripe. If fulfilment fails the claim is released.
 */
import { G, guaranteeMatches, normalizeCode } from './guarantee';

const COLS = 'id, state_code, customer_email, kit_order';
const PATH = 'kit_order->after->guarantee';

/** The verified guarantee row for this new kit order, or null. */
export async function findFreeKit(supabase, kitOrder, code = null) {
  if (!supabase || !kitOrder || kitOrder.presale === true) return null;
  const c = normalizeCode(code);
  let rows = [];
  if (c) {
    const { data } = await supabase.from('orders').select(COLS).eq(`${PATH}->>code`, c).limit(2);
    rows = data || [];
  } else {
    const { data } = await supabase.from('orders').select(COLS)
      .eq('state_code', String(kitOrder.state || '').toUpperCase())
      .eq(`${PATH}->>status`, G.VERIFIED)
      .eq(`${PATH}->>freeKitYear`, String(kitOrder.taxYear))
      .limit(50);
    rows = data || [];
  }
  const hit = rows.find((r) => guaranteeMatches(r.kit_order?.after?.guarantee, r, kitOrder));
  return hit || null;
}

/** Claim it. Returns true only for the one caller that moved it from verified. */
export async function claimFreeKit(supabase, row, freeSessionId, now = new Date()) {
  const k = row.kit_order || {};
  const g = { ...(k.after?.guarantee || {}), status: G.REDEEMED, redeemedAt: now.toISOString(), redeemedSession: freeSessionId };
  const { data, error } = await supabase.from('orders').update({ kit_order: { ...k, after: { ...(k.after || {}), guarantee: g } } })
    .eq('id', row.id).eq(`${PATH}->>status`, G.VERIFIED).select('id');
  return !error && Array.isArray(data) && data.length === 1;
}

/** Put it back if the free order could not be created. */
export async function releaseFreeKit(supabase, row) {
  const k = row.kit_order || {};
  const g = { ...(k.after?.guarantee || {}), status: G.VERIFIED, redeemedAt: null, redeemedSession: null };
  await supabase.from('orders').update({ kit_order: { ...k, after: { ...(k.after || {}), guarantee: g } } })
    .eq('id', row.id).eq(`${PATH}->>status`, G.REDEEMED);
}
