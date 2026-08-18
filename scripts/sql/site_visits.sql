-- Unique daily visitors to the public site.
--
-- ONE ROW PER VISITOR PER DAY. Not one row per pageview.
--
-- The unique index is the actual deduplication mechanism, not an optimisation.
-- The middleware writes on every matched request and relies on the database to
-- reject the second and later writes for the same visitor-day. Removing this
-- index does not produce an error anywhere -- it produces a visitor count that
-- silently equals the pageview count, which reads as a traffic spike.
--
-- WHAT visitor_hash IS
--   sha256(visit_date | ip | user_agent | VISITOR_HASH_SECRET)
--
-- The date is inside the hash on purpose. It means the same person produces a
-- different hash tomorrow, so these rows cannot be joined across days to build a
-- history of one person's visits. That is what keeps this an aggregate counter
-- rather than a tracking system, and it is why /privacy can keep saying we set no
-- tracking cookie. Do not "optimise" the date out of the hash input.
--
-- No IP address and no user agent is ever stored. Only the digest.

create table if not exists site_visits (
  id             bigserial primary key,
  visit_date     date        not null,
  visitor_hash   text        not null,
  first_path     text,
  referrer_host  text,
  country        text,
  device         text,
  created_at     timestamptz not null default now()
);

-- The dedup. See above -- this is load-bearing.
create unique index if not exists site_visits_day_visitor
  on site_visits (visit_date, visitor_hash);

create index if not exists site_visits_date_idx
  on site_visits (visit_date desc);


-- The headline number is computed in SQL, deliberately.
--
-- /api/waitlist-roster reads rows and counts them in JavaScript, bounded at 5,000
-- with a ceiling check, because that endpoint also needs the row bodies. This one
-- does not: it needs a count per day. Counting rows in JS would mean the daily
-- chart quietly understates itself the first day traffic exceeds the cap, which is
-- exactly the settle-referrals defect in a new place. An aggregate cannot truncate.
create or replace function site_visits_daily(days int default 90)
returns table (visit_date date, visitors bigint)
language sql
stable
as $$
  select v.visit_date, count(*)::bigint as visitors
  from site_visits v
  where v.visit_date >= (current_date - make_interval(days => days))
  group by v.visit_date
  order by v.visit_date desc;
$$;

-- Same reasoning for the breakdowns: aggregate in SQL, return tens of rows.
create or replace function site_visits_by_referrer(days int default 30)
returns table (referrer_host text, visitors bigint)
language sql
stable
as $$
  select coalesce(v.referrer_host, 'direct') as referrer_host, count(*)::bigint as visitors
  from site_visits v
  where v.visit_date >= (current_date - make_interval(days => days))
  group by 1
  order by 2 desc
  limit 50;
$$;

create or replace function site_visits_by_path(days int default 30)
returns table (first_path text, visitors bigint)
language sql
stable
as $$
  select coalesce(v.first_path, '/') as first_path, count(*)::bigint as visitors
  from site_visits v
  where v.visit_date >= (current_date - make_interval(days => days))
  group by 1
  order by 2 desc
  limit 50;
$$;

-- Retention. These rows have no per-person value after the season and keeping
-- them forever turns an aggregate counter into a dataset. Run it or schedule it;
-- either way the decision should be explicit rather than "we never deleted any".
-- delete from site_visits where visit_date < current_date - interval '400 days';
