-- 15 Oct 2026: Texas kit. A real protest case (the bill drops by more than the
-- price) in a district whose protest address is not confirmed yet. See
-- lib/waitlistReasons.js and lib/kit/txQuote.js.
-- Run in the Supabase SQL editor before deploying the code that writes it.

alter table waitlist
  drop constraint if exists waitlist_blocked_reason_check;

alter table waitlist
  add constraint waitlist_blocked_reason_check
  check (blocked_reason is null or blocked_reason in
    ('fl_county_unconfirmed', 'fl_no_parcel_record', 'fl_not_eligible', 'ga_county_not_open', 'tx_county_not_open'));

notify pgrst, 'reload schema';
