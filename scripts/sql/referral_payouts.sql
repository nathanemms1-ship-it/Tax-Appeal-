-- ============================================================================
-- referral_payouts — THE LEDGER THAT STOPS US PAYING THE SAME ORDER TWICE
-- ============================================================================
--
-- Run in: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run as many times as you like. Every statement checks first.
--
--
-- WHAT THIS IS AND IS NOT
-- -----------------------
-- It is NOT a fresh CREATE. When this was written the table already existed in
-- Supabase — created by hand at some point, never referenced by any migration in
-- this repository, and empty. It already had the single most important thing in
-- the design: a UNIQUE index on order_id.
--
-- That constraint is the only double-payment guard that cannot race. Application
-- code deciding "I have not paid this one yet" leaves a gap between the read and
-- the write; two overlapping settlement runs — a Vercel retry, a manual run while
-- the scheduled one is mid-flight — both read an empty ledger and both pay. The
-- database closes that gap. Do not drop it to "fix" a duplicate-key error. That
-- error IS the fix working.
--
-- So this brings the existing table up to what /api/cron/settle-referrals writes,
-- and creates the whole thing from scratch only if it is missing (a fresh branch
-- database, a rebuilt project).
--
--
-- WHAT IT CHANGES, AND THE ONE THAT MATTERS
-- -----------------------------------------
--   ADDS   partner_email, stripe_account_id, failure_reason
--          The settlement run writes all three. Without them those values are
--          dropped on the floor and a failed transfer leaves no reason behind.
--
--   ADDS   a CHECK on status, and a UNIQUE index on stripe_transfer_id
--          One Stripe transfer must map to exactly one ledger row. If the same
--          transfer id ever lands on two rows we have double-counted a payment,
--          and we want to hear about it immediately rather than at tax time.
--
--   FIXES  the foreign key: ON DELETE CASCADE -> ON DELETE RESTRICT
--          As it stood, deleting an order silently deleted the record that we had
--          paid a partner for it. A payout ledger has to outlive the thing it paid
--          for: that row is the evidence behind a 1099 and the only proof the money
--          was sent. RESTRICT makes Postgres refuse to delete an order that has a
--          payout against it, which is the correct answer — if you genuinely need
--          the order gone, deal with the payout deliberately first.
--
--   KEEPS  payout_month (text, 'YYYY-MM'). The settlement run was changed to write
--          this column rather than introduce a second, differently-shaped notion of
--          "period" alongside it.
-- ============================================================================


-- ── 1. Fresh databases only. A no-op where the table already exists. ─────────
CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  ref_code           text NOT NULL,
  amount_cents       integer NOT NULL DEFAULT 2000,
  status             text NOT NULL DEFAULT 'pending',
  payout_month       text,
  stripe_transfer_id text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz
);


-- ── 2. Columns the settlement run writes. ────────────────────────────────────
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS partner_email     text;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE public.referral_payouts ADD COLUMN IF NOT EXISTS failure_reason    text;


-- ── 3. The order_id UNIQUE guard. Almost certainly already present; asserted
--       here so a rebuilt database cannot come up without it. ────────────────
CREATE UNIQUE INDEX IF NOT EXISTS referral_payouts_order_id_key
  ON public.referral_payouts (order_id);


-- ── 4. One Stripe transfer, one row. NULLs are ignored by a unique index, so
--       pending and failed rows are unaffected. ─────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS referral_payouts_transfer_id_idx
  ON public.referral_payouts (stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_payouts_status
  ON public.referral_payouts (status);


-- ── 5. status may only ever be one of three values. ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.referral_payouts'::regclass
       AND conname  = 'referral_payouts_status_check'
  ) THEN
    ALTER TABLE public.referral_payouts
      ADD CONSTRAINT referral_payouts_status_check
      CHECK (status IN ('pending', 'paid', 'failed'));
  END IF;
END
$$;


-- ── 6. The foreign key: CASCADE -> RESTRICT. ────────────────────────────────
-- Found by definition rather than by name, because the existing constraint was
-- created by hand and a hardcoded name would silently match nothing.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
    FROM pg_constraint
   WHERE conrelid = 'public.referral_payouts'::regclass
     AND contype  = 'f'
     AND confdeltype = 'c';          -- 'c' = CASCADE

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.referral_payouts DROP CONSTRAINT %I', fk_name);
    EXECUTE format(
      'ALTER TABLE public.referral_payouts ADD CONSTRAINT %I ' ||
      'FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT', fk_name);
    RAISE NOTICE 'referral_payouts: order_id foreign key changed from CASCADE to RESTRICT';
  END IF;
END
$$;


-- ── 7. Access. ──────────────────────────────────────────────────────────────
-- RLS on with no policies = unreachable through the anon and authenticated keys,
-- which are the ones shipped to browsers. The settlement run and the payout sheet
-- use SUPABASE_SERVICE_KEY, which bypasses RLS by design.
--
-- This is a table of who we paid and how much. It should never be one fetch away
-- from a partner's browser.
ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.referral_payouts IS
  'Partner referral payout ledger. One row per order, ever. Written only by /api/cron/settle-referrals.';


-- ── 8. Show the result. ─────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.referral_payouts) AS rows_in_table,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referral_payouts') AS column_count,
  (SELECT confdeltype FROM pg_constraint
    WHERE conrelid = 'public.referral_payouts'::regclass AND contype = 'f') AS fk_on_delete,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'referral_payouts') AS index_count;
