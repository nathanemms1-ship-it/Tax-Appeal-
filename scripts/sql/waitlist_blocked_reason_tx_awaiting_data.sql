-- 19 Oct 2026: Texas. A real protest case in a district that did not publish its
-- data before the protest deadline last year, so we take no reservation there
-- (lib/tx/inSeason.js). Owed one email when that district's data for the season
-- is loaded. See lib/waitlistReasons.js.
-- Run in the Supabase SQL editor before deploying the code that writes it.

alter table waitlist
  drop constraint if exists waitlist_blocked_reason_check;

alter table waitlist
  add constraint waitlist_blocked_reason_check
  check (blocked_reason is null or blocked_reason in
    ('fl_county_unconfirmed', 'fl_no_parcel_record', 'fl_not_eligible', 'ga_county_not_open', 'tx_county_not_open', 'tx_awaiting_data'));

notify pgrst, 'reload schema';
