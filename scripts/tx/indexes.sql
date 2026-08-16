-- ============================================================================
-- TEXAS PARCELS — indexes. APPLY THIS *AFTER* LOADING, NEVER BEFORE.
-- ============================================================================
-- This is not stylistic. On the Florida side, loading into a table that already
-- carried six indexes — one a trigram GIN — meant every inserted row updated all
-- of them, and the write-ahead-log churn tripled peak disk usage. On a small
-- Supabase volume that is the difference between finishing and "could not extend
-- file: No space left on device" three counties in, which is exactly what
-- happened on the first full run there.
--
-- Texas is larger: 348,453 rows from five counties, ~14.2M statewide.
--
-- Order is:  schema.sql  ->  \copy every county  ->  indexes.sql
--
-- Every index below is justified by a query the product actually runs. An index
-- nobody queries is pure write cost on a 14M-row table.

-- ── 1. Equal-and-uniform comp selection ─────────────────────────────────────
-- THE query. § 41.43(b)(3) asks for "the median appraised value of a reasonable
-- number of comparable properties appropriately adjusted", and comparability is
-- established by using the DISTRICT'S OWN neighbourhood stratification — which
-- is why neighborhood_code leads here after the partition keys.
--
-- Column order matters and is not alphabetical: equality predicates first
-- (cad_id, tax_year, neighborhood_code, state_class_code), then the range
-- predicate (living_area) last, because a b-tree can only use one range scan and
-- only at the tail.
create index if not exists tx_parcels_comp_lookup
  on tx_parcels (cad_id, tax_year, neighborhood_code, state_class_code, living_area);

-- Widening fallback for thin neighbourhoods. Nueces has 792 neighbourhood codes
-- with a median of 55 parcels, but 259 of them hold fewer than 25 — not enough
-- for a defensible median — so those widen to the subdivision or market area.
create index if not exists tx_parcels_subdv_lookup
  on tx_parcels (cad_id, tax_year, abs_subdv_cd, state_class_code, living_area);

-- ── 2. Finding the customer's own parcel ────────────────────────────────────
-- Address autocomplete and match. Trigram GIN on the BARE column, not on an
-- expression: the first Florida version indexed lower(phy_addr1) while the query
-- searched the raw column, so the planner ignored the index and sequential
-- scanned 5.2M rows on every keystroke.
create extension if not exists pg_trgm;
create index if not exists tx_parcels_situs_trgm
  on tx_parcels using gin (situs_street gin_trgm_ops);

-- Narrow the trigram search by locality first where the district populates it.
-- NOTE: situs_zip is empty for 100% of Wichita, 83.7% of Taylor and 24.1% of
-- Kaufman parcels — those districts simply do not export it. Any lookup path
-- that REQUIRES a zip will silently fail in those counties; match on
-- (cad_id, situs_street) there instead.
create index if not exists tx_parcels_zip_street
  on tx_parcels (cad_id, situs_zip, situs_street);

-- ── 3. The savings gate ─────────────────────────────────────────────────────
-- Partial index: the gate only ever scans capped parcels, and they are a
-- minority (13.2%–31.5% by county). Indexing only those keeps it small.
create index if not exists tx_parcels_capped
  on tx_parcels (cad_id, tax_year)
  where homestead_cap_loss > 0 or nhs_cap_loss > 0;

-- ── 4. Year-over-year, for verifying the district applied the cap correctly ─
-- § 23.23's ceiling is computed FROM THE PRIOR YEAR'S appraised value, so
-- checking a district's arithmetic needs two consecutive years of the same
-- account. A mis-applied cap is itself protestable and nobody checks for it.
create index if not exists tx_parcels_account_history
  on tx_parcels (cad_id, account_number, tax_year desc);

-- ── 5. Provenance ───────────────────────────────────────────────────────────
create index if not exists tx_roll_loads_lookup
  on tx_roll_loads (cad_id, tax_year, loaded_at desc);

-- ── Verify ──────────────────────────────────────────────────────────────────
-- After this runs:
--   select relname, n_live_tup from pg_stat_user_tables where relname like 'tx_%';
--   select indexrelname, pg_size_pretty(pg_relation_size(indexrelid))
--     from pg_stat_user_indexes where relname = 'tx_parcels' order by 2 desc;
analyze tx_parcels;
