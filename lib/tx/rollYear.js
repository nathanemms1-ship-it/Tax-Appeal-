/**
 * ============================================================================
 * THE ROLL YEAR. ONE FILE SAYS IT.
 * ============================================================================
 *
 * This module exists so that lib/tx/comps.js can know the roll year without
 * importing lib/tx/parcels.js.
 *
 * WHY THAT MATTERS: comps.js has NO IMPORTS, and that is load-bearing rather
 * than tidy. scripts/tx/comps-validate.mjs, scripts/tx/sellable.mjs and
 * scripts/tx/condition-codes.mjs all run findComps() against stub fetch
 * functions with no database at all. parcels.js imports
 * pages/api/supabase, so a one-line import for a constant would have dragged a
 * Supabase client into three scripts that deliberately do not have one.
 *
 * WHAT IT REPLACES: until 20 Sept 2026 this number was written twice —
 * `export const ROLL_YEAR = 2026` in parcels.js and `rollYear = 2026` as a
 * default parameter in comps.js. Nothing compared them. Fixing one and missing
 * the other is the lib/tx/countyStats twin outage in a different costume: on
 * 9 Sept a commit shipped countyStats.json without its .js twin and 1.17 million
 * Dallas and Tarrant parcels were live in the database while every owner in both
 * districts was told "we do not cover your county yet".
 *
 * ============================================================================
 * THIS IS THE YEAR WE HOLD, NOT THE YEAR WE ARE PROTESTING
 * ============================================================================
 *
 * They are deliberately different, and the difference is not a bug.
 *
 * Tax Code § 26.01(a): "By July 25, the chief appraiser shall prepare and
 * certify..." The protest deadline for the same year is 15 May. So the certified
 * roll for year N publishes TEN WEEKS AFTER year N's deadline, and no protest
 * can ever be filed against year N's certified roll. Every roll we hold is a
 * certified roll, so ROLL_YEAR trails the filing season by one year by design.
 *
 * scripts/verify-tx-protest.mjs pins this to reality: ROLL_YEAR must equal the
 * tax_year recorded in lib/tx/countyStats.json, which scripts/tx/county-stats.mjs
 * generates from a live query against tx_parcels. Bump this constant without
 * loading that roll and the build fails, which is the point — on 1 April 2027 a
 * stale value would look up the wrong year, pull the wrong comparables, print the
 * wrong year in the form's Tax Year box, and report success.
 *
 * AFTER LOADING A NEW ROLL: re-run node scripts/tx/county-stats.mjs, commit BOTH
 * countyStats twins, and change the number here.
 */
export const ROLL_YEAR = 2026;

export default { ROLL_YEAR };
