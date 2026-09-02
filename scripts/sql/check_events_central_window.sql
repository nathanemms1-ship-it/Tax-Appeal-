-- check_events windows: the day boundary is Central, and `current_date` is UTC
--
-- RUN THIS ONE FILE. It replaces the four functions defined by
-- check_events_windows.sql (27 Aug) with byte-identical bodies and one change:
-- the window is anchored to the CENTRAL date instead of Postgres `current_date`.
--
-- ============================================================================
-- WHAT THE BUG WAS
-- ============================================================================
-- lib/recordCheck.js stamps `checked_on` with the CENTRAL date, deliberately, so
-- that the Funnel and Traffic tabs agree about what "today" is and an evening
-- test does not split across two bars. `current_date` in Postgres is UTC.
--
-- Central is UTC-5, so from 7pm Central until midnight `current_date` is ALREADY
-- TOMORROW relative to every row written that evening:
--
--   select current_date, (now() at time zone 'America/Chicago')::date;
--   -- 2026-09-02 | 2026-09-01      <- measured, 1 Sept 2026
--
-- The 27 Aug fix changed the predicate from `>=` to `>` so that N=1 meant one
-- day. That change was correct, and it is precisely what turned a benign
-- off-by-one into a nightly blackout:
--
--   >= current_date - 1   ->   >= 2026-09-01   ->   today's rows INCLUDED (by luck)
--   >  current_date - 1   ->   >  2026-09-01   ->   EMPTY
--
-- So every evening after 7pm Central the Today window returns nothing, while the
-- 45-day chart -- a window wide enough that the one-day shift never reaches its
-- edge -- draws the very same rows correctly. The tab disagreeing with itself is
-- the same symptom the 27 Aug fix was written to cure, one layer further down.
--
-- Observed 1 Sept 2026, 20:0x Central: the chart's tooltip read 3 checks
-- (2 condition case, 1 no parcel) while REACHED A FINDING read 0 and the table
-- beneath it read "Nothing recorded yet".
--
-- This is also why the 28 Aug reading looked sane: it was taken at 08:38 CT,
-- when the UTC and Central dates still agreed. The panel is correct every
-- morning and empty every evening, which is the worst shape a reporting bug can
-- take -- it looks like the business going quiet overnight.
--
-- ============================================================================
-- WHY THIS IS FIXED IN SQL AND NOT IN check-roster.js
-- ============================================================================
-- check-roster.js already computes `todayCentral` in JS and could pass a date
-- down instead. That would leave these functions still wrong for anything
-- calling them from the SQL editor, and it would put the day boundary in two
-- places -- which is how `minDays` and the filing-window tables ended up
-- duplicated. The column is WRITTEN in Central; the window that READS it belongs
-- in Central too.
--
-- IDEMPOTENT. No return types change, so no drops are required and re-running is
-- a no-op. Safe before or after a deploy: no application code reads a shape that
-- changes here.

create or replace function check_events_daily(days int default 45)
returns table (
  checked_on   date,
  checks       bigint,
  refused      bigint,
  eligible     bigint,
  rescuable    bigint,
  our_failure  bigint,
  no_answer    bigint
)
language sql
stable
as $$
  select
    e.checked_on,
    count(*)::bigint                                             as checks,
    count(*) filter (where e.outcome in (
      'cap_absorbs_everything', 'saving_below_cost',
      'no_just_value', 'not_residential', 'no_taxable_value'))::bigint  as refused,
    count(*) filter (where e.outcome in (
      'clearable', 'no_cap_differential'))::bigint               as eligible,
    count(*) filter (where e.outcome = 'needs_condition_case')::bigint  as rescuable,
    count(*) filter (where e.outcome in (
      'no_parcel_near_miss', 'lookup_failed', 'error', 'bad_input'))::bigint as our_failure,
    count(*) filter (where e.outcome in (
      'outside_coverage', 'no_parcel', 'ambiguous'))::bigint     as no_answer
  from check_events e
  where e.checked_on > (((now() at time zone 'America/Chicago')::date) - make_interval(days => days))
  group by e.checked_on
  order by e.checked_on desc;
$$;

create or replace function check_events_by_outcome(days int default 30, src text default null)
returns table (outcome text, source text, checks bigint, median_cut_pct numeric)
language sql
stable
as $$
  select
    e.outcome,
    e.source,
    count(*)::bigint as checks,
    percentile_cont(0.5) within group (order by e.required_cut_pct)::numeric as median_cut_pct
  from check_events e
  where e.checked_on > (((now() at time zone 'America/Chicago')::date) - make_interval(days => days))
    and (src is null or e.source = src)
  group by e.outcome, e.source
  order by count(*) desc;
$$;

create or replace function check_events_by_county(days int default 30)
returns table (county text, checks bigint, refused bigint)
language sql
stable
as $$
  select
    coalesce(e.county, 'unknown') as county,
    count(*)::bigint as checks,
    count(*) filter (where e.outcome in (
      'cap_absorbs_everything', 'saving_below_cost',
      'no_just_value', 'not_residential', 'no_taxable_value'))::bigint as refused
  from check_events e
  where e.checked_on > (((now() at time zone 'America/Chicago')::date) - make_interval(days => days))
  group by 1
  order by 2 desc
  limit 50;
$$;

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
  where e.checked_on > (((now() at time zone 'America/Chicago')::date) - make_interval(days => days))
  group by e.checked_on, e.outcome
  order by e.checked_on desc, count(*) desc, e.outcome;
$$;

-- PostgREST caches the schema. Without this the replaced functions stay invisible
-- to the API despite existing in the database -- the failure that cost a live
-- order on 5 Aug against a column that had been created correctly.
notify pgrst, 'reload schema';

-- ============================================================================
-- PROOF, NOT "applied in 0.4s"
-- ============================================================================
-- Run this in the evening Central, when the two dates differ, or the fix and the
-- bug are indistinguishable. Before this file, select 2 returned zero rows.
select 'the two dates the bug was made of' as check,
       current_date                                   as pg_utc_date,
       (now() at time zone 'America/Chicago')::date    as central_date;

select 'today only -- must be one row, and must equal the chart bar for today' as check,
       checked_on, checks
from check_events_daily(1);

select 'named split for today -- must equal the chart tooltip' as check,
       outcome, checks
from check_events_daily_outcomes(1)
order by checks desc;
