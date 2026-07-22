-- ============================================================================
-- Piano Technology Library — community backend schema (contributors + uploads)
-- Run in the Supabase SQL editor. Idempotent-ish: guarded with if-not-exists
-- where Postgres allows it.
-- ============================================================================

-- Contributor profiles: one row per signed-in user
create table if not exists contributors (
  id          uuid primary key default auth.uid(),
  slug        text unique not null,
  name        text not null,
  credential  text,
  location    text,
  bio         text,
  photo_url   text,
  website     text,
  links       jsonb default '[]',
  created_at  timestamptz default now()
);
alter table contributors enable row level security;
drop policy if exists "read contributors" on contributors;
create policy "read contributors" on contributors for select using (true);
drop policy if exists "insert own profile" on contributors;
create policy "insert own profile" on contributors for insert with check (auth.uid() = id);
drop policy if exists "update own profile" on contributors;
create policy "update own profile" on contributors for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Community submissions (files, videos, research)
create table if not exists submissions (
  id             bigint generated always as identity primary key,
  contributor_id uuid not null references contributors(id),
  title          text not null,
  category       text not null default 'parts',
  maker          text,
  description    text,
  files          jsonb default '{}',
  thumb_url      text,
  youtube        text,
  status         text not null default 'pending',
  created_at     timestamptz default now(),
  reviewed_at    timestamptz
);
alter table submissions enable row level security;
drop policy if exists "read approved or own or admin" on submissions;
create policy "read approved or own or admin" on submissions for select
  using (status = 'approved'
         or contributor_id = auth.uid()
         or auth.jwt() ->> 'email' in ('brigham@brighamlarsonpianos.com','karmel.larson@gmail.com'));
drop policy if exists "insert own" on submissions;
create policy "insert own" on submissions for insert
  with check (contributor_id = auth.uid());
drop policy if exists "update own pending" on submissions;
create policy "update own pending" on submissions for update
  using (contributor_id = auth.uid() and status = 'pending');
drop policy if exists "admin updates" on submissions;
create policy "admin updates" on submissions for update
  using (auth.jwt() ->> 'email' in ('brigham@brighamlarsonpianos.com','karmel.larson@gmail.com'));
drop policy if exists "delete own or admin" on submissions;
create policy "delete own or admin" on submissions for delete
  using (contributor_id = auth.uid()
         or auth.jwt() ->> 'email' in ('brigham@brighamlarsonpianos.com','karmel.larson@gmail.com'));

-- Public storage bucket for community uploads; users write only to their own folder
insert into storage.buckets (id, name, public) values ('contributions','contributions', true)
  on conflict (id) do nothing;
drop policy if exists "upload to own folder" on storage.objects;
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'contributions' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "update own objects" on storage.objects;
create policy "update own objects" on storage.objects for update to authenticated
  using (bucket_id = 'contributions' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read contributions" on storage.objects;
create policy "read contributions" on storage.objects for select
  using (bucket_id = 'contributions');
