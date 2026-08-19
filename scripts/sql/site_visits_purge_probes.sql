-- site_visits: delete scanner probes already recorded
--
-- Run with:  node scripts/run-sql.mjs scripts/sql/site_visits_purge_probes.sql
-- NOT the Supabase web editor — see the standing rule in START_HERE.md. The whole
-- file goes as one query, so a failure rolls back rather than half-applying.
--
-- WHY
-- middleware.js filtered bots by user agent only. Vulnerability scanners send an
-- ordinary Chrome UA on purpose, so they walked straight through it. In the first
-- 30 days of data they were the third most common landing page on the site:
--
--   /wp-admin/install.php          14 visitors
--   /.well-known/traffic-advice     5
--   /&                              4
--   /.env                           2
--
-- That is 25 of roughly 105 recorded visitors — about a quarter of the number —
-- and it ranked above /florida. The write-side fix is PROBE_PATH in middleware.js
-- and it only affects rows recorded from now on. This removes the ones already in
-- the table so the 30-day view reads true.
--
-- The patterns below are the SQL twin of PROBE_PATH. If you widen one, widen both,
-- or /admin and the middleware will disagree about what a visitor is.

begin;

-- Look before you delete. Run the file and read this first result set: it is the
-- exact set of rows the delete below will remove, grouped so you can eyeball it.
select first_path, count(*) as rows_to_delete
from site_visits
where first_path ~* '^/\.'                                   -- /.env, /.git/*, /.well-known/*
   or first_path ~* '^/wp-|/wp-admin|/wp-includes|/wp-content|/xmlrpc\.php'
   or first_path ~* '^/(vendor|phpmyadmin|pma|administrator|cgi-bin|phpinfo|adminer)'
   or first_path ~* '\.(php|asp|aspx|jsp|cgi|pl|sql|bak|old|swp|ini|yml|yaml|env|log)$'
   or first_path ~* '^/&'
group by first_path
order by rows_to_delete desc;

delete from site_visits
where first_path ~* '^/\.'
   or first_path ~* '^/wp-|/wp-admin|/wp-includes|/wp-content|/xmlrpc\.php'
   or first_path ~* '^/(vendor|phpmyadmin|pma|administrator|cgi-bin|phpinfo|adminer)'
   or first_path ~* '\.(php|asp|aspx|jsp|cgi|pl|sql|bak|old|swp|ini|yml|yaml|env|log)$'
   or first_path ~* '^/&';

commit;

-- Verify. Expect zero rows.
select first_path, count(*)
from site_visits
where first_path ~* '^/\.' or first_path ~* '/wp-' or first_path ~* '^/&'
group by first_path;

-- And the honest total afterwards, by day.
select visit_date, count(*) as visitors
from site_visits
group by visit_date
order by visit_date desc
limit 30;
