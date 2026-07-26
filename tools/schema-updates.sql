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

-- Beta feedback (admins only): bug reports, ideas, suggestions from the Beta
-- Feedback button. Anyone can WRITE; only admins READ and UPDATE (mark done).
create table if not exists beta_feedback (
  id bigint generated always as identity primary key,
  category text not null,
  message text not null,
  actor_email text,
  actor_name text,
  page text,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz default now()
);
alter table beta_feedback enable row level security;

drop policy if exists "anyone can send feedback" on beta_feedback;
create policy "anyone can send feedback" on beta_feedback
  for insert to anon, authenticated with check (true);

drop policy if exists "admins read feedback" on beta_feedback;
create policy "admins read feedback" on beta_feedback
  for select using (auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

drop policy if exists "admins update feedback" on beta_feedback;
create policy "admins update feedback" on beta_feedback
  for update using (auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

create index if not exists beta_feedback_status_idx on beta_feedback (status, created_at desc);

-- Monetization (honor system): payment links on profiles + per-item pricing.
-- Payments are peer-to-peer (Venmo/Zelle/etc.) directly between users; the
-- library never processes money. Downloads stay open — pricing is a suggestion.
alter table contributors add column if not exists payment_links jsonb not null default '[]'::jsonb;
alter table contributors add column if not exists pricing_mode text not null default 'free';
alter table submissions add column if not exists pricing text not null default 'free' check (pricing in ('free','paid'));
alter table submissions add column if not exists price numeric;

-- Monetization v2: extra pricing modes, per-item license, contributor print
-- opt-in flags + acknowledgment, and a print_requests table.
alter table submissions drop constraint if exists submissions_pricing_check;
alter table submissions add constraint submissions_pricing_check check (pricing in ('free','tip','pwyw','paid'));
alter table submissions add column if not exists license text;
alter table submissions add column if not exists ack_honor boolean not null default false;

alter table contributors add column if not exists offers_print boolean not null default false;
alter table contributors add column if not exists allow_community_print boolean not null default false;
alter table contributors add column if not exists print_notes text;
alter table contributors add column if not exists ack_print_network boolean not null default false;

create table if not exists print_requests (
  id bigint generated always as identity primary key,
  item_ref text, item_title text, contributor_slug text,
  fulfiller text,                 -- 'maker' | 'blp'
  requester_name text, requester_email text, shipping_address text,
  material text, quantity int default 1, shipping_speed text, notes text,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz default now()
);
alter table print_requests enable row level security;
drop policy if exists "anyone can request print" on print_requests;
create policy "anyone can request print" on print_requests
  for insert to anon, authenticated with check (true);
drop policy if exists "admins read prints" on print_requests;
create policy "admins read prints" on print_requests
  for select using (auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));
drop policy if exists "admins update prints" on print_requests;
create policy "admins update prints" on print_requests
  for update using (auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));
create index if not exists print_requests_status_idx on print_requests (status, created_at desc);

-- Monetization v3: print partner network, per-item print price, ratings,
-- and the part-request pledge board.
alter table contributors add column if not exists print_partner boolean not null default false;
alter table contributors add column if not exists print_equipment jsonb not null default '[]'::jsonb;
alter table contributors add column if not exists print_region text;
alter table contributors add column if not exists print_from numeric;
alter table submissions add column if not exists print_price numeric;

-- Ratings: one 1-5 star rating per signed-in user per item; public read.
create table if not exists ratings (
  item_ref text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz default now(),
  primary key (item_ref, user_id)
);
alter table ratings enable row level security;
drop policy if exists "read ratings" on ratings;
create policy "read ratings" on ratings for select using (true);
drop policy if exists "rate own" on ratings;
create policy "rate own" on ratings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "update own rating" on ratings;
create policy "update own rating" on ratings for update to authenticated using (auth.uid() = user_id);

-- Part requests ("wanted" board) + honor-system pledges. Public board.
create table if not exists part_requests (
  id bigint generated always as identity primary key,
  title text not null,
  maker text,
  details text,
  requester_name text,
  requester_email text,
  status text not null default 'open' check (status in ('open','claimed','filled')),
  created_at timestamptz default now()
);
alter table part_requests enable row level security;
drop policy if exists "read requests" on part_requests;
create policy "read requests" on part_requests for select using (true);
drop policy if exists "post requests" on part_requests;
create policy "post requests" on part_requests for insert to anon, authenticated with check (true);
drop policy if exists "admins manage requests" on part_requests;
create policy "admins manage requests" on part_requests for update using (auth.jwt() ->> 'email' in
  ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

create table if not exists part_pledges (
  id bigint generated always as identity primary key,
  request_id bigint not null references part_requests(id) on delete cascade,
  amount numeric not null check (amount > 0),
  name text,
  email text,
  created_at timestamptz default now()
);
alter table part_pledges enable row level security;
drop policy if exists "read pledges" on part_pledges;
create policy "read pledges" on part_pledges for select using (true);
drop policy if exists "add pledges" on part_pledges;
create policy "add pledges" on part_pledges for insert to anon, authenticated with check (true);

-- Verified contributors: uploads restricted to librarian-approved piano
-- professionals. Existing contributors are grandfathered as approved.
alter table contributors add column if not exists status text not null default 'pending' check (status in ('pending','approved','declined'));
alter table contributors add column if not exists credentials_note text;
alter table contributors add column if not exists verified_at timestamptz;
alter table contributors add column if not exists memberships jsonb not null default '[]'::jsonb;
alter table contributors add column if not exists certifications jsonb not null default '[]'::jsonb;
alter table contributors add column if not exists years_experience int;
alter table contributors add column if not exists email text;
update contributors set status = 'approved', verified_at = now() where verified_at is null and created_at < '2026-07-26';

drop policy if exists "admins manage contributors" on contributors;
create policy "admins manage contributors" on contributors
  for update using (auth.jwt() ->> 'email' in
    ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

-- RESTRICTIVE gate: ANDed with existing insert policies, so even if another
-- policy would allow the insert, unapproved contributors cannot submit items.
drop policy if exists "approved contributors only" on submissions;
create policy "approved contributors only" on submissions
  as restrictive for insert to authenticated
  with check (exists (select 1 from contributors c where c.id = auth.uid() and c.status = 'approved'));

-- ============================================================================
-- July 26, 2026 (evening) — Tech Chat + AMA broadcast-hour vote
-- ============================================================================

-- Tech Chat: the back room. Readable and writable ONLY by approved
-- contributors and admins — everyone else gets RLS-refused, and the nav
-- link never even renders for them.
create table if not exists community_chat (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz default now()
);
alter table community_chat enable row level security;

drop policy if exists "verified read chat" on community_chat;
create policy "verified read chat" on community_chat
  for select to authenticated using (
    exists (select 1 from contributors c where c.id = auth.uid() and c.status = 'approved')
    or auth.jwt() ->> 'email' in
      ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

drop policy if exists "verified write chat" on community_chat;
create policy "verified write chat" on community_chat
  for insert to authenticated with check (
    user_id = auth.uid() and (
      exists (select 1 from contributors c where c.id = auth.uid() and c.status = 'approved')
      or auth.jwt() ->> 'email' in
        ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com')));

drop policy if exists "own or admin delete chat" on community_chat;
create policy "own or admin delete chat" on community_chat
  for delete to authenticated using (
    user_id = auth.uid() or auth.jwt() ->> 'email' in
      ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

create index if not exists community_chat_created_idx on community_chat (created_at);

-- AMA vote: one row per member (upsert on user_id). Emails are the reminder
-- list — visible to admins only; voters see just their own row. Public
-- tallies come from the ama_counts() function so emails never leak.
create table if not exists ama_votes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  choice text not null check (choice in ('wed-7am','wed-noon','wed-4pm')),
  created_at timestamptz default now()
);
alter table ama_votes enable row level security;

drop policy if exists "own vote insert" on ama_votes;
create policy "own vote insert" on ama_votes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own vote update" on ama_votes;
create policy "own vote update" on ama_votes
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "own or admin read votes" on ama_votes;
create policy "own or admin read votes" on ama_votes
  for select to authenticated using (
    user_id = auth.uid() or auth.jwt() ->> 'email' in
      ('brigham@brighamlarsonpianos.com','karmel@brighamlarsonpianos.com','brighamlarson@gmail.com','karmel.larson@gmail.com'));

create or replace function ama_counts()
returns table (choice text, votes bigint)
language sql security definer set search_path = public
as $$ select choice, count(*) from ama_votes group by choice $$;
grant execute on function ama_counts() to anon, authenticated;
