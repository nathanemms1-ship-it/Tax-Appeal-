-- ============================================================================
-- INDEXES — apply AFTER loading, never before.
-- ============================================================================
-- Kept separate from schema.sql deliberately. Loading five million rows into a
-- table that already carries these indexes updates every one of them on every
-- insert, and the resulting WAL churn can triple peak disk usage — enough to
-- fill a Supabase nano instance partway through Miami-Dade. Building each index
-- once over a finished table is both cheaper on disk and substantially faster.
--
-- Run: psql "$DATABASE_URL" -f scripts/dor/indexes.sql
--
-- Expect this to take several minutes on a full statewide load. The trigram
-- index is the slow one.

-- Address autocomplete. Trigram, so it matches mid-string ("marbella" finding
-- "8023 MARBELLA CREEK AVE") rather than prefix-only. This is what lets
-- autocomplete run against our own data instead of a metered vendor, and it is
-- why every suggestion is guaranteed to have a parcel behind it.
create extension if not exists pg_trgm;
create index if not exists parcels_addr_trgm
  on parcels using gin ((coalesce(phy_addr1,'') || ' ' || coalesce(phy_city,'')) gin_trgm_ops);

-- Exact address lookup after the customer picks a suggestion.
create index if not exists parcels_zip_addr
  on parcels (phy_zipcd, phy_addr1);

-- The comp query: same county, same appraiser neighborhood, same roll year,
-- filtered on size and age. Column order matches how the query filters.
create index if not exists parcels_comp_lookup
  on parcels (co_no, asmnt_yr, nbrhd_cd, dor_uc, tot_lvg_area);

-- Fallback comp stratum when a parcel has no neighborhood code assigned.
create index if not exists parcels_mktarea_lookup
  on parcels (co_no, asmnt_yr, mkt_ar, dor_uc, tot_lvg_area);

-- Joining sales to parcels, and pulling recent qualified sales in an area.
create index if not exists sales_parcel
  on sales (co_no, parcel_id, sale_date desc);
create index if not exists sales_qualified_recent
  on sales (co_no, nbrhd_cd, sale_date desc) where is_qualified;

-- DELIBERATELY ABSENT: a covering index for the targeting export.
--
-- (co_no, asmnt_yr, dor_uc) INCLUDE (jv, av_sd, av_nsd, tv_sd, tv_nsd) measured
-- 394 MB on 13 counties — the largest index in the schema. The query it serves
-- is a batch export that touches most of the table anyway, so the planner picks
-- a sequential scan regardless. It cost a quarter of the index budget to
-- accelerate nothing.

-- Statistics, so the planner has something accurate to work from immediately
-- rather than after autovacuum gets round to it. Cheap, and worth it after a
-- bulk load of this size.
analyze parcels;
analyze sales;
