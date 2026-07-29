/**
 * SOURCED STATISTICS — single source of truth for every number shown to a customer.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS — READ BEFORE ADDING A NUMBER
 * ============================================================================
 *
 * Until July 2026 this site advertised an "82% approval rate", "$1,840 average
 * savings", "Over 7,200 Homeowners" and "$3.2 Million" in total savings, plus
 * named customer testimonials. TaxAppeal USA has never filed a petition and has
 * never had a customer. Every one of those numbers was invented.
 *
 * That is not a marketing problem, it is a legal one:
 *
 *   - FTC Act § 5 (15 U.S.C. § 45) — deceptive acts or practices.
 *   - FTC Rule on the Use of Consumer Reviews and Testimonials, 16 C.F.R. Part
 *     465 (effective Oct 21, 2024). § 465.2 prohibits fake or false consumer
 *     reviews and testimonials — including a testimonial by someone who does not
 *     exist or who never used the product. Violations carry civil penalties per
 *     violation under 15 U.S.C. § 45(m)(1)(A).
 *   - § 465.6 prohibits misrepresenting that reviews reflect the views of actual
 *     customers.
 *   - Florida Deceptive and Unfair Trade Practices Act, Fla. Stat. § 501.204 —
 *     and § 501.2075 provides civil penalties up to $10,000 per violation
 *     ($15,000 where a senior citizen is victimized, § 501.2077).
 *
 * A "per violation" penalty on a consumer-facing website is counted per
 * dissemination. This was the single largest uninsured liability on the site.
 *
 * ----------------------------------------------------------------------------
 * THE RULE GOING FORWARD
 * ----------------------------------------------------------------------------
 * A number may appear on this site only if it is in this file, and it may only
 * be in this file if it has a `source` and a `url` pointing at a primary
 * document that actually contains it. No exceptions, including for numbers that
 * "everyone in the industry uses" — the 82% figure was exactly that, and it
 * traces to nothing. Vendor blog posts are not sources.
 *
 * Once TaxAppeal has its own filing results, add them here as a separate block
 * with the sample size stated, and disclose that they are our own results. Do
 * not blend them into these third-party figures.
 *
 * ----------------------------------------------------------------------------
 * FRAMING RULES (these are compliance requirements, not style preferences)
 * ----------------------------------------------------------------------------
 * 1. Every figure below is "% receiving ANY reduction." No source anywhere
 *    publishes "% receiving the reduction requested." Never imply the latter.
 * 2. These are third-party outcomes for a jurisdiction, NOT our results and NOT
 *    a prediction for any individual property. Always render them with
 *    attribution visible to the user — use `cite()` below.
 * 3. Never aggregate a county figure into a statewide or national claim.
 *    Florida county outcomes range from 57% (Miami-Dade residential, decided)
 *    to 0% (Marion County, TY2022, 0 of 310). A "Florida approval rate" would
 *    be a fabrication.
 * 4. Never present these next to our price in a way that reads as an expected
 *    return on the $89 fee.
 */

export const STATS = {
  // ---------------------------------------------------------------- NATIONAL
  US_OVERASSESSED: {
    value: '30–60%',
    label: 'of taxable U.S. property is over-assessed',
    source: 'National Taxpayers Union Foundation',
    url: 'https://www.ntu.org/foundation/tax-page/are-you-paying-too-much-in-taxes',
    year: null,
    confidence: 'low',
    // NTUF is an advocacy organization and the page carries no citation or date.
    // Attributable TO NTUF by name; must never be presented as a study finding.
    mustAttribute: true,
  },
  US_APPEAL_RATE: {
    value: 'under 5%',
    label: 'of taxpayers challenge their assessment',
    source: 'National Taxpayers Union Foundation',
    url: 'https://www.ntu.org/foundation/tax-page/are-you-paying-too-much-in-taxes',
    year: null,
    confidence: 'low',
    mustAttribute: true,
  },
  COOK_SUCCESS: {
    value: '67%',
    label: 'of Cook County, IL appeals won a reduction (2002–2015 average)',
    source: 'Avenancio-León & Howard, "The Assessment Gap," Quarterly Journal of Economics 137(3)',
    url: 'https://academic.oup.com/qje/article-abstract/137/3/1383/6522186',
    year: 2022,
    confidence: 'high',
  },

  // ------------------------------------------------------------------- TEXAS
  TX_DALLAS_SUCCESS: {
    value: '69.7%',
    label: 'of homeowner-filed Dallas County protests won a reduction',
    source: 'Nathan, Perez-Truglia & Zentner, American Economic Journal: Economic Policy 17(1)',
    url: 'https://www.aeaweb.org/articles?id=10.1257%2Fpol.20220768',
    year: 2020,
    confidence: 'high',
  },
  TX_DALLAS_SAVINGS: {
    value: '$485',
    label: 'average first-year tax savings on a successful Dallas County protest',
    source: 'Nathan, Perez-Truglia & Zentner, American Economic Journal: Economic Policy 17(1)',
    url: 'https://www.aeaweb.org/articles?id=10.1257%2Fpol.20220768',
    year: 2020,
    confidence: 'high',
  },
  TX_HARRIS_PROTESTS: {
    value: '516,205',
    label: 'accounts protested in Harris County',
    source: 'Harris Central Appraisal District, Annual Comprehensive Financial Report',
    url: 'https://hcad.org/assets/uploads/pdf/ACFR-YE-2024_upload.pdf',
    year: 2024,
    confidence: 'high',
  },
  TX_HARRIS_REDUCTION: {
    value: '6.98%',
    label: 'average value reduction across protested Harris County accounts',
    source: 'Harris Central Appraisal District, Annual Comprehensive Financial Report',
    url: 'https://hcad.org/assets/uploads/pdf/ACFR-YE-2024_upload.pdf',
    year: 2024,
    confidence: 'high',
    // NOT a success rate. This is the average size of reduction across protested
    // accounts. Do not relabel it "approval rate" — that was the original sin here.
  },
  TX_TRAVIS_PROTESTS: {
    value: '187,741',
    label: 'protests filed in Travis County',
    source: 'Travis Central Appraisal District, 2024 Annual Report',
    url: 'https://traviscad.org/wp-content/uploads/2024-Annual-Report.pdf',
    year: 2024,
    confidence: 'high',
  },

  // ----------------------------------------------------------------- FLORIDA
  // Source for all four: Miami-Dade County public notice, "Tax Impact of Value
  // Adjustment Board, Tax Year 2024" (Form DR-529, required by Fla. Admin. Code
  // R. 12D-16.002), published June 10, 2025.
  //
  // Residential line: 14,856 assessments reduced / 41,942 requested, with 15,887
  // withdrawn or settled. 14,856 / 41,942 = 35.4% of petitions filed.
  // 14,856 / (41,942 - 15,887) = 57.0% of petitions actually decided by the Board.
  //
  // Both are honest; they answer different questions. We publish the "of filed"
  // number as the headline because it is the more conservative of the two, and
  // footnote the other. The withdrawn/settled bucket certainly contains some
  // reductions agreed with the Property Appraiser, so 35.4% is a floor.
  FL_MIAMIDADE_SUCCESS: {
    value: '35%',
    label: 'of residential Miami-Dade VAB petitions won a reduction',
    detail: '14,856 of 41,942 residential petitions filed. Counting only petitions the Board actually decided (excluding those withdrawn or settled), 57%.',
    source: 'Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024',
    url: 'https://www.miamidade.gov/resources/legal-ads/2025/2025-06-10-public-notice-tax-impact-of-vab.pdf',
    year: 2024,
    confidence: 'high',
  },
  FL_MIAMIDADE_SAVINGS: {
    value: '$589',
    label: 'average tax reduction per residential parcel the Miami-Dade VAB reduced',
    detail: '$8,755,910 in tax shift across 14,856 reduced residential parcels.',
    source: 'Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024',
    url: 'https://www.miamidade.gov/resources/legal-ads/2025/2025-06-10-public-notice-tax-impact-of-vab.pdf',
    year: 2024,
    confidence: 'high',
  },
  FL_MIAMIDADE_VALUE: {
    value: '$1.34 billion',
    label: 'in residential taxable value removed by the Miami-Dade VAB',
    source: 'Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024',
    url: 'https://www.miamidade.gov/resources/legal-ads/2025/2025-06-10-public-notice-tax-impact-of-vab.pdf',
    year: 2024,
    confidence: 'high',
  },
  FL_COUNTY_VARIATION: {
    value: 'varies widely by county',
    label: 'Florida VAB outcomes are not uniform — Marion County reduced 0 of 310 requested assessments in tax year 2022',
    source: 'Marion County Clerk, Form DR-529 Tax Impact Notice, Tax Year 2022',
    url: 'https://www.marioncountyclerk.org/uploads/2023/08/Notice-Tax-Impact-of-Value-Adjustment-Board-Tax-Year-2022.pdf',
    year: 2022,
    confidence: 'high',
  },

  // --------------------------------------------- FLORIDA (statewide, DOR file)
  // Source: Florida Department of Revenue, "DR-529 Report" — the statewide
  // compilation of every county's Form DR-529 Tax Impact Notice, 2000-2025.
  // https://floridarevenue.com/property/Documents/dr529_report.xlsx
  // (Linked from the DOR Property Tax Data Portal. Individual counties publish
  // their DR-529 only as a newspaper legal ad under R. 12D-9.038, which is why
  // this consolidated file is the only practical statewide source.)
  //
  // Tax year 2024, all 67 counties: 144,697 assessment reductions requested,
  // 32,216 granted, 79,260 withdrawn or resolved before decision.
  //   of petitions FILED:   32,216 / 144,697        = 22.3%
  //   of petitions DECIDED: 32,216 / (144,697-79,260) = 49.2%
  //
  // WHICH NUMBER TO PUBLISH: the "decided" figure, labelled as such. The
  // withdrawn/resolved column lumps genuine withdrawals together with
  // SETTLEMENTS agreed with the Property Appraiser, and a settlement is
  // normally a taxpayer win that never appears in the "Reduced" column. So
  // 49.2% understates total taxpayer wins, and 22.3% understates them badly.
  // Never publish either without the "of petitions decided / of petitions
  // filed" qualifier — they answer different questions.
  FL_STATEWIDE_DECIDED: {
    value: '49%',
    label: 'of Florida VAB petitions that reached a decision won a reduction',
    detail: '32,216 of the 65,437 petitions decided statewide in tax year 2024. A further 79,260 were withdrawn or resolved before decision — that bucket includes settlements with the Property Appraiser, which are normally taxpayer wins, so this figure understates the total.',
    source: 'Florida Department of Revenue, DR-529 Report (statewide compilation of county Tax Impact Notices)',
    url: 'https://floridarevenue.com/property/Documents/dr529_report.xlsx',
    year: 2024,
    confidence: 'high',
  },
  FL_STATEWIDE_VALUE: {
    value: '$6.0 billion',
    label: 'in taxable value removed by Florida Value Adjustment Boards',
    detail: '$6,045,180,241 in taxable value and $59,042,861 in taxes shifted, tax year 2024.',
    source: 'Florida Department of Revenue, DR-529 Report',
    url: 'https://floridarevenue.com/property/Documents/dr529_report.xlsx',
    year: 2024,
    confidence: 'high',
  },
  FL_MIAMIDADE_DECIDED: {
    value: '62%',
    label: 'of Miami-Dade VAB petitions that reached a decision won a reduction',
    detail: '28,956 reduced of 46,494 decided (65,533 filed, 19,039 withdrawn or resolved). Miami-Dade has run 53-62% for four straight years.',
    source: 'Florida Department of Revenue, DR-529 Report',
    url: 'https://floridarevenue.com/property/Documents/dr529_report.xlsx',
    year: 2024,
    confidence: 'high',
  },

  // ------------------------------------------------ TEXAS (Collin CAD, open data)
  // Collin Central Appraisal District publishes protest-level microdata (635,230
  // rows, 2022-2026) on the State of Texas open data portal:
  // https://data.texas.gov/dataset/Collin-CAD-Protest-Data/xmrt-bxjr
  // 2025, owner-filed protests on homesteaded property: 9,731 of 13,910 ended
  // with a lower market value than noticed = 69.96%.
  //
  // MANDATORY CAVEAT: that is a MARKET-value win. Texas's 10% homestead cap means
  // a market-value reduction often produces no tax change. On ASSESSED (taxable)
  // value the same cut is 6,094 of 13,910 = 43.8%. Publishing 70% without the
  // taxable-value figure alongside it would be misleading for a service sold on
  // tax savings — and the 43.8% is the more honest headline for what a customer
  // actually receives.
  TX_COLLIN_MARKET: {
    value: '70%',
    label: 'of owner-filed Collin County homestead protests won a lower market value',
    detail: '9,731 of 13,910 in appraisal year 2025. On taxable value — what actually moves a tax bill — the figure is 44%, because the 10% homestead cap can hold the taxable value flat even when market value falls.',
    source: 'Collin Central Appraisal District, Collin CAD Protest Data, Texas Open Data Portal',
    url: 'https://data.texas.gov/dataset/Collin-CAD-Protest-Data/xmrt-bxjr',
    year: 2025,
    confidence: 'high',
  },
  TX_COLLIN_TAXABLE: {
    value: '44%',
    label: 'of owner-filed Collin County homestead protests won a lower taxable value',
    detail: '6,094 of 13,910 in appraisal year 2025.',
    source: 'Collin Central Appraisal District, Collin CAD Protest Data, Texas Open Data Portal',
    url: 'https://data.texas.gov/dataset/Collin-CAD-Protest-Data/xmrt-bxjr',
    year: 2025,
    confidence: 'high',
  },

  // ------------------------------------------------- COOK COUNTY BOARD OF REVIEW
  COOK_BOR_PRO_SE: {
    value: '62%',
    label: 'of residential self-filed appeals to the Cook County Board of Review won a reduction',
    source: 'Cook County Board of Review, Annual Report Tax Year 2023 / Fiscal Year 2024',
    url: 'https://www.cookcountyboardofreview.com/sites/g/files/ywwepo261/files/document/file/2025-10/Board%20of%20Review_AR24.pdf',
    year: 2023,
    confidence: 'high',
  },

  // ----------------------------------------------------------------- GEORGIA
  // Georgia DOR publishes appeal COUNTS only. Its file has no "reduced" or
  // "no change" column, so there is no Georgia outcome rate to cite. Do not
  // invent one and do not borrow Texas's.
  GA_FULTON_APPEALS: {
    value: '36,152',
    label: 'appeals filed in Fulton County',
    source: 'Georgia Department of Revenue, Property Tax Appeal Statistics',
    url: 'https://dor.georgia.gov/property-tax-appeal-statistics',
    year: 2024,
    confidence: 'high',
  },
  GA_APPEAL_RATE: {
    value: '9.9%',
    label: 'of Fulton County parcels were appealed',
    detail: '36,152 appeals across 366,820 parcels.',
    source: 'Georgia Department of Revenue, Property Tax Appeal Statistics',
    url: 'https://dor.georgia.gov/property-tax-appeal-statistics',
    year: 2024,
    confidence: 'high',
  },
};

/**
 * Renders the attribution string that MUST accompany a figure.
 * e.g. "Source: Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024 (2024)"
 */
export function cite(key) {
  const s = STATS[key];
  if (!s) return '';
  return s.year ? `${s.source} (${s.year})` : s.source;
}

/** The disclaimer that must appear wherever third-party outcome figures are shown. */
export const OUTCOME_DISCLAIMER =
  'These are published results for the jurisdiction shown, not TaxAppeal USA results, ' +
  'and not a prediction for any individual property. Outcomes vary widely by county and ' +
  'by property. TaxAppeal USA is a document preparation and mailing service and does not ' +
  'guarantee any reduction.';

export default STATS;
