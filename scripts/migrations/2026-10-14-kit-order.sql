-- Kit model (10 Oct 2026): store the kit builder's input on the order.
-- Run in the Supabase SQL editor BEFORE deploying the code that writes it
-- (lib/fulfillOrder.js). Safe to run twice.
alter table public.orders add column if not exists kit_order jsonb;

-- Kit lifecycle uses new dispute_status values: kit_queued, awaiting_notice,
-- kit_mailed (and the existing needs_review). If dispute_status has a CHECK
-- constraint or is an enum, those values must be allowed; this query shows it:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.orders'::regclass and contype = 'c';
