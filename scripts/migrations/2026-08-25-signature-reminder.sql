-- 2026-08-25 — the "please sign" reminder moves off the payment webhook.
--
-- Until today that email was sent by lib/fulfillOrder.js at the instant Stripe
-- confirmed payment, i.e. while the customer was being redirected to /success,
-- which is the signing page. It now goes out from
-- pages/api/cron/signature-reminder.js ten minutes later, and only to people who
-- genuinely have not signed by then.
--
-- This column is what makes that exactly-once. It is part of the job's selection
-- filter and is the only column the job writes.
--
-- SAFE TO RUN BEFORE OR AFTER THE DEPLOY. The cron detects the missing column
-- (PostgREST 42703), logs that this migration is outstanding, and sends nothing —
-- it does not fail the run.

alter table public.orders
  add column if not exists signature_reminder_sent_at timestamptz;

comment on column public.orders.signature_reminder_sent_at is
  'When the ten-minute "you have not signed yet" reminder was sent. NULL = not sent. Written only by pages/api/cron/signature-reminder.js; its presence in that job''s filter is what stops a customer receiving the reminder twice.';

-- Partial index: the cron asks for exactly this shape every ten minutes, and the
-- rows it wants are a vanishing fraction of the table.
create index if not exists orders_awaiting_signature_unreminded_idx
  on public.orders (created_at)
  where dispute_status = 'awaiting_signature' and signature_reminder_sent_at is null;

-- Existing unsigned orders are deliberately left NULL, so anyone already sitting
-- in awaiting_signature gets the new, correctly-worded reminder on the next run.
-- On 25 Aug that set is empty — both live orders are filed — so this is a
-- statement of intent rather than a backfill.
