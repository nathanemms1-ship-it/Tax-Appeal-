-- check_events.near_misses
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT WRITES IT.
--
-- recordCheckOutcome is deliberately silent: it "throws nothing" so that a
-- recording failure can never change the answer a homeowner gets. The cost of
-- that is a missing column does not raise -- PostgREST rejects the whole insert,
-- recordCheck logs it, and EVERY check event stops being written while the
-- funnel keeps working perfectly. The panel would read "nobody is checking",
-- which is the exact conclusion the table exists to prevent.
--
-- So: column first, deploy second. It is additive and nullable, so running it
-- early is harmless -- the old code simply never populates it.

alter table check_events
  add column if not exists near_misses int;

comment on column check_events.near_misses is
  'Rows the roll returned for this address that the matcher then rejected. Set '
  'only on no_parcel_near_miss. NULL elsewhere -- including no_parcel, where zero '
  'retrieved is what makes it no_parcel, so 0 and NULL would be confusable in a '
  'sum. A large value is a matcher that is close and wrong; 1 is a near-identical '
  'row it would not take.';

-- Sanity: should return the new column with is_nullable = YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'check_events' and column_name = 'near_misses';
