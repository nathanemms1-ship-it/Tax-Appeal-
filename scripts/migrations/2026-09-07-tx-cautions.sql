-- =============================================================================
-- orders.tx_cautions — what the customer was warned about before they paid
-- 7 September 2026
-- =============================================================================
--
-- Texas packets are no longer refused on the merits. A weak case -- a cap that
-- absorbs the whole reduction, a saving below the fee, three comparables
-- instead of five, an equity argument resting on neighbors' caps -- is shown
-- to the owner as named cautions on a review screen, and they decide whether to
-- file. Every Texas owner has the right to protest their own appraisal whatever
-- we think of the evidence.
--
-- That design only holds if there is a record of it. Without this column we
-- show someone "the cap means this will not lower your bill this year", take
-- $89 when they click Continue, and keep no evidence that they were ever told.
-- It is the same job orders.owner_ack, fl_will_not_attend and
-- fl_authorize_confidential already do for Florida.
--
-- It is also the only way to learn which cautions deter people and which they
-- file through anyway, which is information the funnel currently throws away.
--
-- Values are the caution codes from CAUTION_CODES in lib/tx/protest.js plus the
-- comps reasons: capped_beyond_reach, saving_below_fee, no_value_on_roll,
-- no_taxable_value, not_over_appraised, cap_artifact_only, nothing_to_ask_for,
-- few_comparables, no_comparables, subject_missing_living_area.
--
-- NULL, not '{}', on a clean packet and on every non-Texas order: "no cautions
-- were shown" and "this predates the column" must stay distinguishable, and an
-- empty array would collapse them.
--
-- Safe to re-run. Adding a nullable column takes no table rewrite in Postgres
-- 11+, so this does not lock the table against reads or writes.
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tx_cautions text[];

COMMENT ON COLUMN orders.tx_cautions IS
  'Named cautions shown on the Texas review screen before the owner chose to file. NULL = none shown or pre-dates 2026-09-07. Written by lib/fulfillOrder.js from Stripe metadata; declared in lib/orderColumns.js.';

-- Partial index: the rows worth looking at are the small minority that carry
-- any caution at all, so the index stays tiny however large orders grows.
CREATE INDEX IF NOT EXISTS orders_tx_cautions_idx
  ON orders USING gin (tx_cautions)
  WHERE tx_cautions IS NOT NULL;

-- Verify:
--   SELECT unnest(tx_cautions) AS caution, count(*)
--     FROM orders WHERE tx_cautions IS NOT NULL
--    GROUP BY 1 ORDER BY 2 DESC;
