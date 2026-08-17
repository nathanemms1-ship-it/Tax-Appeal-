-- ============================================================================
-- PARTNER PERK — one transferable, single-use $20 coupon per partner
-- ============================================================================
-- See lib/partnerPerk.js for the reasoning. This file only creates the storage
-- the three statements in that file's SQL export operate on.
--
-- Run once, against production, before the welcome email starts mentioning a
-- code. Idempotent — safe to re-run.

alter table referrals add column if not exists perk_code             text;
alter table referrals add column if not exists perk_issued_at        timestamptz;
alter table referrals add column if not exists perk_redeemed_at      timestamptz;
alter table referrals add column if not exists perk_redeemed_order_id text;

-- ── The reservation pair ────────────────────────────────────────────────────
-- A checkout session HOLDS the code while the customer is paying, and the hold
-- turns into a redemption on checkout.session.completed.
--
-- Two columns rather than one status enum, because the questions asked of them
-- are different: "is this held right now" is a time comparison against
-- RESERVATION_MINUTES, and "held by WHOM" has to be the Stripe session id so a
-- webhook cannot consume a reservation belonging to a different session. An enum
-- would answer the first and lose the second.
--
-- Nothing expires these on a schedule. A reservation older than the hold is
-- simply ignored by the next reserve, so an abandoned cart needs no cleanup job —
-- and therefore no cron that can fail silently, which is the failure mode the
-- waitlist cron is currently sitting in.
alter table referrals add column if not exists perk_reserved_at      timestamptz;
alter table referrals add column if not exists perk_reserved_session text;

-- ── Uniqueness is the whole product ─────────────────────────────────────────
-- The code is the credential. Two partners sharing one would let either consume
-- the other's coupon, and the conditional UPDATE that enforces single use matches
-- on `perk_code` — so a duplicate would make "one time use" mean "one time across
-- both of them", silently.
--
-- Partial, so the many rows that predate this migration do not collide on NULL.
create unique index if not exists referrals_perk_code_unique
  on referrals (perk_code) where perk_code is not null;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Existing partners get a code too. They signed up under a program that now
-- includes this, and issuing to new partners only would mean the people who
-- joined earliest are the only ones without it.
--
-- The alphabet MUST match ALPHABET in lib/partnerPerk.js — O, I, S, 0, 1 and 5
-- are absent because this code gets read aloud and retyped from a phone. If the
-- two ever disagree, generated codes will fail normalizePerkCode()'s alphabet
-- check and no backfilled coupon will work.
do $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  r record;
  candidate text;
  attempts int;
begin
  for r in select code from referrals where perk_code is null loop
    attempts := 0;
    loop
      attempts := attempts + 1;
      -- Fail loudly rather than looping forever. At 30^8 combinations against a
      -- few hundred partners, 50 collisions in a row means something is wrong
      -- with the generator, not with luck.
      if attempts > 50 then
        raise exception 'perk code generation failed for referral % after 50 attempts', r.code;
      end if;
      candidate := 'TAP-' ||
        (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
           from generate_series(1, 4)) || '-' ||
        (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
           from generate_series(1, 4));
      begin
        update referrals
           set perk_code = candidate,
               perk_issued_at = coalesce(perk_issued_at, now())
         where code = r.code and perk_code is null;
        exit;
      exception when unique_violation then
        -- Collision. Try again.
      end;
    end loop;
  end loop;
end $$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: partners = with_code, and duplicates = 0.
select
  count(*)                                        as partners,
  count(perk_code)                                as with_code,
  count(*) - count(distinct perk_code)            as duplicates,
  count(perk_redeemed_at)                         as redeemed,
  count(perk_reserved_at)                         as currently_reserved
from referrals;

-- ============================================================================
-- THE ORDER SIDE — so a redeemed coupon can cancel the referral commission
-- ============================================================================
-- Nathan, 17 Aug 2026: "The coupon code also has to disable any partner payout
-- as well." Without this an order can pay $20 off AND $20 commission — $40 out
-- on an $89 fee.
--
-- The flag lives on the ORDER rather than only on `referrals` because
-- lib/referralSettlement.js decides one order at a time from the order row it was
-- handed. Asking "does any referral row claim this order id" would add a query
-- per order to a cron that already pages the whole ledger, and would let the two
-- tables disagree — paying a commission because a lookup failed rather than
-- because it was owed. A local column cannot fail to load.

alter table orders add column if not exists perk_code            text;
alter table orders add column if not exists perk_discount_cents  integer;

-- Answers "which order consumed this coupon" without scanning, and makes a
-- double-stamp visible immediately rather than at reconciliation.
create index if not exists orders_perk_code on orders (perk_code) where perk_code is not null;

-- ── Verify the order side ───────────────────────────────────────────────────
-- Expect zeros on a fresh migration. After go-live, `orders_with_perk` should
-- equal `referrals.perk_redeemed_at` count exactly — any drift between them means
-- the webhook stamped one table and not the other.
select
  count(*) filter (where perk_code is not null)                     as orders_with_perk,
  count(*) filter (where perk_code is not null and perk_discount_cents is null) as stamped_without_amount
from orders;

-- ============================================================================
-- RESERVE AND CONFIRM AS DATABASE FUNCTIONS
-- ============================================================================
-- These were originally going to be raw statements issued from the API layer.
-- They are functions instead for one reason: supabase-js speaks PostgREST, and
-- PostgREST cannot express `coalesce(active, true) = true` alongside the
-- staleness OR without the two filters combining ambiguously. Rebuilding that in
-- JavaScript would mean reading the row, deciding, then writing — which is the
-- exact read-then-write race the whole design exists to avoid.
--
-- In a function the predicate and the write are one statement, and Postgres
-- decides. Zero rows returned means the caller LOST: the code is unknown,
-- already redeemed, or held by another checkout. There is no third state and no
-- follow-up SELECT — a re-read would reintroduce the race.

create or replace function perk_reserve(p_code text, p_session text)
returns table(referral_code text, coupon text)
language plpgsql
as $fn$
begin
  return query
  update referrals r
     set perk_reserved_at = now(),
         perk_reserved_session = p_session
   where r.perk_code = p_code
     -- coalesce, not `active = true`: rows predating the column are NULL, and a
     -- NULL comparison would silently exclude every legacy partner.
     and coalesce(r.active, true) = true
     and r.perk_redeemed_at is null
     and (r.perk_reserved_at is null
          or r.perk_reserved_at < now() - interval '30 minutes'
          -- Re-entrant: the same session reserving twice (a retried request, a
          -- double-clicked button) must succeed rather than lock itself out.
          or r.perk_reserved_session = p_session)
  returning r.code, r.perk_code;
end
$fn$;

create or replace function perk_confirm(p_code text, p_session text, p_order_id text)
returns table(referral_code text)
language plpgsql
as $fn$
begin
  return query
  update referrals r
     set perk_redeemed_at = now(),
         perk_redeemed_order_id = p_order_id,
         perk_reserved_at = null,
         perk_reserved_session = null
   -- Scoped to the session holding the reservation. Matching on perk_code alone
   -- would let a webhook for one session consume a reservation belonging to
   -- another — which under concurrent checkouts is exactly what would happen.
   where r.perk_code = p_code
     and r.perk_reserved_session = p_session
     and r.perk_redeemed_at is null
  returning r.code;
end
$fn$;

create or replace function perk_release(p_code text, p_session text)
returns table(referral_code text)
language plpgsql
as $fn$
begin
  return query
  update referrals r
     set perk_reserved_at = null, perk_reserved_session = null
   where r.perk_code = p_code and r.perk_reserved_session = p_session
     and r.perk_redeemed_at is null
  returning r.code;
end
$fn$;
