-- WHAT /api/check ACTUALLY ANSWERED, ONE ROW PER CHECK.
--
-- ============================================================================
-- THE QUESTION THIS EXISTS TO ANSWER
-- ============================================================================
-- Roughly 39% of Florida residential parcels cannot benefit from an appeal at
-- all -- 1,995,000 of 5,155,929 across the 13 largest counties, per the header
-- of pages/api/check.js. So the expected experience of a random Florida
-- homeowner typing their address into /check is a refusal.
--
-- Nobody knows whether that is what is actually happening, because until this
-- table existed /api/check wrote nothing on any branch. Every outcome -- the
-- refusals, the eligible ones, the parcels we hold no record of -- vanished the
-- moment the response was sent. The only trace a refused visitor could leave was
-- an email address they chose to type afterwards, and all-time that has happened
-- zero times.
--
-- /check is the Google Ads final URL as of 21 Aug 2026. This is the table that
-- says whether the money is buying refusals.
--
-- ============================================================================
-- THERE IS DELIBERATELY NO CHECK CONSTRAINT ON `outcome`
-- ============================================================================
-- READ THIS BEFORE ADDING ONE. It looks like an obvious improvement and it is
-- the exact defect that cost this project its largest capture category.
--
-- waitlist.blocked_reason carries a CHECK constraint listing the permitted
-- reasons. lib/waitlistReasons.js grew a third reason, `fl_not_eligible`; the
-- constraint did not. Every insert carrying it violated the constraint, the
-- write failed, and the lead was lost -- silently, because the caller never
-- destructured { error }. That is the Save Our Homes bucket, plausibly the
-- largest category on the site, discarded for weeks. Third recurrence of the
-- same shape: fl_no_parcel_record needed the same widening on 11 Aug.
--
-- A constraint here would trade the same way, and worse: the whole value of this
-- table is telling us about outcomes we did not anticipate. An outcome nobody
-- predicted is the single most interesting row it can hold, and a CHECK
-- constraint is a rule that throws exactly those away.
--
-- The vocabulary is enforced where enforcement is free and visible instead:
-- lib/checkOutcomes.js is the closed list, and scripts/verify-check-events.mjs
-- FAILS THE BUILD when a `reason:` string in lib/dor/qualify.js,
-- lib/dor/parcels.js or pages/api/check.js has no entry in it. Code-to-code
-- drift is caught before deploy; database-to-code drift cannot lose a row.
--
-- ============================================================================
-- WHAT IS STORED, AND WHAT IS NOT
-- ============================================================================
-- Stored:      the date, which outcome, which page asked, the county, and how
--              far below the cap the parcel sat (whole percent).
-- Not stored:  the address, the ZIP, the email, the IP, the user agent, the
--              parcel ID, the owner name, the just value, any digest of any of
--              them, and anything else that could name a house or a person.
--
-- This records the SHAPE of an answer, not who asked for it. A county plus a
-- rounded percentage describes thousands of parcels, which is the point -- there
-- is no join here back to a household, and none should ever be added. If a
-- future question needs one, that is a different table with a different
-- justification, not a column bolted onto this one.
--
-- Consequence, stated plainly: repeat checks count as repeat checks. Somebody
-- checking three addresses is three rows and somebody refreshing is two. With no
-- visitor key there is no way to tell those apart, and inventing one would mean
-- storing an identifier this table has just finished refusing to store. Compare
-- the daily count against site_visits for /check to sanity-check the ratio.

create table if not exists check_events (
  id                bigserial primary key,

  -- Central, matching site_visits and every other date in /admin. On UTC,
  -- everything after 7pm Nathan's time lands on tomorrow, so an evening ad test
  -- splits across two days and neither matches the number he remembers.
  checked_on        date        not null,

  -- The reason string returned to the caller. See lib/checkOutcomes.js.
  outcome           text        not null,

  -- 'check'  -- pages/check.js, the free savings check and the ad landing page
  -- 'apply'  -- pages/apply.js, which runs the SAME endpoint again at the
  --             property step for somebody already inside the funnel
  --
  -- Without this the two are indistinguishable and the top-of-funnel refusal
  -- rate is diluted by re-checks from people who already cleared the gate --
  -- which would understate exactly the number this table was built to measure.
  source            text        not null default 'unknown',

  -- County name, never the DOR number. join-waitlist stored the number as a
  -- string ("29" rather than "Hillsborough") and everything downstream that
  -- looked it up missed and fell back to a statewide default.
  county            text,

  -- How far the market value would have to fall before this owner's bill moves
  -- at all, in whole percent. This is the difference between a refused
  -- population sitting 8% away -- who a soft market rescues, and who are worth
  -- emailing -- and one sitting 60% away, who never become customers. Null
  -- wherever the arithmetic never ran.
  required_cut_pct  int,

  created_at        timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY, ON, WITH NO POLICIES. THAT COMBINATION IS THE POINT.
-- ============================================================================
-- Every other table in this database has RLS enabled -- all 13 of them, checked
-- 21 Aug 2026. Creating this one without it would make check_events the single
-- unprotected table in the project, readable by anyone holding the anon key.
-- That key ships to every browser that loads the site; it is public by design.
-- Nothing in here names a person, but it is still the whole funnel: refusal
-- rates, county breakdowns, daily volumes. That is competitive intelligence.
--
-- NO POLICIES IS DELIBERATE. RLS with zero policies denies anon and
-- authenticated everything, which is exactly right -- nothing legitimate reads
-- this table with those keys:
--
--   lib/recordCheck.js        POSTs with SUPABASE_SERVICE_KEY
--   pages/api/check-roster.js getSupabaseAdmin() -> SUPABASE_SERVICE_KEY
--   lib/healthChecks.js       SUPABASE_SERVICE_KEY
--
-- service_role has BYPASSRLS, so all three are unaffected. If a future reader
-- needs the anon key, it needs a policy written on purpose -- not a table left
-- open in advance in case somebody someday wants it.
--
-- WHY THIS LINE IS IN THE FILE RATHER THAN CLICKED IN THE DASHBOARD. The
-- Supabase SQL editor offers a "Run and enable RLS" button when it sees a
-- create table without one. Taking it would have secured production today and
-- left this file still creating an unprotected table -- so re-running it on any
-- other environment would quietly produce the insecure version. That is exactly
-- the shape of the still-open scripts/sql/waitlist_blocked_reason.sql defect,
-- where the file in the repo re-introduces a constraint that was fixed in
-- production. One of those is enough.
alter table check_events enable row level security;

create index if not exists check_events_date_idx
  on check_events (checked_on desc);

create index if not exists check_events_outcome_idx
  on check_events (checked_on desc, outcome);


-- ============================================================================
-- AGGREGATES IN SQL, FOR THE REASON site_visits.sql GIVES
-- ============================================================================
-- /api/waitlist-roster pulls rows and counts them in JavaScript, correctly,
-- because it also renders the row bodies and has an explicit ceiling check. This
-- one needs counts and not bodies. Counting fetched rows would mean the panel
-- silently understates itself the first day checks exceed the fetch cap -- the
-- settle-referrals unbounded-read defect in a new place. An aggregate cannot
-- truncate.

create or replace function check_events_daily(days int default 45)
returns table (checked_on date, checks bigint, refused bigint, eligible bigint, rescuable bigint)
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
    count(*) filter (where e.outcome = 'needs_condition_case')::bigint  as rescuable
  from check_events e
  where e.checked_on >= (current_date - make_interval(days => days))
  group by e.checked_on
  order by e.checked_on desc;
$$;

-- The headline breakdown. `src` is null for every source at once.
create or replace function check_events_by_outcome(days int default 30, src text default null)
returns table (outcome text, source text, checks bigint, median_cut_pct numeric)
language sql
stable
as $$
  select
    e.outcome,
    e.source,
    count(*)::bigint as checks,
    -- The median rather than the mean: a single parcel capped 400% below market
    -- would drag an average until the whole column read as hopeless.
    percentile_cont(0.5) within group (order by e.required_cut_pct)::numeric as median_cut_pct
  from check_events e
  where e.checked_on >= (current_date - make_interval(days => days))
    and (src is null or e.source = src)
  group by e.outcome, e.source
  order by count(*) desc;
$$;

-- Where the refusals are. If they concentrate in particular counties, that is an
-- ad geo-targeting decision, not a product one.
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
  where e.checked_on >= (current_date - make_interval(days => days))
  group by 1
  order by 2 desc
  limit 50;
$$;

-- Retention. Same reasoning as site_visits: these rows have no per-person value
-- and none of them name a person, but keeping aggregates forever should be a
-- decision rather than an omission.
-- delete from check_events where checked_on < current_date - interval '400 days';


-- ============================================================================
-- TELL PostgREST THE SHAPE CHANGED. THIS LINE IS NOT OPTIONAL.
-- ============================================================================
-- Supabase serves the REST API and every rpc() call through PostgREST, which
-- caches the schema. Without this, a table and three functions that plainly
-- exist stay invisible to the API: lib/recordCheck.js POSTs to
-- /rest/v1/check_events and gets a 400, and /api/check-roster's rpc() calls fail
-- with "Could not find the function in the schema cache."
--
-- That failure mode is why this line is here rather than assumed. It cost a live
-- order on 5 Aug 2026 against waitlist.blocked_reason -- a column that had been
-- created correctly, in a table that existed, reported by the API as missing.
--
-- Worse here than there: recordCheck swallows every error by design, so the
-- symptom would be an empty Funnel tab and nothing else -- indistinguishable
-- from nobody having checked their address, which is a conclusion somebody could
-- act on by changing the ad campaign.
notify pgrst, 'reload schema';


-- ============================================================================
-- VERIFY. scripts/run-sql.mjs prints whatever the file selects at the end.
-- ============================================================================
-- Migrations here end with a verification select on purpose: "applied in 0.4s"
-- proves the transaction committed, not that the thing you wanted exists. Expect
-- exactly three rows, all reading ok:
--
--   check_events table   | ok - N columns
--   aggregate functions  | ok - 3 of 3
--   row level security   | ok - enabled
--
-- A row reading MISSING is the migration having run against a database that is
-- not the one the site talks to, which is the mistake that looks most like
-- success.
select
  1 as ord,
  'check_events table' as thing,
  case when count(*) > 0 then 'ok — ' || count(*) || ' columns' else 'MISSING' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'check_events'
union all
select
  2,
  'aggregate functions',
  case when count(*) = 3 then 'ok — 3 of 3'
       else 'MISSING — found ' || count(*) || ' of 3' end
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('check_events_daily', 'check_events_by_outcome', 'check_events_by_county')
union all
-- Asserted rather than assumed. `alter table ... enable row level security` is
-- silently a no-op against a table that already exists with RLS off, so the
-- create-and-alter pair above proves nothing on a re-run without this row.
select
  3,
  'row level security',
  case when bool_or(c.relrowsecurity) then 'ok — enabled'
       else 'MISSING — check_events is readable with the public anon key' end
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname = 'check_events'
order by ord;
