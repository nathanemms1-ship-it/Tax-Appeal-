/**
 * components/PartnerCodeField.js — THE PARTNER COUPON FIELD.
 *
 * Shared by the three kit checkouts (GaKitStep, TxKitCheckout, FlKitStep),
 * rendered directly above the pay button. Moved here on 17 Oct 2026 from the
 * old DisputeLetter screen in pages/apply.js, which was the only place it
 * lived, so when that screen went the coupon would have gone with it.
 *
 * Controlled: the parent keeps what the customer typed (`value`) and sends
 * normalizePerkCode(value) || '' as perkCode to /api/checkout.
 * normalizePerkCode is imported from lib/partnerPerk.js — the SAME function
 * pages/api/checkout.js validates with — so the field cannot accept a shape the
 * server will reject, or reject one it would have taken. Two normalisers would
 * eventually disagree, and the failure would look like a broken coupon rather
 * than like a bug.
 *
 * DELIBERATELY NO LIVE "IS THIS CODE REAL" LOOKUP. An endpoint that answered
 * that would be an enumeration oracle for a credential worth $20, and it would
 * also lie: it could say "valid" and then lose the reservation race at
 * checkout, so the customer would be shown $69 and charged $89. Instead we
 * validate the SHAPE here, which catches every typo, and Stripe's own payment
 * page shows the real line item — "(partner coupon applied) $69.00" — before
 * anyone pays. The customer sees the truth from the system that will charge
 * them, not a promise from us.
 */
import { normalizePerkCode } from '../lib/partnerPerk';
import { C } from '../lib/theme';

export default function PartnerCodeField({ value = '', onChange }) {
  const normalized = normalizePerkCode(value);
  const looksWrong = value.trim().length > 0 && !normalized;
  return (
    <div style={{ marginTop: 14, marginBottom: 4 }}>
      <label style={{ display: 'block', fontSize: 12, color: C.mutedGray, marginBottom: 6 }}>
        Have a partner coupon? (optional)
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder="TAP-XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
        aria-label="Partner coupon code"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 14px',
          fontSize: 14, fontFamily: 'inherit',
          letterSpacing: value ? '0.06em' : 'normal',
          textTransform: value ? 'uppercase' : 'none',
          border: `1px solid ${looksWrong ? C.goldDim : normalized ? C.green : C.border}`,
          background: normalized ? C.greenBg : C.white,
          borderRadius: 8, outline: 'none',
        }}
      />
      {looksWrong && (
        <p style={{ fontSize: 12, color: C.goldDim, margin: '6px 0 0' }}>
          That doesn&rsquo;t look like a coupon code. They look like <strong>TAP-K7M2-QW9F</strong> &mdash; eight letters and numbers. Leave it blank if you don&rsquo;t have one.
        </p>
      )}
      {normalized && (
        <p style={{ fontSize: 12, color: C.green, margin: '6px 0 0' }}>
          $20 off will be applied if this coupon is still available. You&rsquo;ll see the final amount on the payment page before you pay.
        </p>
      )}
    </div>
  );
}
