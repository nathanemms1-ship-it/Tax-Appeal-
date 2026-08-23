/**
 * THE HANDOFF FROM /check TO /apply.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS RATHER THAN TWO sessionStorage CALLS
 * ============================================================================
 * pages/check.js writes it and pages/apply.js reads it. Before today the writer
 * and the reader were two `sessionStorage.setItem('ta_property', ...)` /
 * `getItem('ta_property')` pairs a thousand lines apart in two files, agreeing on
 * a key name and a record shape by nothing but memory.
 *
 * That has already failed once here, in the most expensive possible way:
 * `stashProperty` was WIRED INTO THE onClick BEFORE IT WAS DEFINED, so the single
 * highest-intent click on the site — "Get started", shown to somebody we have
 * just told their property is worth appealing — threw ReferenceError, wrote
 * nothing, and cancelled next/link's navigation. Nothing failed loudly. The apply
 * form simply opened blank and asked for the address they had typed a screen
 * earlier.
 *
 * One module, imported by both sides, means the build resolves the reference and
 * a rename cannot land on one end only.
 *
 * ============================================================================
 * THIS IS A PREFILL. IT IS NOT A GATE, AND IT MUST NEVER BECOME ONE.
 * ============================================================================
 * Everything written here is attacker-controlled in the ordinary sense: it lives
 * in the visitor's own browser and can be edited freely from a console. So
 * nothing it says may decide whether a sale is allowed to proceed.
 *
 *   - `eligible` / `rescuable` choose WHICH SCREEN we open on. Wrong, they cost a
 *     re-check.
 *   - `county` is re-tested against the filing window, the VAB address table and
 *     the fee table by the effect that consumes it, and again by /api/checkout,
 *     which is the only one of those that can stop a card being charged.
 *
 * Read that list as the rule: a value here may pick a screen, never a permission.
 *
 * ============================================================================
 * WHY THERE IS A TTL
 * ============================================================================
 * A Florida county's last order day is a date, and a tab left open overnight
 * crosses one. sessionStorage survives that. The window is re-tested on arrival
 * so a stale verdict cannot sell anything untimely — but a six-hour-old opinion
 * about a property is not worth skipping a free check for, and re-running it
 * costs one indexed query against a roll we already hold.
 */

/** sessionStorage keys. Named here so a rename cannot land on one end only. */
export const PROPERTY_KEY = 'ta_property';
export const VERDICT_KEY = 'ta_verdict';
export const INTENT_KEY = 'ta_intent';

export const VERDICT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Write the verdict /check just rendered.
 *
 * NEVER THROWS. sessionStorage.setItem raises in private-mode Safari and when the
 * quota is full, and these are called from inside a next/link onClick — where a
 * raised exception cancels the navigation entirely. A lost prefill costs a
 * repeated question; a cancelled navigation costs the customer.
 */
export function stashVerdict(data, county) {
  try {
    if (!data?.found) return;
    /**
     * BOTH KEYS OR NEITHER.
     *
     * stashProperty refuses to write without `situs.street`, because pages/apply.js
     * discards a record that has no street. If the verdict were written anyway, a
     * parcel with a blank situs would send the customer straight to the condition
     * step with NO ADDRESS — pricing defects for a property the funnel cannot name,
     * and then onto a petition whose one unforgiving field is the address.
     *
     * The two writes are separate try/catch blocks, so they CAN diverge: a quota
     * failure on the larger property record leaves the verdict written alone. This
     * precondition covers the roll-data case (an empty situs) and the read-back
     * below covers the storage case. Neither alone is enough.
     */
    if (!data.parcel?.situs?.street) return;
    sessionStorage.setItem(VERDICT_KEY, JSON.stringify({
      county: county || '',
      parcelId: data.parcel?.parcelId || '',
      outcome: data.reason || '',
      eligible: !!data.eligible,
      rescuable: !!data.rescuable,
      checkedAt: Date.now(),
    }));
  } catch {
    // Storage unavailable. /apply runs the check again, which is exactly where
    // this funnel stood before today.
  }

  /**
   * AND CONFIRM THE ADDRESS ACTUALLY LANDED.
   *
   * The header above claimed "storage throwing takes both writes down together".
   * That is not true and was pointed out in review: stashProperty and stashVerdict
   * are two independent try/catch blocks called in sequence, so a quota failure on
   * the larger property record can leave the verdict written alone. /apply would
   * then route to `florida-check` and POST /api/check with an empty street.
   *
   * The situs precondition above covers the roll-data case. This covers the
   * storage case, which is the one the header got wrong. Reading the key back is
   * the only way to know: setItem does not report a partial write.
   */
  try {
    if (!sessionStorage.getItem(PROPERTY_KEY)) sessionStorage.removeItem(VERDICT_KEY);
  } catch {
    // If we cannot even read it back, we cannot have written it. Nothing to undo.
  }
}

/**
 * Read and CLEAR the verdict.
 *
 * Cleared on read, like the property record beside it, and for the same reason:
 * somebody appealing a second house must not inherit the first house's answer.
 * The address is the one field on a sworn petition nobody re-reads, and the
 * verdict is the reason they were allowed to skip re-checking it.
 *
 * Returns null for absent, malformed, expired, or not-a-Florida-finding — every
 * one of which means "run the check", which is the safe default and the old
 * behaviour.
 */
export function readVerdict(now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(VERDICT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(VERDICT_KEY);
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    // A record with no age is a record we cannot age out. Treat it as expired
    // rather than as fresh: the failure of the TTL must be a re-check, not a
    // verdict that lives forever.
    if (!Number.isFinite(v.checkedAt)) return null;
    if (now - v.checkedAt > VERDICT_TTL_MS) return null;
    // A future timestamp means a clock change or a hand-edited record. Same
    // answer: we do not know how old this is, so we do not use it.
    if (v.checkedAt > now) return null;
    if (!v.eligible && !v.rescuable) return null;
    return v;
  } catch {
    // Unreadable or malformed. The customer runs the check again.
    return null;
  }
}
