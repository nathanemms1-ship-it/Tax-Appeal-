/**
 * Georgia HB 581 floating homestead exemption — which levies are capped.
 *
 * HB 581 (2024) caps the yearly growth of a HOMESTEAD's taxable value at
 * inflation, for every levy except bond debt, in every jurisdiction that did
 * not opt out. Where the cap applies, lowering the market value usually does
 * not lower the bill (the capped base is already below it). Where a
 * jurisdiction opted out, the levy follows market value and an appeal reaches
 * the bill. Non-homestead property is never under HB 581.
 *
 * SOURCE: claude/GA_HB581_Opt_Out_Map_2026-08-26.md (GA Secretary of State
 * opt-out filing list, https://sos.ga.gov/house-bill-581-list, cross-checked
 * against Tax Foundation 17 Apr 2025) and
 * claude/GA_Mail_Only_Decision_And_County_Cutoff_2026-08-27.md (top-25 split).
 *
 * 'out' = opted out, the levy tracks market value.
 * 'in'  = HB 581 cap applies to homesteads.
 * localCap: a LOCAL freeze or floating exemption that caps the levy anyway,
 *           even though the jurisdiction opted out of HB 581. Treated as capped.
 * unverified: local exemptions in that county were not checked; the levy is
 *           counted, but the result says so.
 *
 * ⚠ THE 1 MARCH 2027 CLIFF (HB 92, 2025): every opt-out must be re-adopted by
 * 1 Mar 2027 or the cap switches on automatically. These statuses are verified
 * for tax year 2026 only. For 2027 they are PROVISIONAL until re-checked after
 * 1 Mar 2027; savings() reports that, and the order is re-checked when the
 * notice arrives (refund if the case is gone, per the 11 Oct rule).
 */

export const HB581_VERIFIED_FOR_TAX_YEAR = 2026;

// County levy, county school district levy. Top 25 counties by owner-occupied homes.
export const HB581_STATUS = Object.freeze({
  FULTON:   { county: 'in',  school: 'out', localCap: { school: 'Fulton County Schools has its own floating homestead exemption' } },
  GWINNETT: { county: 'out', school: 'out', localCap: { county: 'Gwinnett value-offset exemption freezes the county levy' } },
  COBB:     { county: 'out', school: 'out', unverified: true },
  DEKALB:   { county: 'in',  school: 'out' },
  CHEROKEE: { county: 'in',  school: 'out' },
  FORSYTH:  { county: 'in',  school: 'out' },
  CHATHAM:  { county: 'in',  school: 'out' },
  HENRY:    { county: 'in',  school: 'out' },
  CLAYTON:  { county: 'out', school: 'out', unverified: true },
  HALL:     { county: 'out', school: 'in' },
  PAULDING: { county: 'in',  school: 'out' },
  COWETA:   { county: 'in',  school: 'out' },
  COLUMBIA: { county: 'out', school: 'out', unverified: true },
  HOUSTON:  { county: 'in',  school: 'out' },
  MUSCOGEE: { county: 'out', school: 'out', localCap: { county: 'Columbus assessment freeze survives HB 581', school: 'Columbus assessment freeze survives HB 581' } },
  RICHMOND: { county: 'out', school: 'out', unverified: true },
  FAYETTE:  { county: 'in',  school: 'out' },
  DOUGLAS:  { county: 'out', school: 'out', unverified: true },
  CARROLL:  { county: 'in',  school: 'out' },
  BIBB:     { county: 'out', school: 'out', unverified: true },
  NEWTON:   { county: 'in',  school: 'out' },
  BARTOW:   { county: 'in',  school: 'out' },
  WALTON:   { county: 'out', school: 'out', unverified: true },
  LOWNDES:  { county: 'out', school: 'out', unverified: true },
  WHITFIELD:{ county: 'in',  school: 'out' },
});

// Independent city school systems: their own levy replaces the county school levy
// for homes inside them. Keyed by the DOR district name.
export const IND_SCHOOL_STATUS = Object.freeze({
  'IND SCHOOL ATLANTA': 'out',
  'IND SCHOOL MARIETTA': 'out',
  'IND SCHOOL DECATUR 50%': 'out',
  'IND SCHOOL GAINESVILLE 100%': 'out',
  // Buford City Schools: not found on the opt-out list; treated as capped.
  'IND SCHOOL BUFORD': 'in',
});
