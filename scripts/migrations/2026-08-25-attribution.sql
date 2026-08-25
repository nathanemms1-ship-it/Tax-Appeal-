-- Which ad click paid for an order, if any.
--
-- Run this BEFORE deploying the attribution change. lib/fulfillOrder.js writes
-- both columns on every order from the moment it ships; without them, PostgREST
-- rejects the insert with 42703 and the order row is never written — which is
-- the one step lib/fulfillOrder.js exists to guarantee never gets skipped.
--
-- Both are nullable and stay null for organic and direct visits. That is the
-- normal case, not a defect: a null here means "this customer did not arrive on
-- an ad in the session they bought in".
--
-- gclid is Google's CLICK identifier. It is issued by Google, already present in
-- the URL the visitor arrives on, and cannot be resolved back to a person by us.
-- It identifies the click, not the human.

alter table orders add column if not exists gclid text;
alter table orders add column if not exists utm text;

-- Partial index: the question this data exists to answer is "which orders came
-- from ads", so only the non-null rows are worth indexing. On a table where most
-- rows are organic this stays small.
create index if not exists orders_gclid_idx on orders (gclid) where gclid is not null;

comment on column orders.gclid is
  'Google Ads click id from the session this order was placed in. Null = not from an ad click. See lib/attribution.js.';
comment on column orders.utm is
  'utm_* params from the landing URL, as a raw query string. Null = none present.';
