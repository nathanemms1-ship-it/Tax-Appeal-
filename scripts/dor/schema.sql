-- ============================================================================
-- FLORIDA DOR ASSESSMENT ROLL — storage schema
-- ============================================================================
-- Loaded from the Department of Revenue NAL (parcels) and SDF (sales) files.
-- One parser, 67 counties, three rolls a year.
--
-- DESIGN NOTE: ROLL YEAR IS PART OF THE PRIMARY KEY.
-- Rolls are not corrections of each other, they are separate legal snapshots —
-- the 2025 just value remains the correct figure for a 2025 petition after the
-- 2026 roll publishes. Overwriting in place would silently re-date evidence
-- already cited in filed petitions. So rows accumulate and queries name a year.
--
-- The side benefit is a per-parcel value history nobody else is keeping, which
-- is what lets us answer "has this assessment risen faster than the market?"

create table if not exists parcels (
  co_no             smallint     not null,
  parcel_id         text         not null,
  asmnt_yr          smallint     not null,
  dor_uc            smallint,

  -- Values, kept PER LEVY. The Save Our Homes cap applies to both school and
  -- non-school; the 10% non-homestead cap applies to non-school ONLY. Collapsing
  -- these into one "assessed value" destroys the ability to qualify
  -- non-homesteaded owners, who are most of the serviceable market.
  jv                bigint,      -- just (market) value — what a petition disputes
  av_sd             bigint,      -- assessed, school levies
  av_nsd            bigint,      -- assessed, non-school levies
  tv_sd             bigint,      -- taxable, school levies
  tv_nsd            bigint,      -- taxable, non-school levies
  jv_hmstd          bigint,
  av_hmstd          bigint,
  jv_non_hmstd_resd bigint,
  av_non_hmstd_resd bigint,
  lnd_val           bigint,

  tot_lvg_area      integer,
  act_yr_blt        smallint,
  eff_yr_blt        smallint,
  no_buldng         smallint,
  no_res_unts       smallint,
  lnd_sqfoot        bigint,

  -- The appraiser's own strata. Better comp grouping than a radius, and the NAL
  -- carries no coordinates anyway.
  nbrhd_cd          text,
  mkt_ar            text,
  census_bk         text,

  phy_addr1         text,
  phy_addr2         text,
  phy_city          text,
  phy_zipcd         text,
  own_name          text,

  exmpt_01          bigint,      -- base $25k homestead
  exmpt_02          bigint,      -- additional $25k, non-school levies only
  ass_dif_trns      bigint,      -- portability: differential moved from a prior homestead

  sale_prc1         bigint,
  sale_yr1          smallint,
  sale_mo1          smallint,
  qual_cd1          smallint,
  vi_cd1            char(1),

  loaded_at         timestamptz  not null default now(),

  primary key (co_no, parcel_id, asmnt_yr)
);

create table if not exists sales (
  co_no          smallint  not null,
  parcel_id      text      not null,
  asmnt_yr       smallint  not null,
  sale_id_cd     text,
  qual_cd        smallint,
  -- Precomputed from QUAL_CD in (01,02) — the codes the Department itself uses
  -- for ratio studies. Materialised so the code list lives in one place (the
  -- parser) rather than being repeated in every query, where it would drift.
  is_qualified   boolean   not null default false,
  vi_cd          char(1),
  -- The roll reports year and month only. Day is set to the 1st by convention;
  -- do not present this as an exact transaction date.
  sale_date      date      not null,
  sale_prc       bigint    not null,
  dor_uc         smallint,
  nbrhd_cd       text,
  mkt_ar         text,
  census_bk      text,
  -- 'C'/'D' marks a multi-parcel sale: the price covers several parcels, so the
  -- per-parcel figure is meaningless as a comp and MUST be excluded.
  multi_par_sal  char(1),

  loaded_at      timestamptz not null default now(),

  -- KEYED ON SALE_ID_CD, not on (date, price).
  --
  -- The obvious key — parcel + date + price — is wrong, and the Hillsborough 2026
  -- roll proves it: 1,343 groups (1.8% of 73,046 sales) share a parcel, month and
  -- price while being genuinely DIFFERENT recorded instruments. The common shape
  -- is two $100 quit-claim deeds recorded in the same month with different clerk
  -- numbers. Collapsing them would silently discard real transfers.
  --
  -- SALE_ID_CD is the appraiser's own sale identifier, documented as stable
  -- across submissions, and it is 100% populated with zero collisions in this
  -- file. That makes reloading a roll idempotent: the same sale re-loads onto
  -- itself instead of duplicating.
  primary key (co_no, parcel_id, asmnt_yr, sale_id_cd)
);

-- ── Indexes are NOT created here ────────────────────────────────────────────
--
-- They live in scripts/dor/indexes.sql and are applied AFTER the data is loaded.
--
-- This is not stylistic. Loading into a table that already carries six indexes —
-- one of them a trigram GIN — means every inserted row updates all of them, and
-- the write-ahead log churn that produces can triple peak disk usage during a
-- load. On a Supabase nano instance that is the difference between finishing and
-- "could not extend file: No space left on device" three counties in, which is
-- exactly what happened on the first full run.
--
-- Building an index once over a finished table is also far faster than
-- maintaining it across five million individual inserts.
--
-- Order is therefore: schema.sql -> load all counties -> indexes.sql

-- ── Load provenance ─────────────────────────────────────────────────────────
-- Every petition must be able to state which roll its numbers came from. A sworn
-- document citing an assessed value should say which submission produced it, and
-- that is free to record when we control the pipeline.
create table if not exists roll_loads (
  id           bigserial primary key,
  co_no        smallint not null,
  county_name  text,
  asmnt_yr     smallint not null,
  file_kind    text     not null,   -- 'NAL' | 'SDF'
  submission   text,                -- 'Preliminary' | 'Initial Final' | 'Final'
  source_file  text,
  row_count    integer,
  skipped      integer,
  loaded_at    timestamptz not null default now()
);
