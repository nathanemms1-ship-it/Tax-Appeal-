-- 15 Oct 2026: Georgia kit. A real appeal case in a county not yet open for kits
-- (appeal address unconfirmed, or its own form unsettled). See lib/waitlistReasons.js.
-- Run in the Supabase SQL editor before deploying the code that writes it.

alter table waitlist
  drop constraint if exists waitlist_blocked_reason_check;

alter table waitlist
  add constraint waitlist_blocked_reason_check
  check (blocked_reason is null or blocked_reason in
    ('fl_county_unconfirmed', 'fl_no_parcel_record', 'fl_not_eligible', 'ga_county_not_open'));

notify pgrst, 'reload schema';
