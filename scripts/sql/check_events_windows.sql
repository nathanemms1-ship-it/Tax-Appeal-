-- check_events windows: `days` means `days`, not `days + 1`
--
-- RUN THIS ONE FILE. It is the only migration needed for the 27 Aug window fix.
--
-- ============================================================================
-- WHY THIS FILE EXISTS RATHER THAN "RE-RUN THE OTHER THREE"
-- ============================================================================
-- The window predicate changed in check_events.sql, check_events_daily_split.sql
-- and check_events_daily_outcomes.sql, and the obvious instruction — re-run all
-- three — DOES NOT WORK, in a way that fails silently on the part you care about.
--
-- check_events.sql still declares the pre-split `check_events_daily`, the one
-- returning five columns. The database has the seven-column version, because
-- check_events_daily_split.sql dropped and replaced it on 26 Aug. Postgres will
-- not let `create or replace function` change a return type (42P13), and
-- run-sql.mjs deliberately sends each file as ONE implicit transaction — so
-- check_events.sql would abort at that statement and roll back, taking the window
-- fixes for check_events_by_outcome and check_events_by_county with it. The
-- console would show one error against a file that is mostly unrelated to this
-- change, and the two functions the Funnel tab's tables actually read would
-- silently keep the old window.
--
-- Re-ordering does not help: whichever of the two files runs second hits the same
-- conflict from the other side.
--
-- So this file replaces the four functions AS THEY EXIST TODAY, in one
-- transaction, with the only difference being `>` where each had `>=`. The other
-- three files carry the same correction for a fresh install; this is the one to
-- run against a database that is already live.
--
-- ============================================================================
-- WHAT THE BUG WAS
-- ============================================================================
-- `checked_on >= current_date - N days` spans N+1 dates: today, plus the N before
-- it. At the 30-day default that is a rounding error. At N=1 — the window the
-- Today control on the Funnel tab asks for — it is today AND yesterday, a 100%
-- error on the one window whose entire purpose is to isolate a single day.
--
-- It presented as the tab disagreeing with itself: the chart drew 27 Aug at ~31
-- checks while the table beside it, set to Today, totalled 95 — 27 Aug plus
-- 26 Aug. Adjacent days have near-identical group SHARES (48% no-finding in the
-- table against 46% on the bar), so both readings looked plausible and only the
-- volumes disagreed. The tell was the near-miss count: the table read 8, which
-- was exactly the 30-day figure, on a day the chart's own tooltip said 1.
--
-- `>` on a date column is exact: `checked_on > current_date - 1` is
-- `checked_on = current_date`.
--
-- IDEMPOTENT. Re-running it is a no-op. Safe to run before or after the deploy —
-- no application code reads a shape that changes here.

-- The drop is required, not defensive: this recreates the SEVEN-column form that
-- check_events_daily_split.sql introduced, and a replace cannot change arity.
drop function if exists check_events_daily(int);

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
  where e.checked_on > (current_date - make_interval(days => days))
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
  where e.checked_on > (current_date - make_interval(days => days))
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
  where e.checked_on > (current_date - make_interval(days => days))
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
  where e.checked_on > (current_date - make_interval(days => days))
  group by e.checked_on, e.outcome
  order by e.checked_on desc, count(*) desc, e.outcome;
$$;

-- PostgREST caches the schema. Without this the replaced functions stay invisible
-- to the API despite existing in the database — the failure that cost a live order
-- on 5 Aug against a column that had been created correctly.
notify pgrst, 'reload schema';

-- ============================================================================
-- PROOF, NOT "applied in 0.4s"
-- ============================================================================
-- A migration run against the wrong database is the mistake that looks most like
-- success. The first select must return ONE row: today, and today only. The
-- second must show the same total as the chart's bar for today.
select 'today only — this must be a single row' as check, checked_on, checks
from check_events_daily(1);

select 'named split for today' as check, outcome, checks
from check_events_daily_outcomes(1)
order by checks desc;
