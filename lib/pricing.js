/**
 * lib/pricing.js — the service price, in one place.
 *
 * Decided 15 Oct 2026 (claude/Kit_Model_Decision_And_Conversion_Plan_2026-10-10.md):
 * $89 for the mailed kit, and $89 for the last-minute PDF-only option. A future
 * price test is a change to this line only.
 *
 * New code reads this constant. Older code still carries the literal 8900; the
 * overhaul (claude/Kit_Overhaul_Plan_2026-10-14.md, Phase C) moves it here.
 */
export const SERVICE_PRICE_CENTS = 8900;
export const SERVICE_PRICE_DOLLARS = SERVICE_PRICE_CENTS / 100;
