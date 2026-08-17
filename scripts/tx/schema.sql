-- ============================================================================
-- TEXAS APPRAISAL ROLL — storage schema
-- ============================================================================
-- Loaded from 254 independent county appraisal district exports. There is no
-- state-published parcel file: the Comptroller RECEIVES one (the Electronic
-- Appraisal Roll Submission, EARS) but does not publish it. So unlike Florida —
-- one DOR vendor, one layout, 67 counties — Texas is many publishers and four
-- layouts. See scripts/tx/sources.json for who publishes what.
--
-- ============================================================================
-- WHY THERE IS NO `sales` TABLE
-- ============================================================================
-- Texas is a NON-DISCLOSURE state. Sale prices are not in public records at all.
-- Every "Texas sale price" any vendor will sell is MODELLED — reverse-engineered
-- from a recorded loan amount, or an AVM output. A modelled sale price inside a
-- document the homeowner signs under oath is precisely the failure that
-- Petition_Integrity_Guardrails.md exists to prevent, so we store none.
--
-- We do not need them. Tex. Tax Code § 41.43(b)(3) — the "equal and uniform"
-- ground — is decided on APPRAISED VALUES:
--
--   "A protest on the ground of unequal appraisal of property shall be
--    determined in favour of the protesting party unless the appraisal district
--    establishes that ... the appraised value of the property is equal to or
--    less than the median appraised value of a reasonable number of comparable
--    properties appropriately adjusted."
--
-- Those are the district's own roll values for the neighbours — the numbers in
-- this table. Texas appellate courts have gone further and held sale prices
-- IRRELEVANT to the claim (In re Catherine Tower, Austin 2018; In re APTWT,
-- Houston 2020). We are not working around missing data; we are running a claim
-- that never needed it.
--
-- If anyone ever adds a sale-price column here, they have misunderstood the
-- product. Ask why before writing the migration.
--
-- ============================================================================
-- WHY market_value AND appraised_value ARE SEPARATE COLUMNS
-- ============================================================================
-- This is the single most important design decision in the file, and it is the
-- Texas form of the mistake commit e4a1ed1 fixed for Florida.
--
-- Texas has four numbers and they are not interchangeable (§ 1.04):
--
--   market value      what the district says it would sell for. Uncapped.
--   appraised value   market value AS LIMITED BY the § 23.23 homestead cap
--                     (10%/yr). Can be far below market.
--   assessed value    appraised x the assessment ratio. Texas's ratio is 100%,
--                     so assessed = appraised. The words are used
--                     interchangeably here; the statute is not.
--   taxable value     assessed minus exemptions. What the rate multiplies.
--
-- A protest reduces MARKET value. Taxes are computed on APPRAISED value. So if
-- the reduced market value is still above the capped appraised value, the tax
-- bill does not move by one dollar. The quantity that decides whether a protest
-- is worth anything at all is:
--
--     required reduction = market_value - appraised_value
--
-- Collapsing these into one column would destroy the ability to compute that,
-- and would mean selling $89 protests to homeowners whose bills cannot move.
-- Our own marketing data already sizes the problem: lib/stats.js:237 carries
-- Collin County at 70% market-value wins against 44% taxable-value wins.
-- Roughly a third of Texas "winners" get no tax change.
--
-- ============================================================================
-- WHY TAX YEAR IS PART OF THE PRIMARY KEY
-- ============================================================================
-- Same reasoning as the Florida roll. A roll year is a separate legal snapshot,
-- not a correction of the prior one: the 2026 appraised value remains the
-- correct figure for a 2026 protest after the 2027 roll publishes. Overwriting
-- in place would silently re-date evidence already cited in filed protests.
--
-- Texas adds a second reason Florida did not have. The § 23.23 cap ceiling is
-- computed FROM THE PRIOR YEAR'S APPRAISED VALUE:
--
--     ceiling = prior_appraised + 10% of prior_appraised + new improvements
--
-- so verifying a district applied the cap correctly REQUIRES holding two
-- consecutive years. An incorrectly applied cap is itself a protestable error
-- and one no competitor checks for. Rows accumulate; queries name a year.

-- ── The parcel ──────────────────────────────────────────────────────────────

create table if not exists tx_parcels (
  -- The Comptroller's 3-digit county code (001 Anderson .. 254 Zavala), which is
  -- also the prefix of an EARS filename (Travis = 227 -> 227EARS090425.zip).
  -- Chosen over a district name because names are unstable and unjoinable:
  -- "El Paso", "Fort Bend", "Deaf Smith", "La Salle", "DeWitt" are the exact
  -- shapes that broke Miami-Dade on the Florida side.
  --
  -- NOTE: a handful of districts serve two counties (Potter-Randall). The code
  -- here is the COUNTY the parcel sits in, not the district that appraised it;
  -- appraising_cad records the latter where they differ.
  cad_id                smallint     not null,
  appraising_cad        smallint,

  -- PACS calls this prop_id; HCAD calls it acct; Tyler Orion calls it
  -- property_id. Stored as text and never as a number — HCAD accounts are
  -- 13 digits with significant leading zeros, and casting loses them.
  account_number        text         not null,
  tax_year              smallint     not null,

  -- ══════════════════════════════════════════════════════════════════════════
  -- VALUES — AND THE NAMING TRAP THAT ALMOST COST US THE WHOLE GATE
  -- ══════════════════════════════════════════════════════════════════════════
  --
  -- PACS AND THE TAX CODE USE THE WORD "APPRAISED" FOR OPPOSITE THINGS.
  --
  -- Tax Code § 1.04:  market value -> appraised value (AFTER the cap) -> assessed
  -- PACS export:      appraised_val (BEFORE the cap) -> assessed_val (AFTER)
  --
  -- So the district's `appraised_val` is our market figure, and its `assessed_val`
  -- is the Tax Code's appraised value — the § 41.43(b)(3) comparison number.
  -- Mapping them by name would have inverted the cap gate silently and sold
  -- protests to exactly the people who cannot benefit. Column names here follow
  -- the TAX CODE, and the parser does the translation once, in one place.
  --
  -- Verified against 19,198 A1 records in the Nueces 2026 certified roll:
  --
  --     assessed_val = appraised_val - ten_percent_cap - nhs_cap_loss
  --
  -- held for 100% of them. 555 rows initially looked broken and every single one
  -- was explained by nhs_cap_loss, not by bad parsing.
  market_value          bigint,      -- PACS appraised_val. Uncapped. What a protest moves
  appraised_value       bigint,      -- PACS assessed_val. CAPPED. The § 41.43(b)(3) number
  taxable_value         bigint,      -- after exemptions. Per-entity; see tx_parcel_entities

  -- ── The two caps, stored separately because they expire separately ──
  --
  -- THESE ARE THE GATE. The screening quantity in the plan is
  -- "market - capped appraised", and the district has already computed it for us:
  -- it is the sum of these two columns. No arithmetic, no inference, no vendor.
  --
  -- Nueces 2026, A1 residential: 21.7% homestead-capped, 2.9% non-homestead
  -- capped, 24.6% capped either way. For a quarter of residential properties a
  -- won protest moves the tax bill by zero dollars.
  homestead_cap_loss    bigint,      -- § 23.23, 10%/yr. PACS ten_percent_cap
  -- § 23.231, 20%/yr on non-homestead real property. PACS nhs_cap_loss.
  -- EXPIRES 31 DEC 2026, so for tax year 2027 these parcels become uncapped and
  -- move from "cannot benefit" to "every dollar reaches the bill". Do not fold
  -- this into homestead_cap_loss: they have different statutes, different rates
  -- and different lifespans, and collapsing them would hide that transition.
  nhs_cap_loss          bigint,

  land_value            bigint,
  improvement_value     bigint,
  -- Needed to verify the § 23.23 ceiling: a genuinely new improvement is added
  -- ON TOP of the 10%, so without this a correct cap looks like a broken one.
  new_improvement_value bigint,

  -- Set by the district when a protest was filed on this account. Free signal
  -- for measuring what protesting actually achieves, and for not soliciting
  -- someone who already has a protest in flight.
  arb_protest_flag      boolean,

  -- ── Characteristics. These drive comp selection and adjustment. ──
  -- Living/heated area, NOT gross or under-roof. HCAD publishes both and they
  -- differ by hundreds of feet on a house with a garage; comping one against
  -- the other manufactures a difference that is not there.
  -- FRACTIONAL. These are numeric, not integer, and that is not defensive
  -- over-typing: districts genuinely record half square feet. Wichita line 51
  -- carries a living area of 3517.5 and Nueces has 1485.8; a 1.5-storey area or
  -- a measured half-foot produces them routinely. Declared as integer, the COPY
  -- fails partway through the first county with "invalid input syntax for type
  -- integer" — found by loading a real county into a throwaway Postgres before
  -- pointing any of this at production.
  living_area           numeric(10,1),
  gross_area            numeric(10,1),
  year_built            smallint,
  effective_year_built  smallint,
  quality_class         text,        -- district's own grade code, e.g. HCAD qa_cd
  condition_code        text,
  land_size_acres       numeric(12,4),
  land_size_sqft        numeric(14,2),

  -- ── The district's own strata. This is what makes a comp set defensible. ──
  --
  -- Selecting comps INSIDE the district's own neighborhood code means the
  -- district cannot argue the comps are not comparable without disowning its own
  -- mass-appraisal methodology. HCAD defines its neighborhoods as "groups of
  -- comparable properties whose boundaries were developed based on location and
  -- similarity of property data characteristics" — their words, our comp filter.
  --
  -- market_area_code is the coarser stratum and the widening fallback when a
  -- neighborhood is too thin. Direct analog of nbrhd_cd / mkt_ar in
  -- lib/dor/comps.js:147.
  neighborhood_code     text,
  neighborhood_group    text,
  market_area_code      text,
  abs_subdv_cd          text,        -- abstract / subdivision

  -- Comptroller State Property Classification Guide: A1 single-family, A2 mobile
  -- home on land, B multifamily, etc. The cross-district normaliser, and the
  -- Texas equivalent of Florida's dor_uc.
  state_class_code      text,

  -- ── Situs ──
  situs_street          text,
  situs_city            text,
  situs_zip             text,
  owner_name            text,

  -- ── Exemptions. The cap and the qualification gate both need these. ──
  -- Whether a residence homestead exemption is in force under § 11.13. Drives
  -- the § 23.23 cap, and § 23.23(c) means a FIRST-YEAR owner is uncapped — the
  -- highest-value segment in Texas and identifiable from this column plus a
  -- year-over-year join.
  has_homestead         boolean,
  homestead_qual_year   smallint,
  has_over65            boolean,
  has_disabled          boolean,
  has_disabled_veteran  boolean,
  exemption_codes       text,        -- raw, as filed, for anything not modelled above

  -- ── Provenance. Every comp we cite must be able to name its file. ──
  -- 'PACS' | 'HCAD' | 'ORION' | 'ISW' | 'PROTAX' | 'ECTOR' | 'EARS'
  source_format         text         not null,
  roll_load_id          bigint,

  loaded_at             timestamptz  not null default now(),

  primary key (cad_id, account_number, tax_year)
);

-- ── Per-taxing-unit detail ──────────────────────────────────────────────────
--
-- A Texas parcel is taxed by several units at once — county, city, ISD, MUD,
-- college, hospital, ESD — each with its OWN exemption amounts and its own
-- taxable value. The $140,000 school homestead exemption applies only to school
-- M&O; the county's optional 20% applies only to the county.
--
-- This matters more in 2026 than it used to. With $140,000 exempt from school
-- M&O — the largest line on most Texas bills — a large share of modest
-- homesteads now have little or no school taxable value at all, and a protest
-- against school taxes on those parcels is worth nothing no matter how strong
-- the evidence. Rolling every unit into one taxable_value hides that, which is
-- the same class of error as collapsing av_sd and av_nsd would have been in
-- Florida.
--
-- OPTIONAL FOR v1: the qualification gate runs on market vs appraised, which
-- lives entirely on tx_parcels. Populate this when we move from "can a protest
-- move the appraised value" to "how many dollars does that save".

create table if not exists tx_parcel_entities (
  cad_id           smallint not null,
  account_number   text     not null,
  tax_year         smallint not null,
  entity_code      text     not null,   -- district's own taxing-unit code
  entity_name      text,
  entity_type      text,                -- 'COUNTY'|'CITY'|'ISD'|'MUD'|'COLLEGE'|'HOSPITAL'|'ESD'|'OTHER'
  taxable_value    bigint,
  exemption_amount bigint,
  exemption_codes  text,

  loaded_at        timestamptz not null default now(),

  primary key (cad_id, account_number, tax_year, entity_code)
);

-- ── Mailing destinations ────────────────────────────────────────────────────
--
-- The Texas port of lib/flVabAddresses.js, and the reason Arkansas and Alabama
-- were held to 2027. Today a Texas protest's destination comes from asking a
-- model in pages/api/lookup.js:487 — Sonnet with web search, falling back at
-- :542 to Haiku with NO search, from training data — cached 180 days and mailed
-- certified. There is no table, no confidence flag, and no gate: every Florida
-- protection lives inside `if (isFL)` and returns at send-letter.js:336.
--
-- `confidence` is the whole point. send-letter.js must refuse to mail anything
-- that is not 'confirmed', OUTSIDE the isFL block, with the mirror 409 in
-- checkout.js — the two must agree, the way checkout.js:112-114 insists for FL.
--
-- 'confirmed' means TWO INDEPENDENT SOURCES AGREE: the Comptroller's county
-- directory page for that county, and either the TAAD directory PDF or the
-- district's own website. One source is 'single_source'. A guess is 'unverified'
-- and refuses.
--
-- ADDRESSING: § 41.44 requires filing with the APPRAISAL REVIEW BOARD, and no
-- district publishes a separate ARB address. The convention is
-- "Appraisal Review Board, c/o [CAD name], [CAD mailing address]" — held in
-- attn_line. Counsel confirms this before we mail at volume; a formatting error
-- here voids a customer's protest.

create table if not exists tx_cad_addresses (
  cad_id          smallint primary key,
  county_name     text     not null,
  cad_name        text     not null,
  attn_line       text,
  street1         text,
  street2         text,
  city            text,
  state           char(2)  not null default 'TX',
  zip             text,
  phone           text,
  website         text,
  -- 'confirmed' | 'single_source' | 'unverified'
  confidence      text     not null default 'unverified',
  source_primary  text,
  source_secondary text,
  verified_at     timestamptz,
  notes           text
);

-- ── Load provenance ─────────────────────────────────────────────────────────
--
-- Every protest must be able to state which roll its numbers came from. A sworn
-- document citing an appraised value should name the file and the date it was
-- retrieved — and it must be the DISTRICT'S OWN export, never a reseller's row.
-- Citing "the X County Appraisal District certified appraisal roll" for a
-- ReportAll or Regrid row is a provenance misstatement an opposing appraiser can
-- take apart, since resellers rename fields, re-derive land-use classes and run
-- a median ~113-day lag against a roll certified on a statutory date.

create table if not exists tx_roll_loads (
  id             bigserial primary key,
  cad_id         smallint not null,
  county_name    text,
  tax_year       smallint not null,
  source_format  text     not null,
  -- 'certified' | 'preliminary' | 'supplement'
  roll_stage     text,
  supplement_no  text,
  source_url     text,
  source_file    text,
  file_sha256    text,
  row_count      integer,
  skipped        integer,
  filtered       integer,
  retrieved_at   timestamptz,
  loaded_at      timestamptz not null default now()
);

-- ── Indexes are NOT created here ────────────────────────────────────────────
--
-- They live in scripts/tx/indexes.sql and are applied AFTER the data is loaded.
--
-- This is not stylistic. On the Florida side, loading into a table that already
-- carried six indexes — one a trigram GIN — tripled write-ahead-log churn and
-- filled a 2 GB Supabase volume partway through Miami-Dade. Texas is larger:
-- Harris alone is ~1.7M accounts and the statewide parcel count is ~14.2M.
-- Building an index once over a finished table is also far faster than
-- maintaining it across millions of individual inserts.
--
-- Order is: schema.sql -> load every district -> indexes.sql
