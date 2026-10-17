-- Private storage for uploaded decision letters (17 Oct 2026, pages/api/kit/outcome.js).
-- Private: nothing is public; the server uses the service key, and admin views a
-- letter through a 10-minute signed link (pages/api/admin-guarantees.js).
-- 3 MB per file, images and PDFs only (the route checks this too).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('decision-letters', 'decision-letters', false, 3145728, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
