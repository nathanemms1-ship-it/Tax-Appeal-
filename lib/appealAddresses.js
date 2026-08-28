/**
 * appealAddresses.js — filing addresses for Texas and Georgia property tax appeals.
 *
 * Mirrors the shape of lib/flVabAddresses.js. Read by the mail run and by every
 * money gate. Nothing here may be trusted unless confidence === 'confirmed'.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS SHAPED THE WAY IT IS
 *
 * Florida's fee table went wrong twice — Charlotte ($15 into a $50 county) and
 * DeSoto — because `confidence: "confirmed"` recorded that somebody checked once,
 * carried no date, and nothing re-derived it. START_HERE, 19 Aug 2026:
 *
 *   "Add a `verifiedOn` date to every fee and address entry and fail the build
 *    when a money-gating fact goes a season stale."
 *
 * So: `confirmed` here is a HIGH bar. It requires TWO independent official
 * sources of DIFFERENT type, plus a `verifiedOn` date that has not gone stale.
 * scripts/verify-address-table.mjs enforces all of it and fails the build.
 *
 * ---------------------------------------------------------------------------
 * EVERY SEEDED ROW BELOW IS `unverified`, DELIBERATELY.
 *
 * Each was found by a single web source during the 26–27 Aug 2026 research pass.
 * One source is a candidate, not a confirmation. Marking them `confirmed` to get
 * moving is precisely the error that cost us Charlotte. They are seeded so the
 * phone calls have something to check against — not so we can mail to them.
 *
 * A wrong address means the customer pays, we mail, nothing is filed, and they
 * lose the year. There is no cure for a missed § 41.44 or § 48-5-311 deadline.
 */

export const ADDRESS_SCHEMA_VERSION = 1;

/**
 * A `confirmed` row must be re-verified at least this often.
 * 330 days forces an annual re-check with margin before the 1 April season.
 */
export const MAX_VERIFIED_AGE_DAYS = 330;

/**
 * Source types. A `confirmed` row needs two sources of DIFFERENT type.
 *
 * Rationale: there is a live ecosystem of lookalike sites — fultoncountypropertyappraiser.org,
 * henrycountypropertyappraiser.org and friends — scraping the same upstream county data.
 * Two of those agreeing is ONE source, not two. Requiring different types, and
 * whitelisting domains, is what stops a scraped mirror from manufacturing a false
 * `confirmed`.
 */
export const SOURCE_TYPES = Object.freeze({
  APPEAL_FORM_PDF: 'appeal_form_pdf',     // the county's own PT-311A / protest form. BEST.
  ASSESSMENT_NOTICE: 'assessment_notice', // the annual notice itself. BEST.
  PHONE: 'phone',                         // requires staffName + date. Counts as independent.
  COUNTY_SITE: 'county_site',             // assessor or county government page.
  STATE_DIRECTORY: 'state_directory',     // GA DOR / TX Comptroller directory.
  // Texas equivalents. Kept distinct from the Georgia names so the two-source
  // rule cannot be satisfied by two documents that are really the same artefact.
  PROTEST_FORM_PDF: 'protest_form_pdf',   // the district's own Form 50-132. BEST.
  APPRAISAL_NOTICE: 'appraisal_notice',   // the Notice of Appraised Value. BEST.
  CAD_SITE: 'cad_site',                   // the appraisal district's own site.
});

/**
 * ---------------------------------------------------------------------------
 * WHICH TYPES BELONG TO WHICH STATE, AND WHICH OF THEM ARE STRONG.
 * ---------------------------------------------------------------------------
 * "BEST" was written in the comments above and nowhere a program could read it.
 * scripts/verify-address-table.mjs carried its own list —
 *
 *     const strong = [APPEAL_FORM_PDF, ASSESSMENT_NOTICE, PHONE];
 *
 * — which named the Georgia artefacts only, so the moment the Texas types were
 * added EVERY Texas row warned, including the thirteen resting on a district's
 * own Form 50-132 or a Notice of Appraised Value. The guard was telling us to go
 * and find the evidence we already had.
 *
 * That is the same failure as lib/checkOutcomes.js on 27 Aug: a vocabulary grew
 * in one file and the thing that judges it lived in another. So the vocabulary
 * and its ranking are declared together, here, and the verifier reads them
 * rather than restating them.
 *
 * THE STATE LISTS ARE ALSO A TYPO CHECK. A Georgia row citing `protest_form_pdf`
 * is not a Georgia appeal form — it is a row copied across from Texas, and the
 * two-source rule would then be satisfied by a document that does not exist for
 * that county. The verifier fails on it.
 *
 * ADD A STATE AND THE BUILD WILL SEND YOU HERE: a state with no entry fails
 * rather than falling back to a permissive default, because the default that
 * would be convenient here — "accept anything" — is exactly the one that lets an
 * unranked source class quietly count as strong.
 */

/** Valid in every state. A named person on the phone is strong anywhere. */
export const UNIVERSAL_SOURCE_TYPES = Object.freeze([
  SOURCE_TYPES.PHONE,
  SOURCE_TYPES.STATE_DIRECTORY,
]);
export const UNIVERSAL_STRONG_SOURCE_TYPES = Object.freeze([SOURCE_TYPES.PHONE]);

export const STATE_SOURCE_TYPES = Object.freeze({
  GA: Object.freeze({
    strong: Object.freeze([SOURCE_TYPES.APPEAL_FORM_PDF, SOURCE_TYPES.ASSESSMENT_NOTICE]),
    weak: Object.freeze([SOURCE_TYPES.COUNTY_SITE]),
  }),
  TX: Object.freeze({
    strong: Object.freeze([SOURCE_TYPES.PROTEST_FORM_PDF, SOURCE_TYPES.APPRAISAL_NOTICE]),
    weak: Object.freeze([SOURCE_TYPES.CAD_SITE]),
  }),
});

/**
 * The source vocabulary for one state: everything it may cite, and the subset
 * that counts as strong evidence. Returns null for a state with no entry, which
 * the verifier turns into a failure rather than a default.
 */
export function sourceTypesFor(state) {
  const s = STATE_SOURCE_TYPES[state];
  if (!s) return null;
  return {
    all: [...s.strong, ...s.weak, ...UNIVERSAL_SOURCE_TYPES],
    strong: [...s.strong, ...UNIVERSAL_STRONG_SOURCE_TYPES],
  };
}

/**
 * Known lookalike domains. Rejected even if declared in a county's officialDomains.
 * Add to this list every time one is found.
 *
 * DECLARED BEFORE isAcceptableSource() ON PURPOSE — `const` is in the temporal dead
 * zone until its initialiser runs, and scripts/verify-tdz flags a helper that reaches
 * backwards for one. Keep every binding this module's functions touch above them.
 */
export const BLOCKED_DOMAINS = [
  'fultoncountypropertyappraiser.org',
  'gwinnettcountypropertyappraiser.org',
  'cobbcountypropertyappraiser.org',
  'chathamcountypropertyappraiser.org',
  'dekalbcountypropertyappraiser.org',
  'henrycountypropertyappraiser.org',
  'augustarichmondtaxassessor.com',
  'countyoffice.org',
  'propertytax101.org',
  'propertyrecords.georgiaofficialrecords.com',
  'cutmytaxes.com',
  // found 27 Aug during the GA/TX address sweep
  'forsythcountypropertyappraiser.org',
  'gataxassessors.com', 'taxassessors.net', 'tax-rates.org', 'assessorsearch.com',
  'appealdesk.com', 'appealally.com', 'appealproai.com', 'localpropertytaxappeals.com',
  'knowpropertytax.com', 'hometaxappeal.us', 'hometaxreview.com', 'propertytaxedge.com',
  'countytaxassessor.org', 'propertytaxusa.org', 'propertyproof.com',
  'georgia.propertychecker.com', 'propertytaxrecords.georgiaofficialrecords.com',
  'appraisaldistrict.org', 'county-cad.org', 'county-cad.us', 'poconnor.com',
  'taxcutter.us', 'ballardpropertytaxprotest.com', 'protestprad.com',
  // NOT a lookalike, but a genuine WRONG-STATE trap: Douglas County COLORADO,
  // which ranks for "Douglas County Assessor" against Douglas County GA.
  'douglasco.gov',
];

/**
 * Globally trusted host patterns. A source on one of these is accepted for any county.
 *
 * Deliberately SHORT. Real county sites use .com and .org as often as .gov —
 * gwinnettcounty.com and hallcounty.org are both genuine — so a TLD pattern
 * cannot do this job. Widening it to accept .com/.org would admit every lookalike
 * in BLOCKED_DOMAINS. Per-county allowlists (row.officialDomains) do the real work.
 */
export const GLOBAL_TRUSTED_HOST_PATTERNS = [
  /(^|\.)[a-z0-9-]+\.gov$/i,
  /(^|\.)[a-z0-9-]+\.ga\.us$/i,
  /(^|\.)qpublic\.net$/i,
  /(^|\.)qpublic\.schneidercorp\.com$/i,
];

/**
 * Extract a hostname, lowercased. Returns null for anything unparseable.
 */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Is this source acceptable for this row?
 *
 * A URL passes only if its HOST is either globally trusted or explicitly declared
 * in that county's `officialDomains` — and is not on BLOCKED_DOMAINS.
 *
 * Declaring a domain is a deliberate, reviewable act recorded in the diff. That is
 * the point: a human decided gwinnettcounty.com is Gwinnett's real site. A regex
 * cannot make that call, and the lookalike ecosystem exists precisely to fool one.
 */
export function isAcceptableSource(row, src) {
  if (src?.type === SOURCE_TYPES.PHONE) return true; // no URL to check
  const host = hostOf(src?.url ?? '');
  if (!host) return false;
  if (BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return false;
  if (GLOBAL_TRUSTED_HOST_PATTERNS.some((re) => re.test(host))) return true;
  const declared = row?.officialDomains ?? [];
  return declared.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
}

/**
 * Postage restrictions published by the county. These are arguably ultra vires —
 * O.C.G.A. § 48-5-311(n) deems filing made at the USPS postmark date regardless —
 * but the clerk rejecting the envelope is the one the customer has to survive.
 *
 * All three are satisfied by hand-mailing at a retail counter with a clerk-applied
 * round-date. None is satisfied by a third-party permit imprint (i.e. Lob).
 */
export const POSTAGE_RESTRICTIONS = Object.freeze({
  NO_METERED: 'no_metered',              // Cobb, Fayette: USPS cancellation only.
  NO_THIRD_PARTY_METER: 'no_third_party_meter', // Fulton: USPS meter, not a third-party one.
  REQUIRES_METER: 'requires_meter',       // Forsyth GA, uniquely: DEMANDS a USPS meter stamp.
});

/**
 * Target county lists. The address table is complete when every county here is
 * `confirmed`. Ranks are by owner-occupied housing units.
 */
export const TARGET_COUNTIES = {
  // Census ACS 2020–2024 5-yr, table B25003_002. Verified: the 159 county values
  // sum exactly to the published Georgia state total of 2,676,357.
  // Top 25 == 65.8% of Georgia owner-occupied housing.
  GA: [
    'Fulton', 'Gwinnett', 'Cobb', 'DeKalb', 'Cherokee',
    'Forsyth', 'Chatham', 'Henry', 'Clayton', 'Hall',
    'Paulding', 'Coweta', 'Columbia', 'Houston', 'Muscogee',
    'Richmond', 'Fayette', 'Douglas', 'Carroll', 'Bibb',
    'Newton', 'Bartow', 'Walton', 'Lowndes', 'Whitfield',
  ],
  // MEMBERSHIP researched 27 Aug 2026; RANK ORDER STILL UNVERIFIED.
  // The ACS pull failed — see the note in Two_State_Build_Plan. These 25 are the
  // districts we researched addresses for, listed roughly by population, but the
  // ordering is NOT sourced from Census data and the tail (ranks ~18-25) may be wrong.
  // Potter and Randall SHARE the Potter-Randall Appraisal District (PO Box 7190,
  // Amarillo TX 79114-7190). If either enters the target set, map BOTH to one record.
  TX: [
    'Harris', 'Dallas', 'Tarrant', 'Bexar', 'Travis',
    'Collin', 'Denton', 'Hidalgo', 'Fort Bend', 'El Paso',
    'Montgomery', 'Williamson', 'Cameron', 'Nueces', 'Brazoria',
    'Bell', 'Galveston', 'Lubbock', 'Webb', 'Jefferson',
    'McLennan', 'Smith', 'Brazos', 'Hays', 'Ellis',
  ],
};

/**
 * ---------------------------------------------------------------------------
 * THE TABLE
 *
 * Row shape:
 *   addressee            string   envelope line 1. Legally safe form is
 *                                 "<County> County Board of Tax Assessors"
 *                                 (O.C.G.A. § 48-5-311(e)(2)(A) names the board).
 *   attnLine             ?string  printed above the address where the county demands it.
 *   line1, line2         string   street or PO Box.
 *   city, stateAbbr, zip string   zip is ZIP+4 where known.
 *   isPoBox              bool     the mail run and the portal branch on this.
 *   postageRestriction   ?string  POSTAGE_RESTRICTIONS value.
 *   acceptsEmail         ?bool    null = unknown. false = confirmed refusal.
 *   emailAddress         ?string
 *   collectsCertified    string   'yes' | 'no' | 'unknown' — ask on the call.
 *   confidence           string   'confirmed' | 'unverified'
 *   verifiedOn           ?string  ISO date. Required when confirmed.
 *   sources              array    { url|phone, type, checkedOn, staffName? }
 *   cassValidated        bool
 *   cassValidatedOn      ?string
 *   notes                ?string
 */
export const APPEAL_ADDRESSES = {
  GA: {
    "Fulton": {
      officialDomains: ["fultonassessor.org","fultoncountyga.gov"],
      addressee: 'Fulton County Board of Assessors',
      attnLine: null,
      line1: null,
      line2: null,
      city: 'Atlanta',
      stateAbbr: 'GA',
      zip: '30303',
      isPoBox: false,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_THIRD_PARTY_METER,
      acceptsEmail: false,
      emailAddress: null,
      phone: '404-612-6440',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://fultonassessor.org/property-appeals/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://fultonassessor.org/wp-content/uploads/sites/16/2023/06/Understanding-Your-Notice-Website.pdf', type: SOURCE_TYPES.ASSESSMENT_NOTICE, checkedOn: '2026-08-27' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes:
        'BLOCKED ON A PHONE CALL — five official sources, four answers. Suite 1400 has the weight of '
          + 'evidence (the PT-311A header, the notice explainer, the county BOA page, and a 2022 '
          + 'Clerk-to-Commission record). Suite 1200 has exactly one source, but it is the appeals page\'s own '
          + 'mail-to instruction. 141 Pryor St Suite 1018 is a walk-in service centre, not the mail '
          + 'destination; a June 2026 press release also gives bare 141 Pryor with no suite. Building is '
          + 'unambiguous; suite is not. County says: \'envelopes must be stamped by a U.S. Mail postage meter '
          + 'and not a third party meter\' and \'Appeals will not be accepted via email or fax.\'',
    },

    "Gwinnett": {
      officialDomains: ["gwinnettcounty.com","gwinnett-assessor.com"],
      addressee: 'Gwinnett County Assessors\' Office',
      attnLine: 'ATT: Appeals-',
      line1: '75 LANGLEY DR',
      line2: null,
      city: 'Lawrenceville',
      stateAbbr: 'GA',
      zip: '30046-6935',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: false,
      emailAddress: null,
      phone: '770-822-7200',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.gwinnettcounty.com/government/departments/county-administrator/assessor/property-appeals', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://www.gwinnettcounty.com/static/departments/financialservices/taxassessor/Instructions_Appeal_2012.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Street address corroborated by county-hosted appeal instructions. The ATT line appears on '
          + 'exactly ONE page anywhere — the appeals page itself — and on none of five other Gwinnett '
          + 'documents checked. Kept because that one page is the operative instruction; harmless if '
          + 'unnecessary. Written policy adopted 1 Oct 2025 DECLINING electronic service.',
    },

    "Cobb": {
      officialDomains: ["cobbassessor.org","cobbcounty.gov"],
      addressee: 'Cobb County Board of Tax Assessors',
      attnLine: null,
      line1: 'PO BOX 649',
      line2: null,
      city: 'Marietta',
      stateAbbr: 'GA',
      zip: '30061-0649',
      isPoBox: true,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: null,
      emailAddress: null,
      phone: '770-528-3100',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.cobbcounty.gov/tax-assessors-office', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Walk-in is 736 Whitlock Avenue Suite 200, Marietta 30064 — do not mail there. cobbassessor.org '
          + 'and assessor.cobbcounty.gov both WAF-403 automated fetches; the corroborating source is a '
          + 'scanned real 2024 Cobb notice. \'Metered mail will not be accepted as proof of a timely appeal. '
          + 'Only the USPS cancellation stamp will be considered.\'',
    },

    "Chatham": {
      officialDomains: ["chathamcountyga.gov","chathamtax.org"],
      addressee: 'Chatham County Board of Assessors',
      attnLine: null,
      line1: 'PO BOX 9786',
      line2: null,
      city: 'Savannah',
      stateAbbr: 'GA',
      zip: '31412-9786',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '912-652-7271',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.chathamtax.org/PT/api/document/61/10409653/file', type: SOURCE_TYPES.ASSESSMENT_NOTICE, checkedOn: '2026-08-27' },
        { url: 'https://boa.chathamcountyga.gov/Valuation/FAQ', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'CONFIRMED by an actual Chatham PT-306 annual notice. 222 W Oglethorpe Ave Suite 113 (ZIP 31401) '
          + 'is the hand-delivery counter, not the mailbox — the BOA website contact block shows only that '
          + 'one, which is what made this look like a conflict. Do NOT mail to the Board of Equalization at '
          + '1117 Eisenhower Dr; that is the hearing panel.',
    },

    "DeKalb": {
      officialDomains: ["dekalbcountyga.gov"],
      addressee: 'DeKalb County Board of Assessors',
      attnLine: null,
      line1: '325 SWANTON WAY',
      line2: null,
      city: 'Decatur',
      stateAbbr: 'GA',
      zip: '30030-3001',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '404-371-0841',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://propertyappraisal.dekalbcountyga.gov/Documents/2026/Annual_Notice/Real/1509572.pdf', type: SOURCE_TYPES.ASSESSMENT_NOTICE, checkedOn: '2026-08-27' },
        { url: 'https://dekalbcountyga.gov/sites/default/files/2026-01/DeKalb%20County%20Appeal%20Form%202024.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'ADDRESS CHANGED. The Maloof Annex / 1300 Commerce Drive address seeded on 26 Aug came from '
          + 'DeKalb\'s 2023 notice and is STALE. Three current sources of three different types — the 2026 '
          + 'annual notice (dated 05/29/2026), the 2026-uploaded appeal form, and the current county page — '
          + 'all say 325 Swanton Way. 1300 Commerce Drive is still DeKalb\'s general government HQ, so mail '
          + 'there may or may not forward. Do not rely on it.',
    },

    "Clayton": {
      officialDomains: ["claytoncountyga.gov"],
      addressee: 'Clayton County Board of Tax Assessors',
      attnLine: null,
      line1: '121 S MCDONOUGH ST',
      line2: null,
      city: 'Jonesboro',
      stateAbbr: 'GA',
      zip: '30236-3651',
      isPoBox: false,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: false,
      emailAddress: null,
      phone: '770-477-3285',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.claytoncountyga.gov/government/tax-assessor/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'NO INDEPENDENT SECOND SOURCE FOUND — everything traces to claytoncountyga.gov. Annex and floor '
          + 'added because 121 S. McDonough is a courthouse complex and the bare street address is '
          + 'under-specified. \'Metered mail will not be accepted as proof of timely filing. Only returns and '
          + 'applications with United States Postal Service postmarks... will be considered as timely filed.\' '
          + 'NEEDS A CALL.',
    },

    "Hall": {
      officialDomains: ["hallcounty.org"],
      addressee: 'Hall County Board of Tax Assessors',
      attnLine: null,
      line1: 'PO BOX 2895',
      line2: null,
      city: 'Gainesville',
      stateAbbr: 'GA',
      zip: '30503-2895',
      isPoBox: true,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: false,
      emailAddress: null,
      phone: '770-531-6720',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.hallcounty.org/258/Assessment-Notices', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://www.hallcounty.org/DocumentCenter/View/274/Tax-Assessor-FAQ-PDF', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'CORRECTED. The 2875 Browns Bridge Road address seeded on 26 Aug is the WALK-IN location, not the '
          + 'mailbox. Hall splits them explicitly: mailed real-property appeals go to PO Box 2895. Personal '
          + 'property uses a different box (PO Box 1780). \'Metered mail will not be accepted as proof of a '
          + 'timely appeal.\' Caveat: the FAQ PDF says electronic appeals are not accepted while the current '
          + 'notices page says 2026 online appeals ARE live on qPublic — trust the website on e-filing, the '
          + 'PDF on the metered ban.',
    },

    "Richmond": {
      officialDomains: ["augustaga.gov"],
      addressee: 'Richmond County Board of Tax Assessors',
      attnLine: null,
      line1: '535 TELFAIR ST STE 120',
      line2: null,
      city: 'Augusta',
      stateAbbr: 'GA',
      zip: '30901-2372',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '706-821-2310',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.augustaga.gov/742/Tax-Assessor', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://www.augustaga.gov/DocumentCenter/View/6141/Business', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'ZIP+4 and city/state completed from a county-printed return form (code 9124PBPL-1, dated '
          + '12/11/25) — qPublic publishes this address with no city, state or ZIP at all. Form says \'ROOM '
          + '120\' where the website says \'Suite 120\'; same place. Consolidated city-county '
          + '(Augusta-Richmond).',
    },

    "Fayette": {
      // peachtree-city.org is an INDEPENDENT municipal government inside Fayette County
      // publishing the county assessor's address. Declared deliberately: an independent
      // government is stronger corroboration than the county citing itself.
      officialDomains: ["fayettecountyga.gov", "peachtree-city.org"],
      addressee: 'Fayette County Board of Assessors',
      attnLine: null,
      line1: '140 STONEWALL AVE W STE 108',
      line2: null,
      city: 'Fayetteville',
      stateAbbr: 'GA',
      zip: '30214-1904',
      isPoBox: false,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: false,
      emailAddress: null,
      phone: '770-305-5402',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://fayettecountyga.gov/departments/assessor/appeals.php', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://peachtree-city.org/1427/Property-Tax-Information', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes:
        'CASS: DPV "S" — the street address is confirmed but USPS does NOT recognise this suite/unit. It will very likely still deliver, but the secondary is unverified. Confirm the suite on the call. '
      + 'Corroborated by an independent municipal government (City of Peachtree City), which adds the '
          + 'building name: Stonewall Administrative Complex. No PO Box exists. \'must be USPS postmarked; no '
          + 'metered mail accepted.\'',
    },

    "Carroll": {
      officialDomains: ["carrollcountyga.gov","qpublic.net"],
      addressee: 'Carroll County Board of Tax Assessors',
      attnLine: null,
      line1: 'PO BOX 338',
      line2: null,
      city: 'Carrollton',
      stateAbbr: 'GA',
      zip: '30112-0053',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'appeals@carrollcountyga.gov',
      phone: '770-830-5812',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.carrollcountyga.gov/273/Tax-Assessor', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://www.qpublic.net/ga/carroll/contact.html', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'MAILING ADDRESS FOUND. Two independent publishers agree. WATCH THE ZIP FLIP: the PO Box is '
          + '30112, the street address (423 College St) is 30117 — do not cross them. Email domain conflict: '
          + 'qPublic gives appeals@carrollcountyga.gov (.gov), the county\'s own page gives '
          + 'assessors@carrollcountyga.com (.com); every named staff email is .gov, so the .com looks like '
          + 'their typo. \'NO emails will be accepted, unless the appeal form is attached.\'',
    },

    "Bartow": {
      // cms2.revize.com is Bartow's CMS host (path carries /revize/bartowga/).
      officialDomains: ["bartowcountyga.gov", "cms2.revize.com"],
      addressee: 'Bartow County Board of Tax Assessors',
      attnLine: null,
      line1: '135 W CHEROKEE AVE STE 126',
      line2: null,
      city: 'Cartersville',
      stateAbbr: 'GA',
      zip: '30120-3182',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'assessors@bartowcountyga.gov',
      phone: '770-387-5090',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.bartowcountyga.gov/departments/tax_assessor/how_to_file_an_appeal.php', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://cms2.revize.com/revize/bartowga/April%2011,%202024%20BOA%20Meeting.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes:
        'CASS: DPV "S" — the street address is confirmed but USPS does NOT recognise this suite/unit. It will very likely still deliver, but the secondary is unverified. Confirm the suite on the call. '
      + 'SUITE DISCIPLINE MATTERS. Three different suites exist in this building: BOA at Suite 126, an '
          + 'address block in the same minutes packet reading STE 243B, and the Board of Equalization at '
          + 'Suite 233-B. File with the BOA at Suite 126. Bartow is the GA outlier that accepts email AND '
          + 'fax.',
    },

    "Cherokee": {
      officialDomains: ["cherokeecountyga.gov"],
      addressee: 'Cherokee County Tax Assessors Office',
      attnLine: null,
      line1: '2782 MARIETTA HWY STE 200',
      line2: null,
      city: 'Canton',
      stateAbbr: 'GA',
      zip: '30114-8289',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '678-493-6120',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.cherokeecountyga.gov/Tax-Assessors-Office/_resources/documents/2026%20Appeal%20Form.docx', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://cherokeecountyga.gov/tax-assessors-office/index.php', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Form states \'Must be received or postmarked (USPS) by July 30, 2026\' and \'Hand Deliver or Mail '
          + 'To:\'. No PO Box. Email policy not published — form implies mail or hand delivery only; worth '
          + 'confirming before telling a customer email is refused. Note cherokeega.com is the Commissioners\' '
          + 'site, not the assessor.',
    },

    "Forsyth": {
      officialDomains: ["forsythco.com"],
      addressee: 'Forsyth County Board of Assessors',
      attnLine: null,
      line1: '426 CANTON RD',
      line2: null,
      city: 'Cumming',
      stateAbbr: 'GA',
      zip: '30040-2002',
      isPoBox: false,
      postageRestriction: POSTAGE_RESTRICTIONS.REQUIRES_METER,
      acceptsEmail: false,
      emailAddress: null,
      phone: '770-781-2106',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.forsythco.com/news/2026/06/forsyth-county-board-of-assessors-relocates-to-426-canton-highway/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://www.forsythco.com/Portals/0/DeptDoc/BoardOfAssessors/Forms/Appeals/2025%20PT-311A_Appeal_of_Assessment_Form.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'ADDRESS CHANGED 29 JUNE 2026 from 110 E. Main Street Suite 260. Any cached or third-party '
          + 'listing showing 110 E. Main is stale. UNIQUE POSTAGE RULE, OPPOSITE OF EVERY OTHER COUNTY: '
          + '\'envelopes must be stamped by a U.S. Mail postage meter.\' Forsyth REQUIRES a meter where Cobb, '
          + 'Fayette, Hall, Henry, Clayton and Muscogee ban one. \'Assessment appeals filed via email and fax '
          + 'are NO LONGER ACCEPTED.\'',
    },

    "Henry": {
      // content.civicplus.com is Henry's own CMS asset CDN (path carries ga-henrycounty).
      officialDomains: ["henrycountyga.gov", "content.civicplus.com"],
      addressee: 'Henry County Tax Assessors Office',
      attnLine: null,
      line1: '140 HENRY PKWY',
      line2: null,
      city: 'McDonough',
      stateAbbr: 'GA',
      zip: '30253-6696',
      isPoBox: false,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: false,
      emailAddress: null,
      phone: '770-288-7999',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://content.civicplus.com/api/assets/ga-henrycounty/c75731b9-5913-4340-9d75-bde7b7bc79ce', type: SOURCE_TYPES.ASSESSMENT_NOTICE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        '\'metered mail will not be accepted as proof of timely filing\'; must be postmarked before the '
          + 'deadline or it is \'discarded as invalid.\' \'Appeals are not accepted by email or fax.\' CONFIRMED: '
          + 'henrycountypropertyappraiser.org is NOT Henry County — the official site is henrycountyga.gov. '
          + 'Source is the county\'s own CivicPlus document CDN.',
    },

    "Paulding": {
      officialDomains: ["paulding.gov"],
      addressee: 'Paulding County Board of Assessors',
      attnLine: null,
      line1: '240 CONSTITUTION BLVD RM 3082',
      line2: null,
      city: 'Dallas',
      stateAbbr: 'GA',
      zip: '30132-4614',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '770-443-7606',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.paulding.gov/252/Board-of-Assessors/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes:
        'CASS: DPV "S" — the street address is confirmed but USPS does NOT recognise this suite/unit. It will very likely still deliver, but the secondary is unverified. Confirm the suite on the call. '
      + 'NEEDS A CALL. The county\'s own 2026 Appeal Form and 2026 Appeal Information PDFs are Identity-H '
          + 'encoded and could not be text-extracted, so postage rules and email policy are unknown. The '
          + 'appeal form is a county-modified DOR PT-311A (ModDate 2025-12-08). Seat is Dallas, Georgia — not '
          + 'Dallas, Texas.',
    },

    "Coweta": {
      officialDomains: ["coweta.ga.us"],
      addressee: 'Coweta County Board of Tax Assessors',
      attnLine: null,
      line1: '37 PERRY ST',
      line2: null,
      city: 'Newnan',
      stateAbbr: 'GA',
      zip: '30263-1938',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '770-254-2680',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.coweta.ga.us/276/Assessors-Office', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'NEEDS A CALL — the appeals page names no mailing address; 37 Perry Street is inferred from the '
          + 'office contact block. DO NOT USE 22 East Broad Street, which is the Tax Commissioner, a '
          + 'different office. County states \'use of the state-promulgated appeal form (PT-311-A) is '
          + 'preferred but not required.\' An LOA is \'Required if someone other than an owner of record is '
          + 'handling the appeal.\'',
    },

    "Columbia": {
      officialDomains: ["columbiacountyga.gov"],
      addressee: 'Columbia County Board of Tax Assessors',
      attnLine: null,
      line1: 'PO BOX 498',
      line2: null,
      city: 'Evans',
      stateAbbr: 'GA',
      zip: '30809-0498',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'assessor@columbiacountyga.gov',
      phone: '706-312-7474',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.columbiacountyga.gov/356/Appeal-Process', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'County explicitly directs appeals to the PO Box: \'By mail: Board of Tax Assessors, P.O. Box 498, '
          + 'Evans, GA 30809.\' Physical office 630 Ronald Reagan Drive Building C is NOT for appeals. Email '
          + 'and fax (706-312-7476) both accepted, though no written 48-5-311(e)(2)(A) consent policy is '
          + 'published.',
    },

    "Houston": {
      officialDomains: ["houstoncountyga.gov","qpublic.net"],
      addressee: 'Houston County Tax Assessors Office',
      attnLine: null,
      line1: '201 PERRY PKWY',
      line2: null,
      city: 'Perry',
      stateAbbr: 'GA',
      zip: '31069-9275',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '478-218-4750',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.houstoncountyga.gov/residents/tax-assessor.cms', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'NEEDS A CALL. No appeal-specific mailing instruction published at all. The county DOES publish a '
          + 'postage rule — \'Postage meter stamps will not be accepted as evidence of timely filing if the '
          + 'date is different than the Postal Service postmark\' — but it is stated for RETURNS, not appeals. '
          + 'Do not assume it extends to appeals without confirming.',
    },

    "Muscogee": {
      officialDomains: ["columbusga.gov","columbusga.org"],
      addressee: 'Muscogee County Board of Tax Assessors',
      attnLine: null,
      line1: 'PO BOX 1340',
      line2: null,
      city: 'Columbus',
      stateAbbr: 'GA',
      zip: '31902-1340',
      isPoBox: true,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: false,
      emailAddress: null,
      phone: '706-225-4398',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.columbusga.gov/TaxAssessors/pdfs/publicaccess/Taxpayer%20Appeal%20Form%20Instructions.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://publicaccess.columbusga.gov/forms/htmlframe.aspx?mode=content/notices.htm', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Consolidated city-county (Columbus). Office at 3111 Citizens Way is the walk-in. \'Mailed appeals '
          + 'must have the official USPS postmark no later than the Last date to file\' and \'Private postage '
          + 'meter type postmarks cannot be considered.\' \'DO NOT EMAIL OR FAX APPEALS.\' PHONE DISCREPANCY: '
          + 'the site banner gives 706-653-4398 while the appeals page gives 706-225-4398 — verify which '
          + 'rings. Note the .gov/.org domain split: staff email is @columbusga.org.',
    },

    "Douglas": {
      officialDomains: ["douglascountyga.gov"],
      addressee: 'Douglas County Appraisal Department',
      attnLine: null,
      line1: '8700 HOSPITAL DR',
      line2: null,
      city: 'Douglasville',
      stateAbbr: 'GA',
      zip: '30134-2264',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: false,
      emailAddress: null,
      phone: '770-920-7228',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.douglascountyga.gov/221/Appraisal', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'MAILING ADDRESS IS NOT THE OFFICE ADDRESS. County states \'Mailing Address-Douglas County '
          + 'Appraisal Department 8700 Hospital Dr.\' The 6200 Fairburn Rd Annex is in-person only — do not '
          + 'mail there. \'Appeals are NOT accepted via fax nor email.\' Seat is Douglasville; the city of '
          + 'Douglas is in Coffee County. WARNING: douglasco.gov is Douglas County COLORADO and ranks for '
          + '\'Douglas County Assessor\'.',
    },

    "Bibb": {
      officialDomains: ["bibbassessors.com","maconbibb.us"],
      addressee: 'Macon-Bibb County Board of Tax Assessors',
      attnLine: null,
      line1: '688 WALNUT ST STE 200',
      line2: null,
      city: 'Macon',
      stateAbbr: 'GA',
      zip: '31201-0333',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: false,
      emailAddress: null,
      phone: '478-200-5550',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.bibbassessors.com/wp-content/uploads/2023/08/SUMMARY-OF-Appeal-Process.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://www.maconbibb.us/taxassessments52523/', type: SOURCE_TYPES.ASSESSMENT_NOTICE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Consolidated city-county (Macon-Bibb). The Board runs its own domain (bibbassessors.com) rather '
          + 'than a page under maconbibb.us. Appeals must be \'hand delivered or mailed with a dated U.S. '
          + 'Postmark if close to appeal deadline.\' \'No emails or faxes are accepted.\'',
    },

    "Newton": {
      officialDomains: ["newtoncountyga.gov","co.newton.ga.us","qpublic.net"],
      addressee: 'Newton County Board of Tax Assessors',
      attnLine: null,
      line1: '1113 USHER ST NW STE 102',
      line2: null,
      city: 'Covington',
      stateAbbr: 'GA',
      zip: '30014-2470',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '770-784-2030',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.qpublic.net/ga/newton/contact.html', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'WEAKEST SOURCING OF ALL 25 — CALL BEFORE USING. Address rests on a single vendor-hosted page. '
          + 'newtoncountyga.gov returned 429 on every attempt across a full research session and '
          + 'co.newton.ga.us was robots-blocked, so nothing on a county domain confirms the suite number. Ask '
          + 'whether a PO Box exists.',
    },

    "Walton": {
      officialDomains: ["waltoncountyga.gov","qpublic.net"],
      addressee: 'Walton County Board of Tax Assessors',
      attnLine: null,
      line1: '303 S HAMMOND DR STE 109',
      line2: null,
      city: 'Monroe',
      stateAbbr: 'GA',
      zip: '30655-2904',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '770-267-1352',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.waltoncountyga.gov/470/Tax-Assessor-Information-for-Residents', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://www.qpublic.net/ga/walton/', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'County publishes the SAME address as both Physical and Mailing — no PO Box. No postage or email '
          + 'policy published at all, which is unusual enough to be worth one confirming call. Seat is '
          + 'Monroe; this is NOT Monroe County, whose assessor is at monroecoga.org. Walton opted out of HB '
          + '581 at BOTH county and school level — full exposure, the only such county in ranks 21-25.',
    },

    "Lowndes": {
      officialDomains: ["lowndescounty.com","qpublic.net"],
      addressee: 'Lowndes County Board of Tax Assessors',
      attnLine: null,
      line1: 'PO BOX 1126',
      line2: null,
      city: 'Valdosta',
      stateAbbr: 'GA',
      zip: '31603-1126',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '229-671-2540',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.lowndescounty.com/210/Board-of-Assessors', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://qpublic.net/ga/lowndes/contact.html', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Both a PO Box and a street address are published and the county does NOT say which appeals go to '
          + '— needs a call. ZIP CONFLICT: qPublic gives the street address (302 N. Patterson St) as 31603 '
          + 'while the county site gives 31601 for the same street. Use 31601 for street, 31603 for the box.',
    },

    "Whitfield": {
      officialDomains: ["whitfieldassessor.com","whitfieldcountyga.com"],
      addressee: 'Whitfield County Board of Assessors',
      attnLine: null,
      line1: 'PO BOX 769',
      line2: null,
      city: 'Dalton',
      stateAbbr: 'GA',
      zip: '30722-0769',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '706-275-7410',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://whitfieldassessor.com/appeals/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-27' },
        { url: 'https://whitfieldcountyga.com/news_detail_T15_R21.php', type: SOURCE_TYPES.ASSESSMENT_NOTICE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Both PO Box 769 and office 201 S Hamilton St 3rd Floor (30720) are published; the appeals page '
          + 'never says which to mail to — needs a call. STALE ADDRESS IN CIRCULATION: \'205 N. Selvidge St., '
          + 'Ste. B, Dalton\' appears in 2020-era Whitfield press releases still indexed by search engines. It '
          + 'is obsolete. The Board\'s own site is powered by Schneider Geospatial.',
    },
  },

  TX: {
    "Harris": {
      officialDomains: ["hcad.org"],
      addressee: 'Harris Central Appraisal District',
      attnLine: null,
      line1: 'PO BOX 922004',
      line2: null,
      city: 'Houston',
      stateAbbr: 'TX',
      zip: '77292-2004',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '713-957-7800',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://hcad.org/assets/uploads/pdf/forms/2023/Blk-50-132-Protest.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://hcad.org/assets/uploads/pdf/26-08-Protest-Deadline-Reminder.pdf', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'DO NOT USE THE COMPTROLLER\'S ADDRESS. The state directory lists PO Box 924208, which is HCAD\'s '
          + 'GENERAL mail box, not the protest box. Harris runs at least four boxes — 922004 (protests), '
          + '924208 (general), 920975 (ARB per a 2021 notice), 922006 (evidence). Mailing a protest to 924208 '
          + 'is the single highest-risk error in the Texas set. Renamed from Harris County Appraisal '
          + 'District. Walk-in 13013 Northwest Freeway. iFile online portal. \'By law the appraisal district '
          + 'must go by the postmark date on the envelope.\'',
    },

    "Dallas": {
      officialDomains: ["dallascad.org"],
      addressee: 'Dallas Central Appraisal District',
      attnLine: null,
      line1: '2949 N STEMMONS FWY',
      line2: null,
      city: 'Dallas',
      stateAbbr: 'TX',
      zip: '75247-6102',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: false,
      emailAddress: null,
      phone: '214-631-0910',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://dallascad.org/Forms/Protest_Process.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/dallas.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Street only, no PO Box for protests. CLOSEST TEXAS ANALOGUE TO A METERED-MAIL BAN: \'It must also '
          + 'bear a post office cancellation mark by midnight\' the deadline date — a private meter imprint is '
          + 'not a post office cancellation mark. Treat as operative. \'The ARB will not accept protest '
          + 'filings by facsimile or e-mail submissions.\' Late protests go to the ARB Chairman. WATCH: DCAD\'s '
          + 'own support article prints ZIP 75437, which is wrong — use 75247.',
    },

    "Tarrant": {
      officialDomains: ["tad.org"],
      addressee: 'Tarrant Appraisal Review Board',
      attnLine: null,
      line1: 'PO BOX 185519',
      line2: null,
      city: 'Fort Worth',
      stateAbbr: 'TX',
      zip: '76181-0519',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: false,
      emailAddress: null,
      phone: '817-284-8884',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.tad.org/content/forms/notice-of-protest.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/tarrant.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'THE CAD ADDRESS IS THE WRONG ADDRESS. Protests go to the ARB\'s own PO Box in a different ZIP, '
          + 'not to the district at 2500 Handley-Ederville Rd (76118) that the Comptroller lists. \'Protest '
          + 'forms are not accepted via fax or email.\' \'use a delivery method that confirms TARB received '
          + 'your filing.\' CURRENCY CAVEAT: the only openable form prints Tax Year 2022 and tad.org WAF-403s '
          + 'automated access — confirm the box is live for 2027 by phone.',
    },

    "Bexar": {
      officialDomains: ["bcad.org"],
      addressee: 'Bexar Central Appraisal Review Board',
      attnLine: null,
      line1: 'PO BOX 830248',
      line2: null,
      city: 'San Antonio',
      stateAbbr: 'TX',
      zip: '78283-0248',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '210-242-2432',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://bcad.org/wp-content/uploads/2026/01/2026-PROTEST-FORM.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://bcad.org/news-bexar-appraisal-district-becomes-bexar-central-appraisal-district-in-2026/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'RENAMED 1 JANUARY 2026 from Bexar Appraisal District to Bexar CENTRAL Appraisal District; the '
          + 'Comptroller directory is stale on the name. Address, box and phone unchanged. 411 N Frio is the '
          + 'walk-in; the PO Box is the mail route. Bexar is the outlier that ACCEPTS FAX (210-242-2454 / '
          + '2453) where Dallas, Tarrant and Collin all refuse it.',
    },

    "Travis": {
      officialDomains: ["traviscad.org","tcadcentral.org"],
      addressee: 'Travis Central Appraisal District',
      attnLine: null,
      line1: 'PO BOX 149012',
      line2: null,
      city: 'Austin',
      stateAbbr: 'TX',
      zip: '78714-9012',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '512-834-9317',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://traviscad.org/protests/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/travis.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Addressee is the CAD, not the ARB. Walk-in 850 East Anderson Lane. eFile at traviscad.org/efile. '
          + 'Fax/email and postage restrictions both not published. Note the district\'s published contact '
          + 'email uses a second domain, tcadcentral.org.',
    },

    "Collin": {
      officialDomains: ["collincad.org","collinarb.org"],
      addressee: 'Collin Appraisal Review Board',
      attnLine: null,
      line1: '250 ELDORADO PKWY',
      line2: null,
      city: 'McKinney',
      stateAbbr: 'TX',
      zip: '75069-8023',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: false,
      emailAddress: null,
      phone: '469-742-9200',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://collincad.org/wp-content/uploads/ARB-Notice-of-Protest_2026_CCAD-132-1.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://collinarb.org/frequently-asked-questions-faqs/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Street only, no PO Box. Addressed to the ARB, which runs its own domain. \'The ARB will not '
          + 'accept protests submitted by fax or email.\' COLLIN\'S OWN 2026 FORM CARRIES THE USPS WARNING THAT '
          + 'MATTERS TO US: \'As of 2026, local post offices no longer date-stamp mail the day it\'s dropped in '
          + 'the bin. Postmarks are applied 1 to 2 days later at regional USPS hubs.\' That is a timing hazard '
          + 'for anything dropped in a blue bin near the deadline. Uses its own form number CCAD-132.',
    },

    "Denton": {
      officialDomains: ["dentoncad.com"],
      addressee: 'Denton Central Appraisal District',
      attnLine: null,
      line1: '3911 MORSE ST',
      line2: null,
      city: 'Denton',
      stateAbbr: 'TX',
      zip: '76208-6331',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '940-349-3800',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/denton.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'SINGLE SOURCE ONLY — NEEDS A CALL. dentoncad.com serves a JavaScript-only Public Portal shell to '
          + 'every fetcher including its own PDF paths, so nothing district-authored could be read. Addressee '
          + '(CAD vs ARB), postage rules, fax/email policy all unverified. Mailing and street are the same '
          + 'address per the Comptroller. eProtest portal exists at eprotest.dentoncad.com.',
    },

    "Hidalgo": {
      officialDomains: ["hidalgoad.org"],
      addressee: 'Hidalgo County Appraisal District',
      attnLine: null,
      line1: 'PO BOX 208',
      line2: null,
      city: 'Edinburg',
      stateAbbr: 'TX',
      zip: '78540-0208',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '956-381-8466',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/hidalgo.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'SINGLE SOURCE ONLY — HIGHEST-PRIORITY TEXAS CALL. Both a PO Box and a street address (4405 S. '
          + 'Professional Dr) exist and WHICH ONE PROTESTS GO TO IS UNRESOLVED — the exact Harris-style trap. '
          + 'Site is a JS-only Public Portal shell. Note this district keeps \'County\' in its name, unlike the '
          + 'Comptroller\'s stripped form. Hidalgo County government publicly disclaims it: \'THE HIDALGO '
          + 'COUNTY APPRAISAL DISTRICT IS NOT AN OFFICE OF THE COUNTY OF HIDALGO.\'',
    },

    "Fort Bend": {
      officialDomains: ["fbcad.org"],
      addressee: 'Fort Bend Central Appraisal District',
      attnLine: null,
      line1: '2801 B F TERRY BLVD',
      line2: null,
      city: 'Rosenberg',
      stateAbbr: 'TX',
      zip: '77471-5600',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '281-344-8623',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://fbcad.org/protest/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/fortbend.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'No PO Box exists; mailing and street are identical. OPERATIONAL HAZARD: \'Filing an appeal for a '
          + 'property by mail via US Mail AND filing an appeal online for the same property via eFile will '
          + 'result in a duplicate filing\' which \'may result in processing delays.\' If a customer also files '
          + 'online, our mailed copy creates a duplicate. FBCAD requires Form 50-162 before an AGENT may '
          + 'submit — not applicable to owner-signed filings.',
    },

    "El Paso": {
      officialDomains: ["epcad.org"],
      addressee: 'El Paso Central Appraisal District',
      attnLine: null,
      line1: '5801 TROWBRIDGE DR',
      line2: null,
      city: 'El Paso',
      stateAbbr: 'TX',
      zip: '79925-3346',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '915-780-2131',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://blob.epcad.org/documents/ProtestAppealsProcedures_2025_EN.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/elpaso.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'No PO Box published. Its own protest procedures PDF prints only the district name and address — '
          + 'no ARB designation, no attention line. Portal caveat: \'If you file your protest electronically '
          + '(online), all communication will be via email\' and \'You cannot change the method of protest once '
          + 'you submit through the portal.\'',
    },

    "Montgomery": {
      officialDomains: ["mcad-tx.org"],
      addressee: 'Montgomery Central Appraisal District',
      attnLine: null,
      line1: 'PO BOX 2233',
      line2: null,
      city: 'Conroe',
      stateAbbr: 'TX',
      zip: '77305-2233',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '936-756-3354',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/montgomery.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'BLOCKING CALL REQUIRED. Both PO Box 2233 and street 109 Gladstell St exist and WHICH ONE '
          + 'PROTESTS GO TO IS NOT ESTABLISHED. mcad-tx.org is a fully JavaScript-rendered Public Portal '
          + 'returning an empty shell on every path, and no MCAD-hosted protest PDF is indexed anywhere. The '
          + 'PO Box is corroborated as MCAD\'s correspondence address only by a 2021 exemption-verification '
          + 'letter — not protest material.',
    },

    "Williamson": {
      officialDomains: ["wcad.org"],
      addressee: 'Williamson Central Appraisal District',
      attnLine: null,
      line1: '625 FM 1460',
      line2: null,
      city: 'Georgetown',
      stateAbbr: 'TX',
      zip: '78626-8050',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '512-930-3787',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.wcad.org/contact-us/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/williamson.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Single address, no PO Box. NEEDS A CALL: no WCAD protest page prints a mail-to addressee at all '
          + '— they push online filing. The address also appeared in the header of WCAD\'s own Protest Process '
          + 'Overview (Rev. 4/2025), but that PDF now 404s at its indexed URL.',
    },

    "Cameron": {
      officialDomains: ["cameroncad.org"],
      addressee: 'Cameron Appraisal District',
      attnLine: null,
      line1: 'PO BOX 1010',
      line2: null,
      city: 'San Benito',
      stateAbbr: 'TX',
      zip: '78586-0010',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '956-399-9322',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.cameroncad.org/Pages/ArbProtest', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/cameron.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'BEST DOCUMENTED OF THE TEXAS SET. The district\'s own protest page directs protests to the PO Box '
          + 'as an explicit block. Street 2021 Amistad Dr is the physical office. Only Texas district of 25 '
          + 'with an explicit postmark rule: \'Protests submitted, by any method, must be postmarked or turned '
          + 'in to our office by the deadline date or sooner.\' Prodigy portal requires Owner ID + PIN from '
          + 'the notice.',
    },

    "Nueces": {
      officialDomains: ["nuecescad.net"],
      addressee: 'Nueces Central Appraisal District',
      attnLine: null,
      line1: '201 N CHAPARRAL ST',
      line2: null,
      city: 'Corpus Christi',
      stateAbbr: 'TX',
      zip: '78401-2503',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '361-881-9978',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://nuecescad.net/e-file-protest-instructions/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/nueces.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes:
        'CASS: DPV "D" — the street address is confirmed but USPS expects a SECONDARY (suite/unit) that we do not have. Mail without it risks misdelivery inside a multi-tenant building. Ask for the suite on the call. '
      + 'NEEDS A CALL — the district publishes NO mail-in protest instructions anywhere, only e-file. '
          + 'Suite discrepancy: an older NCAD e-file guide gives \'Suite 206\' and phone 361-826-2100; the '
          + 'current site and state directory both omit the suite and give 361-881-9978. Note ncadistrict.com '
          + '302-redirects to nuecescad.net despite the Comptroller listing the former.',
    },

    "Brazoria": {
      officialDomains: ["brazoriacad.org"],
      addressee: 'Appraisal Review Board, Brazoria Central Appraisal District',
      attnLine: null,
      line1: '500 N CHENANGO ST',
      line2: null,
      city: 'Angleton',
      stateAbbr: 'TX',
      zip: '77515-4650',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'help@brazoriacad.org',
      phone: '979-849-7792',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://brazoriacad.org/general-questions/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://brazoriacad.org/wp-content/uploads/2025/05/late_protest_2025.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes:
        'CASS: DPV "D" — the street address is confirmed but USPS expects a SECONDARY (suite/unit) that we do not have. Mail without it risks misdelivery inside a multi-tenant building. Ask for the suite on the call. '
      + 'THE ONLY ONE OF 25 THAT EXPLICITLY NAMES THE ARB AS ADDRESSEE. Also the broadest '
          + 'accepted-channel list: \'Online submission, email, regular mail, fax, or drop boxes outside\' the '
          + 'office, plus two 24/7 drop boxes. Three name variants in active use — site header says Brazoria '
          + 'Central Appraisal District, its own mailed form letterhead says BRAZORIA COUNTY APPRAISAL '
          + 'DISTRICT. No PO Box.',
    },

    "Bell": {
      officialDomains: ["bellcad.org"],
      addressee: 'Tax Appraisal District of Bell County',
      attnLine: null,
      line1: 'PO BOX 390',
      line2: null,
      city: 'Belton',
      stateAbbr: 'TX',
      zip: '76513-0390',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'protest@bellcad.org',
      phone: '254-939-5841',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://bellcad.org/wp-content/uploads/2024/05/Hearing-Info-5.20.2024.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/bell.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'NAME TRAP: it calls itself \'Tax Appraisal District of Bell County\' — do NOT write \'Bell Central '
          + 'Appraisal District\'. The Comptroller says \'Bell Appraisal District\'. SEPARATE TRAP: bcad.org is '
          + 'BRAZOS county, not Bell; it surfaces high in Bell searches carrying a 50-132. Bell runs three '
          + 'offices (Belton 411 E Central, Killeen, Temple) and one district-wide PO Box; which address '
          + 'protests go to is not stated in protest terms. NEEDS A CALL.',
    },

    "Galveston": {
      officialDomains: ["galvestoncad.org"],
      addressee: 'Galveston Central Appraisal District',
      attnLine: null,
      line1: '9850 EMMETT F LOWRY EXPY STE A101',
      line2: null,
      city: 'Texas City',
      stateAbbr: 'TX',
      zip: '77591-2000',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '409-935-1980',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://galvestoncad.org/contact-us/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/galveston.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes:
        'CASS: DPV "S" — the street address is confirmed but USPS does NOT recognise this suite/unit. It will very likely still deliver, but the secondary is unverified. Confirm the suite on the call. '
      + 'SUITE CONFLICT: Comptroller says \'Suite A\', the district\'s own contact and forms pages say \'Ste. '
          + 'A101\', its drop-off instruction says \'Ste A\'. Using the district\'s own A101. ZIP+4 not published '
          + 'by the district. No PO Box.',
    },

    "Lubbock": {
      officialDomains: ["lubbockcad.org"],
      addressee: 'Lubbock Central Appraisal District',
      attnLine: null,
      line1: 'PO BOX 10542',
      line2: null,
      city: 'Lubbock',
      stateAbbr: 'TX',
      zip: '79408-3542',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '806-762-5000',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://lubbockcad.org/Notice/R303112.pdf', type: SOURCE_TYPES.APPRAISAL_NOTICE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/lubbock.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Addressee is the ARB per its own Notice of Appraised Value. ZIP+4 CONFLICT — DELIBERATELY '
          + 'OMITTED: the Comptroller says 79408-0542, the district\'s own notice prints 79408-3542. Two '
          + 'authoritative sources disagree, so the plain ZIP is used; +4 is not required for delivery and '
          + 'either value risks being wrong. Street 2109 Avenue Q is the walk-in and ARB hearing location. '
          + 'Notice reads \'PLEASE FILE YOUR PROTEST ONLINE\'.',
    },

    "Webb": {
      officialDomains: ["webbcad.org"],
      addressee: 'Webb County Appraisal District',
      attnLine: null,
      line1: '3302 CLARK BLVD',
      line2: null,
      city: 'Laredo',
      stateAbbr: 'TX',
      zip: '78043-3346',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '956-718-4091',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.webbcad.org/public/webb_eNotice_Request_Form1.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/webb.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Address well corroborated and ZIP+4 agrees across both sources. Protest-specific instructions '
          + 'unverified — the ARB page serves a JavaScript Public Portal shell. No PO Box published.',
    },

    "Jefferson": {
      officialDomains: ["jcad.org"],
      addressee: 'Jefferson Central Appraisal District',
      attnLine: null,
      line1: 'PO BOX 21337',
      line2: null,
      city: 'Beaumont',
      stateAbbr: 'TX',
      zip: '77720-1337',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '409-840-9944',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://jcad.org/before-protest-deadline/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/jefferson.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Addressee explicitly the appraisal district, not the ARB: \'Your protest must be filed with the '
          + 'Appraisal District by May 15.\' PO Box is the published mailing address; 4610 S 4th St is '
          + 'labelled Physical. USEFUL: \'You do not have to file a protest on the form provided. A protest in '
          + 'any written format will suffice providing it provides the requested information.\' ZIP+4 not '
          + 'published by either source.',
    },

    "McLennan": {
      officialDomains: ["mclennancad.org"],
      addressee: 'McLennan Central Appraisal District',
      attnLine: null,
      line1: '315 S 26TH ST',
      line2: null,
      city: 'Waco',
      stateAbbr: 'TX',
      zip: '76710-7400',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '254-752-9864',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/mclennan.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Address and name double-confirmed by MCAD\'s own letterhead on documents hosted by McLennan '
          + 'Community College, so the ADDRESS IS SOLID. But addressee, attention line, postage and e-filing '
          + 'are all unverified — mclennancad.org serves a JS Public Portal shell and its ARB pages were '
          + 'unreachable. NEEDS A CALL for the addressee only. No PO Box found.',
    },

    "Smith": {
      officialDomains: ["smithcad.org"],
      addressee: 'Smith County Appraisal District',
      attnLine: null,
      line1: '245 SSE LOOP 323',
      line2: null,
      city: 'Tyler',
      stateAbbr: 'TX',
      zip: '75702-6456',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '903-510-8600',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.smithcad.org/protest.html', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/smith.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Addressee is the appraisal district, explicitly. CLOSEST ANY TEXAS DISTRICT COMES TO EXCLUDING '
          + 'PRIVATE METERS: \'it must be postmarked by the U.S. Postal Service on or before April 15\' — '
          + 'stated for renditions, but note the phrasing. Also: \'The Notice of Protest need not be an '
          + 'official form... a letter may be submitted.\' Tyler TX, unrelated to Tyler Technologies the '
          + 'vendor. No PO Box.',
    },

    "Brazos": {
      officialDomains: ["brazoscad.org"],
      addressee: 'Brazos Central Appraisal District',
      attnLine: 'Attn: Appraisal Review Board',
      line1: '4051 PENDLETON DR',
      line2: null,
      city: 'Bryan',
      stateAbbr: 'TX',
      zip: '77802-2465',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'arb@brazoscad.org',
      phone: '979-774-4100',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://brazoscad.org/wp-content/uploads/2024/04/2024-notice-of-protest-BCAD.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://brazoscad.org/arb/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'BEST DOCUMENTED OF ALL 25 AND THE ONLY ONE PUBLISHING AN ATTENTION LINE. Email explicitly '
          + 'accepted at arb@brazoscad.org: \'Please only send protests, affidavits, or information relevant '
          + 'to a protest to this email address.\' Its form says \'Do not file this document with the Texas '
          + 'Comptroller of Public Accounts.\' NOT Brazoria — different district, easily confused, and '
          + 'brazoscad.org vs brazoriacad.org differ by two letters.',
    },

    "Hays": {
      officialDomains: ["hayscad.com"],
      addressee: 'Hays Central Appraisal District',
      attnLine: null,
      line1: '21001 INTERSTATE 35',
      line2: null,
      city: 'Kyle',
      stateAbbr: 'TX',
      zip: '78640-4745',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: null,
      phone: '512-268-2522',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://hayscad.com/wp-content/uploads/2024/03/2-50-132-2024-Property-Owners-Notice-of-Protest-for-Counties-with-Populations-Greater-than-120000.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://hayscad.com/protest/', type: SOURCE_TYPES.CAD_SITE, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'Note the domain is .com, not .org. No PO Box — explicitly confirmed, the protest page lists no '
          + 'alternative. Email accepted but warned against: submitting by email \'could delay the opening and '
          + 'processing of your protest record\' because it is manually entered. Fax REFUSED on the form: \'Do '
          + 'not submit by fax or to the state comptroller\'s office.\' Mailed protests are also manually '
          + 'entered in order received.',
    },

    "Ellis": {
      officialDomains: ["elliscad.com","elliscad.org"],
      addressee: 'Ellis Appraisal District',
      attnLine: null,
      line1: 'PO BOX 878',
      line2: null,
      city: 'Waxahachie',
      stateAbbr: 'TX',
      zip: '75168-0878',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      phone: '972-937-3552',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.elliscad.com/public/EAD.Open.Records.and.Information.Request.Form.pdf', type: SOURCE_TYPES.PROTEST_FORM_PDF, checkedOn: '2026-08-27' },
        { url: 'https://comptroller.texas.gov/taxes/property-tax/county-directory/ellis.php', type: SOURCE_TYPES.STATE_DIRECTORY, checkedOn: '2026-08-27' },
      ],
      cassValidated: true,
      cassValidatedOn: '2026-08-27',
      notes:
        'PO Box, name, phone, fax and domain confirmed by the district\'s own form, so the ADDRESS IS '
          + 'SOLID. Addressee and whether protests go to the box or to 400 Ferris Ave are unverified — '
          + 'elliscad.com serves a JS Public Portal shell. DOMAIN NOTE: the district\'s own form prints '
          + 'elliscad.COM while the Comptroller lists elliscad.ORG; both resolve, .com is what the district '
          + 'prints. NEEDS A CALL for the addressee.',
    },
  },
};

/* ------------------------------------------------------------------------- */
/* ACCESSORS — fail closed                                                    */
/* ------------------------------------------------------------------------- */

function normalizeCounty(name) {
  if (typeof name !== 'string') return null;
  return name
    .replace(/\s+County$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Look up a filing address.
 *
 * @param {string} state 'GA' | 'TX'
 * @param {string} countyName with or without the word "County"
 * @param {{strict?: boolean}} opts strict:true throws unless the row is `confirmed`.
 *        EVERY MONEY GATE MUST PASS strict:true. Mirrors the Florida contract in
 *        pages/api/send-letter.js and pages/api/checkout.js, which must agree.
 * @returns {object|null}
 */
export function getAppealAddress(state, countyName, { strict = false } = {}) {
  const table = APPEAL_ADDRESSES[state];
  if (!table) {
    if (strict) throw new Error(`getAppealAddress: unsupported state "${state}"`);
    return null;
  }

  const wanted = normalizeCounty(countyName);
  if (!wanted) {
    if (strict) throw new Error(`getAppealAddress: invalid county "${countyName}"`);
    return null;
  }

  const key = Object.keys(table).find((k) => normalizeCounty(k) === wanted);
  const row = key ? table[key] : null;

  if (!row) {
    if (strict) {
      throw new Error(
        `getAppealAddress: no address on file for ${countyName}, ${state}. `
        + 'Refusing rather than guessing — a wrong address costs the customer the year.'
      );
    }
    return null;
  }

  if (strict && !isMailable(row)) {
    throw new Error(
      `getAppealAddress: ${countyName}, ${state} is confidence="${row.confidence}" `
      + `(verifiedOn=${row.verifiedOn ?? 'null'}). Refusing to mail.`
    );
  }

  return { ...row, county: key, state };
}

/**
 * The single predicate every money gate should use. A row is mailable only if it
 * is confirmed, freshly verified, CASS-validated and structurally complete.
 */
export function isMailable(row, now = new Date()) {
  if (!row) return false;
  if (row.confidence !== 'confirmed') return false;
  if (!row.verifiedOn) return false;
  if (!row.cassValidated) return false;
  if (!row.line1 || !row.city || !row.stateAbbr || !row.zip) return false;
  return verifiedAgeDays(row, now) <= MAX_VERIFIED_AGE_DAYS;
}

export function verifiedAgeDays(row, now = new Date()) {
  if (!row?.verifiedOn) return Infinity;
  const then = new Date(`${row.verifiedOn}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return Infinity;
  return Math.floor((now - then) / 86400000);
}

/** Envelope lines, in print order. */
export function formatEnvelope(row) {
  if (!row) return null;
  return [
    row.addressee,
    row.attnLine,
    row.line1,
    row.line2,
    `${row.city}, ${row.stateAbbr} ${row.zip}`,
  ].filter(Boolean);
}

/** Coverage against the target list, for the build report. */
export function coverage(state, now = new Date()) {
  const targets = TARGET_COUNTIES[state] ?? [];
  const table = APPEAL_ADDRESSES[state] ?? {};
  const mailable = targets.filter((c) => isMailable(table[c], now));
  const seeded = targets.filter((c) => Boolean(table[c]));
  return {
    state,
    target: targets.length,
    seeded: seeded.length,
    mailable: mailable.length,
    missing: targets.filter((c) => !table[c]),
    blocked: seeded.filter((c) => !isMailable(table[c], now)),
  };
}
