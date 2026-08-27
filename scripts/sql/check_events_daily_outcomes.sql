-- check_events_daily_outcomes: the named outcome split, PER DAY
--
-- RUN BEFORE DEPLOYING, though nothing breaks if you do not -- see FAILS SOFT
-- below. New function, so this neither drops nor changes an existing one.
--
-- WHY
--
-- check_events_daily() answers "how big was each group that day". It cannot
-- answer "WHICH no_answer", and that is the only question worth asking of the
-- grey bar. On 27 Aug the bar read 6 no answer (29%) and there was no way, from
-- anywhere in /admin, to learn whether those 6 were:
--
--   no_parcel         genuinely not on the roll  -- or a retrieval bug wearing
--                     its clothes, which is what 25 Aug turned out to be
--   ambiguous         a condo owner asked to pick a unit
--   outside_coverage  a Texan on a Florida page, never a customer
--
-- Three different problems with three different fixes, and the chart called all
-- of them one word. check_events_by_outcome() DOES name them, but it aggregates
-- over a fixed 30-day window, so a day whose shape changed is averaged into a
-- month that did not. The 26 Aug city-strip fix took no_parcel from 35% to 10%
-- in a day; over the trailing window it still reads 27%. Both numbers are true
-- and only one of them is about today.
--
-- This is the third iteration of the same lesson (see the header of
-- check_events_daily_split.sql, and TX rule 5 in
-- Lookup_Defect_Catalogue_For_Texas_2026-08-26.md): a bucket that does not name
-- its contents will be read as one cause, and acted on as one cause.
--
-- WHY IT IS A SEPARATE FUNCTION RATHER THAN MORE COLUMNS
--
-- check_events_daily() returns one row per day with a fixed column list, so
-- naming outcomes there means a column per outcome and a DROP/CREATE migration
-- every time lib/checkOutcomes.js grows a branch. That coupling is the same
-- shape as the waitlist CHECK constraint: the vocabulary changes in JavaScript,
-- the database does not hear about it, and the difference is lost silently.
--
-- Long form -- one row per (day, outcome) -- has no vocabulary in it at all. It
-- groups by whatever string is in the column, so an outcome added tomorrow
-- appears here tomorrow with no migration. lib/checkOutcomes.js supplies the
-- label and the group in check-roster.js, where a miss is already surfaced as
-- `unrecognised` rather than absorbed.
--
-- FAILS SOFT, DELIBERATELY
--
-- pages/api/check-roster.js requests this RPC alongside the others and, on
-- error, attaches an empty outcome list to every day and reports the message in
-- `seriesOutcomesError`. The tooltip then falls back to the group counts it
-- showed before. A missing migration must degrade the tooltip, never blank the
-- Funnel tab -- an empty Funnel tab reads as "nobody is checking their address",
-- which is a conclusion somebody could act on by changing the ad campaign.
--
-- NO CHECK CONSTRAINT, HERE OR ANYWHERE NEAR check_events. See the long note in
-- scripts/sql/check_events.sql. This function must return an unrecognised
-- outcome, not hide it.

-- ============================================================================
-- `days` MEANS `days`, NOT `days + 1`. 27 Aug 2026. RE-RUN ALL THREE FILES.
-- ============================================================================
-- Every window in this feature was `checked_on >= current_date - N days`, which
-- covers N+1 dates: today, plus the N before it. At N=30 that is a rounding
-- error nobody would notice. At N=1 -- the "Today" button added on 27 Aug -- it
-- is today AND yesterday, a 100% error on the one window whose entire purpose is
-- to isolate a single day.
--
-- It presented as the Funnel tab disagreeing with itself: the chart drew 8/27 at
-- ~31 checks while the table beside it, set to Today, totalled 95 -- 8/27 plus
-- 8/26. It was hard to see because group SHARES barely move between two adjacent
-- days (48% no-finding in the table against 46% on the bar), so both readings
-- looked plausible and only the volumes disagreed. The near-miss count gave it
-- away: the table read 8, which was exactly the 30-day figure, on a day the
-- chart's own tooltip said 1.
--
-- `>` rather than `>=` on a date column is exact: `checked_on > current_date - 1`
-- is `checked_on = current_date`. Applied to all three functions in
-- check_events.sql and to check_events_daily_split.sql too, because a window that
-- means one thing in the chart and another in the table below it is the drift
-- this tab keeps being rebuilt to remove.
--
-- ALL THREE FILES MUST BE RE-RUN. They are `create or replace` with unchanged
-- return types, so nothing drops and nothing breaks while they are out of step --
-- each function simply keeps its old window until its file is applied.

create or replace function check_events_daily_outcomes(days int default 45)
returns table (checked_on date, outcome text, checks bigint)
language sql
stable
as $$
  select
    e.checked_on,
    e.outcome,
    count(*)::bigint as checks
  from check_events e
  where e.checked_on > (current_date - make_interval(days => days))
  group by e.checked_on, e.outcome
  -- Day descending to match check_events_daily(); within a day, largest first,
  -- so the tooltip renders in the order a reader wants without re-sorting.
  order by e.checked_on desc, count(*) desc, e.outcome;
$$;

-- Sanity: today's named split, which is the number this whole function exists to
-- make readable. Compare the sum against check_events_daily(1).checks -- they
-- must be equal, because this function filters on nothing.
select checked_on, outcome, checks
from check_events_daily_outcomes(1)
order by checks desc;
