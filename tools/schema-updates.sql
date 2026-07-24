-- ============================================================================
-- Piano Technology Library — pending schema updates (July 22, 2026)
-- Run in: Supabase dashboard → SQL editor → project fjyydcsxauwogtgswfss
-- Enables: contributor version control, member mailing list, public signup.
-- Idempotent — safe to run more than once.
-- ============================================================================

-- Version control for submissions
alter table submissions add column if not exists version int not null default 1;
alter table submissions add column if not exists replaces bigint references submissions(id) on delete set null;
alter table submissions add column if not exists replace_action text check (replace_action in ('keep','archive','delete'));

-- Newsletter subscribers: signed-in members auto-enroll; anyone may subscribe
-- by email from the homepage band. Only admins can read the list.
create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  created_at timestamptz default now()
);
alter table newsletter_subscribers enable row level security;

drop policy if exists "anyone can subscribe" on newsletter_subscribers;
create policy "anyone can subscribe" on newsletter_subscribers
  for insert to anon, authenticated with check (true);

drop policy if exists "self or admin delete" on newsletter_subscribers;
create policy "self or admin delete" on newsletter_subscribers
  for delete using (auth.uid() = user_id or auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

drop policy if exists "admins read" on newsletter_subscribers;
create policy "admins read" on newsletter_subscribers
  for select using (auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

-- Activity log (admins only): logins, downloads, signups, profiles, submissions.
-- Anyone can WRITE (signed-out downloads/signups must be captured); only admins
-- can READ. No update/delete for non-admins — append-only audit trail.
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  type text not null,
  detail text,
  actor_email text,
  actor_name text,
  page text,
  created_at timestamptz default now()
);
alter table activity_log enable row level security;

drop policy if exists "anyone can log" on activity_log;
create policy "anyone can log" on activity_log
  for insert to anon, authenticated with check (true);

drop policy if exists "admins read log" on activity_log;
create policy "admins read log" on activity_log
  for select using (auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

create index if not exists activity_log_created_idx on activity_log (created_at desc);
create index if not exists activity_log_type_idx on activity_log (type);
