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
});

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
  // ORDERING UNVERIFIED. These are the counties we believe are largest, from
  // general knowledge — NOT from Census data. Pull ACS B25003 for Texas and
  // re-rank before treating this list as the target set.
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
    Fulton: {
      officialDomains: ["fultonassessor.org","fultoncountyga.gov"],
      addressee: 'Fulton County Board of Assessors',
      attnLine: null,
      // THREE conflicting official addresses. Do NOT resolve by majority vote —
      // the two that agree are a county department page and a form header, while
      // the appeals page itself (the more specific instruction) says Suite 1200.
      //   Suite 1200      — fultonassessor.org/property-appeals/  (the appeals page)
      //   Suite 1400      — Fulton's own PT-311A header
      //   141 Pryor St 1018 — fultoncountyga.gov appeal page
      line1: null,
      line2: null,
      city: 'Atlanta',
      stateAbbr: 'GA',
      zip: '30303',
      isPoBox: false,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_THIRD_PARTY_METER,
      acceptsEmail: false,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://fultonassessor.org/property-appeals/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'BLOCKED ON A PHONE CALL. Three conflicting official addresses; largest GA county. '
           + 'County states "Appeals will not be accepted via email or fax" and "Envelopes must be '
           + 'stamped by a U.S. Mail postage meter and not a third party meter."',
    },

    Gwinnett: {
      officialDomains: ["gwinnettcounty.com"],
      addressee: "Gwinnett County Assessors' Office",
      attnLine: 'ATT: Appeals-', // county publishes this exact string. Required.
      line1: '75 Langley Drive',
      line2: null,
      city: 'Lawrenceville',
      stateAbbr: 'GA',
      zip: '30046',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: false, // written policy adopted 1 Oct 2025 DECLINING electronic service
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.gwinnettcounty.com/government/departments/county-administrator/assessor/property-appeals', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'Attention line is published by the county and should be treated as required.',
    },

    Cobb: {
      officialDomains: ["cobbassessor.org","cobbcounty.gov"],
      addressee: 'Cobb County Board of Tax Assessors',
      attnLine: null,
      line1: 'PO Box 649',
      line2: null,
      city: 'Marietta',
      stateAbbr: 'GA',
      zip: '30061-0649',
      isPoBox: true,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: null,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://cobbassessor.org/faqs/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: '"Metered mail will not be accepted as proof of a timely appeal. Only the USPS '
           + 'cancellation stamp will be considered." Both cobbassessor.org and '
           + 'assessor.cobbcounty.gov block automated access — this one needs a human or a phone call.',
    },

    Chatham: {
      officialDomains: ["chathamcountyga.gov","cccdn.blob.core.windows.net"],
      addressee: 'Chatham County Board of Assessors',
      attnLine: null,
      line1: 'PO Box 9786',
      line2: null,
      city: 'Savannah',
      stateAbbr: 'GA',
      zip: '31412-9786',
      isPoBox: true,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://cccdn.blob.core.windows.net/cdn/Files/BoardofEqualization/ChathamCountyPropertyAssessmentAppealForm.pdf', type: SOURCE_TYPES.APPEAL_FORM_PDF, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'THE CANONICAL TRAP. This PO Box appears ONLY on the appeal form PDF. The BOA website '
           + 'contact block shows 222 West Oglethorpe Ave., Suite 113, Savannah GA 31401 — a '
           + 'different address in a different ZIP. Scraping the website gets the wrong address. '
           + 'Source addresses from the form or the annual notice, never the contact page. '
           + 'NOTE: the source URL is a county CDN, not a .gov domain — the guard will reject it. '
           + 'Re-source from boa.chathamcountyga.gov or confirm by phone.',
    },

    DeKalb: {
      officialDomains: ["dekalbcountyga.gov"],
      addressee: 'DeKalb County Board of Tax Assessors',
      attnLine: null,
      line1: 'Maloof Annex',
      line2: '1300 Commerce Drive',
      city: 'Decatur',
      stateAbbr: 'GA',
      zip: '30030',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://propertyappraisal.dekalbcountyga.gov/', type: SOURCE_TYPES.ASSESSMENT_NOTICE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'The annual notice gives a PHYSICAL location, not a mailing address. Confirm by phone '
           + 'that appeals may be mailed here and that there is no separate appeals PO Box.',
    },

    Clayton: {
      officialDomains: ["claytoncountyga.gov"],
      addressee: 'Clayton County Board of Tax Assessors',
      attnLine: null,
      line1: '121 S. McDonough St.',
      line2: null,
      city: 'Jonesboro',
      stateAbbr: 'GA',
      zip: '30236',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.claytoncountyga.gov/government/tax-assessor/tax-appeals/', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: null,
    },

    Hall: {
      officialDomains: ["hallcounty.org"],
      addressee: 'Hall County Board of Tax Assessors',
      attnLine: null,
      line1: '2875 Browns Bridge Road',
      line2: null,
      city: 'Gainesville',
      stateAbbr: 'GA',
      zip: '30504',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.hallcounty.org/260/Appeals', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'Only top-25 county where the COUNTY opted out of HB 581 but the SCHOOL DISTRICT did not.',
    },

    Richmond: {
      officialDomains: ["augustaga.gov"],
      addressee: 'Richmond County Board of Tax Assessors',
      attnLine: null,
      line1: '535 Telfair St.',
      line2: 'Suite 120',
      city: 'Augusta',
      stateAbbr: 'GA',
      zip: '30901',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: null,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.augustaga.gov/742/Tax-Assessor', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'Consolidated city-county (Augusta-Richmond). qPublic lists this address with NO city, '
           + 'state or ZIP — an unmailable row that CASS validation would have caught instantly.',
    },

    Fayette: {
      officialDomains: ["fayettecountyga.gov"],
      addressee: 'Fayette County Board of Assessors',
      attnLine: null,
      line1: '140 Stonewall Ave. West',
      line2: 'Suite 108',
      city: 'Fayetteville',
      stateAbbr: 'GA',
      zip: '30214',
      isPoBox: false,
      postageRestriction: POSTAGE_RESTRICTIONS.NO_METERED,
      acceptsEmail: null,
      emailAddress: null,
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://fayettecountyga.gov/departments/assessor/appeals.php', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: '"USPS postmarked; no metered mail accepted."',
    },

    Carroll: {
      officialDomains: ["carrollcountyga.gov","qpublic.net"],
      addressee: 'Carroll County Board of Tax Assessors',
      attnLine: null,
      line1: null,
      line2: null,
      city: 'Carrollton',
      stateAbbr: 'GA',
      zip: null,
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'appeals@carrollcountyga.gov',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://qpublic.net/ga/carroll/appeals.html', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'Confirmed email-accepting: "NO emails will be accepted, unless the appeal form is '
           + 'attached." We file by mail regardless (one method everywhere), but email is a '
           + 'documented fallback here. Street address still needed.',
    },

    Bartow: {
      officialDomains: ["bartowcountyga.gov"],
      addressee: 'Bartow County Board of Tax Assessors',
      attnLine: null,
      line1: '135 W. Cherokee Ave.',
      line2: 'Ste 126',
      city: 'Cartersville',
      stateAbbr: 'GA',
      zip: '30120',
      isPoBox: false,
      postageRestriction: null,
      acceptsEmail: true,
      emailAddress: 'assessors@bartowcountyga.gov',
      collectsCertified: 'unknown',
      confidence: 'unverified',
      verifiedOn: null,
      sources: [
        { url: 'https://www.bartowcountyga.gov/departments/tax_assessor/how_to_file_an_appeal.php', type: SOURCE_TYPES.COUNTY_SITE, checkedOn: '2026-08-26' },
      ],
      cassValidated: false,
      cassValidatedOn: null,
      notes: 'Accepts email and fax. Mailing address is a courthouse suite.',
    },
  },

  TX: {
    // Empty by design. Populate during Phase 1 alongside Georgia, same method,
    // same table. Do not seed from the existing lib/countyData.js — it invents
    // districts (Potter and Randall share Potter-Randall AD; there are 253 CADs,
    // not 254) with fabricated URLs that are rendered publicly.
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
