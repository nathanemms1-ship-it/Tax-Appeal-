-- waitlist.blocked_reason
--
-- Run this in Supabase (SQL Editor) BEFORE deploying. The code degrades safely if
-- you deploy first — the insert in /api/join-waitlist just fails and the customer
-- still sees the "we'll email you" screen — but nobody's email is recorded, which
-- is the whole point of the screen. Column first, deploy second.
--
-- WHAT IT IS FOR
-- As of 11 Aug 2026 the Florida funnel refuses an order in a county whose VAB
-- mailing address or filing fee we have not confirmed with the county, instead of
-- accepting it and filing by hand. Those homeowners are recorded on the waitlist so
-- we can write to them when the county confirms.
--
-- They cannot be plain waitlist rows. cron/notify-waitlist.js emails every current
-- year row "your filing window just opened, file today" when the state window opens.
-- For these counties it has not opened, and the funnel would refuse them the second
-- they clicked. This column is what makes that branch possible.
--
-- Values: NULL (ordinary waitlist row)
--         'fl_county_unconfirmed'  county VAB address or fee not confirmed
--         'fl_no_parcel_record'    no parcel for this address on the DOR roll
--
-- RE-RUN THIS FILE if you ran an earlier version: 'fl_no_parcel_record' was added
-- on 11 Aug 2026 and the CHECK constraint below would reject it. The file drops and
-- recreates the constraint, so re-running is safe and is the intended way to widen
-- the allowed set.
-- The API stores anything unrecognised as NULL rather than passing it through, so an
-- unknown value can never route someone into the wrong email.

alter table waitlist
  add column if not exists blocked_reason text;

-- Every existing row predates this feature and is an ordinary waitlist entry.
-- Stated explicitly rather than relying on the column default, so re-running this
-- file on a database where someone has been experimenting is still correct.
update waitlist set blocked_reason = null where blocked_reason = '';

alter table waitlist
  drop constraint if exists waitlist_blocked_reason_check;

alter table waitlist
  add constraint waitlist_blocked_reason_check
  check (blocked_reason is null or blocked_reason in ('fl_county_unconfirmed', 'fl_no_parcel_record'));

-- The cron scans the whole current filing year every day and branches on this
-- column. Partial index: the blocked rows are the small set and the only ones the
-- new branch cares about.
create index if not exists waitlist_blocked_reason_idx
  on waitlist (blocked_reason, filing_year)
  where blocked_reason is not null;

-- Supabase's PostgREST layer caches the table shape. Without this the API keeps
-- reporting "Could not find the 'blocked_reason' column of 'waitlist' in the schema
-- cache" against a column that plainly exists — the exact failure that cost a live
-- order on 5 Aug 2026.
notify pgrst, 'reload schema';

-- Verify. Expect one row: blocked_reason | text | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'waitlist' and column_name = 'blocked_reason';
