-- ============================================================================
-- ADD fl_not_eligible TO waitlist.blocked_reason. 7 Sept 2026.
-- ============================================================================
--
-- lib/waitlistReasons.js lists three reasons. The constraint in
-- scripts/sql/waitlist_blocked_reason.sql permits two. The missing one is
-- `fl_not_eligible` -- and it is the DEFAULT argument of joinList() in
-- pages/check.js, so it is what the email box writes on the Save Our Homes
-- refusal AND on the out-of-state branch.
--
-- This is the defect scripts/sql/check_events.sql's own header is written about:
--
--   "waitlist.blocked_reason had a database CHECK constraint listing permitted
--    reasons. lib/waitlistReasons.js grew a third reason, `fl_not_eligible`; the
--    constraint did not. Every insert carrying it failed, silently, and the
--    leads were lost -- the Save Our Homes bucket, plausibly the largest capture
--    category on the site."
--
-- check_events.sql line 135 calls it "the shape of the STILL-OPEN
-- scripts/sql/waitlist_blocked_reason.sql defect". It was documented as open on
-- 21 Aug and left open. This closes it.
--
-- Note that it is no longer silent: pages/api/join-waitlist.js now alerts ops and
-- returns 500 rather than swallowing the error. So if production still carries
-- the two-value constraint, those captures are failing loudly. If production has
-- been patched by hand, this file is what makes the repo agree with it -- run it
-- either way, it is idempotent.
--
-- The durable fix is not this file. It is the assertion added to
-- scripts/verify-emails.mjs, which parses this constraint back out and compares
-- it to WAITLIST_BLOCKED_REASONS, so the two lists can never drift again without
-- the build stopping. A migration fixes today; the guard fixes next time.

alter table waitlist
  drop constraint if exists waitlist_blocked_reason_check;

alter table waitlist
  add constraint waitlist_blocked_reason_check
  check (blocked_reason is null or blocked_reason in
    ('fl_county_unconfirmed', 'fl_no_parcel_record', 'fl_not_eligible'));

-- PostgREST caches the table shape. Without this the API can keep rejecting a
-- value the constraint now permits -- the failure that cost a live order on
-- 5 Aug 2026.
notify pgrst, 'reload schema';
