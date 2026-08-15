-- ============================================================================
-- referrals.code — THE CONSTRAINT THAT STOPS TWO PARTNERS SHARING ONE CODE
-- ============================================================================
--
-- Run in: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run as many times as you like. It reports before it changes anything,
-- and it will not create the index while a collision exists.
--
--
-- WHY THIS MATTERS MORE THAN IT LOOKS
-- -----------------------------------
-- lib/referralSettlement.js groups orders by referral code. It used to key those
-- groups with `byCode[code] = partner` — last writer wins — so if two partners
-- held the same code, ONE of them collected every order attributed to it and the
-- other silently got nothing. Which one depended on the order the database
-- happened to return rows in.
--
-- That is not recoverable after the fact. A referral payout is a Stripe transfer
-- into a real person's bank account; paying the wrong partner cannot be undone by
-- a later run. So settle() now refuses to pay a duplicated code at all, and
-- pages/api/register-referrer.js claims a code by INSERTING it rather than by
-- asking whether it is free first.
--
-- Neither of those helps without this index. register-referrer relies on the
-- database rejecting a duplicate with SQLSTATE 23505; with no unique index there
-- is nothing to reject it, and the read-then-write race is back.
--
--
-- ORDER OF OPERATIONS
-- -------------------
-- Step 1 reports collisions. If it returns any rows, STOP and resolve them by
-- hand — renaming a live partner's code breaks any link they have already shared,
-- so it is a decision, not a migration. Step 2 refuses to run while any exist.

-- ── Step 1. Are there any collisions today? ─────────────────────────────────
-- Codes are compared case-insensitively and trimmed, because that is exactly how
-- lib/referralSettlement.js normalises them (norm() -> trim + uppercase). A table
-- with 'jsmith' and 'JSMITH' has no duplicate as far as Postgres is concerned and
-- two duplicates as far as the payout logic is concerned.
SELECT
  upper(btrim(code))            AS normalised_code,
  count(*)                      AS partners_holding_it,
  array_agg(id ORDER BY id)     AS referral_ids,
  array_agg(email ORDER BY id)  AS emails
FROM referrals
WHERE code IS NOT NULL AND btrim(code) <> ''
GROUP BY upper(btrim(code))
HAVING count(*) > 1;

-- ── Step 2. The index ───────────────────────────────────────────────────────
-- On upper(btrim(code)), not on code, so it enforces the same rule the payout
-- logic applies. Creating it will FAIL if step 1 returned rows — that failure is
-- the point. Do not drop the index to make the error go away; resolve the
-- collision and run this again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM referrals
    WHERE code IS NOT NULL AND btrim(code) <> ''
    GROUP BY upper(btrim(code))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'referrals.code has collisions — resolve the rows listed by step 1 before creating the index';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'referrals_code_unique_ci'
  ) THEN
    CREATE UNIQUE INDEX referrals_code_unique_ci
      ON referrals (upper(btrim(code)))
      WHERE code IS NOT NULL AND btrim(code) <> '';
    RAISE NOTICE 'created referrals_code_unique_ci';
  ELSE
    RAISE NOTICE 'referrals_code_unique_ci already exists — nothing to do';
  END IF;
END $$;

-- ── Step 3. Confirm ─────────────────────────────────────────────────────────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'referrals';
