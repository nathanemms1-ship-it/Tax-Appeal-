-- orders.dispatch_attempts / orders.last_dispatch_error
--
-- RUN THIS BEFORE DEPLOYING. Not optional and not reorderable.
--
-- cron/process-queued-orders.js now writes both columns on every failed dispatch. If
-- the code ships first, that write fails against a column that does not exist — and
-- the thing it was recording was already a failure, so the failure of the failure
-- record goes nowhere. This is the same shape as account_number on 5 Aug 2026, which
-- broke live checkout after the payment was captured.
--
-- lib/orderColumns.js lists both, so scripts/verify-schema.mjs fails the build if the
-- code writes a column that is not declared, and checkSchema() in lib/healthChecks.js
-- goes critical every 10 minutes if a declared column is missing from the database.
-- Running this file is what satisfies the second one.

alter table orders
  add column if not exists dispatch_attempts integer not null default 0;

alter table orders
  add column if not exists last_dispatch_error text;

-- Existing rows have never been through the new path. 0 is the correct history for
-- them: it means "no failed dispatch on record", which is true.
update orders set dispatch_attempts = 0 where dispatch_attempts is null;

-- The dispatch loop reads this to decide what to park after RETRY_FLOOR attempts, and
-- /admin sorts failing orders to the top. Partial index because the rows that have
-- ever failed are the small minority and the only ones either query cares about.
create index if not exists orders_dispatch_failure_idx
  on orders (dispatch_attempts, dispute_status)
  where dispatch_attempts > 0;

-- Supabase's PostgREST layer caches the table shape. Without this it keeps reporting
-- "Could not find the 'dispatch_attempts' column of 'orders' in the schema cache"
-- against a column that plainly exists.
notify pgrst, 'reload schema';

-- Verify. Expect two rows:
--   dispatch_attempts  | integer | NO  | 0
--   last_dispatch_error| text    | YES |
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'orders'
  and column_name in ('dispatch_attempts', 'last_dispatch_error')
order by column_name;
