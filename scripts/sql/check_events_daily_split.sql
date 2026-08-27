-- check_events_daily: split the grey bar into "our failure" and "no answer"
--
-- RUN BEFORE DEPLOYING. The return type changes, so this drops and recreates --
-- Postgres refuses to change a function's return columns in place. /admin reads
-- the new columns; until this runs, check-roster's daily read returns the old
-- shape and the two new segments render as zero.
--
-- WHY
--
-- The chart computed grey as a RESIDUAL -- checks minus the three findings -- so
-- it merged seven outcomes with nothing in common. On 26 Aug it read 42% "no
-- finding", which sounded like an emergency and was mostly not one: 5 genuine
-- misses, 9 people asked which unit was theirs, and 7 real matcher failures. The
-- day before, the same bar was 28 genuine-looking misses that were actually one
-- retrieval bug. A merged bar is how a 26% no_parcel rate sat unexamined.
--
-- THE SPLIT
--
--   our_failure  our bug, always worth waking up for:
--                no_parcel_near_miss  the roll HAS it, the matcher refused it
--                lookup_failed        the database did not answer
--                error                a 500
--                bad_input            no street submitted -- means the FORM broke
--                                     (see pages/api/check.js, where it is recorded
--                                     precisely so a spike is visible from here)
--
--   no_answer    nothing for us to fix in code:
--                outside_coverage     not in Florida. Never was a customer.
--                no_parcel            genuinely not on the roll
--                ambiguous            several parcels matched; they were asked to
--                                     pick. A question, not a failure.
--
-- Deliberately NOT more segments. At 45 days the daily bar is ~20px wide and a
-- seven-way stack is unreadable; the full breakdown is in the tooltip and in the
-- by-outcome table below the chart.

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

-- Sanity: the last 3 days, and every row's parts should sum to checks. Any
-- shortfall is an outcome the vocabulary does not know -- which is the exact
-- failure lib/checkOutcomes.js line 107 hides by defaulting unknowns to no_answer.
select
  checked_on, checks,
  refused + eligible + rescuable + our_failure + no_answer as accounted_for,
  checks - (refused + eligible + rescuable + our_failure + no_answer) as unaccounted
from check_events_daily(3);
