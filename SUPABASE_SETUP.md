# Enabling Google login + shared comments (Supabase)

The site works right now in **demo mode** — sign-in and comments function, but
only in each visitor's own browser (nothing is shared or saved to a server).
To turn on **real Google login** and **shared, persistent comments**, connect a
free Supabase project. ~15 minutes, no credit card.

## 1. Create the project
1. Go to <https://supabase.com> → sign in → **New project**.
2. Name it (e.g. `piano-technology-library`), pick a region, set a database password.
3. When it finishes, open **Project Settings → API** and copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon public** key (safe to expose publicly — it's protected by the rules below)

## 2. Paste the keys into `config.js`
```js
const CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...your-anon-key...",
  ADMIN_EMAIL: "brigham@brighamlarsonpianos.com",
};
```
That's the only code change. The site auto-switches from demo to live mode.

## 3. Create the tables + security rules
In Supabase → **SQL Editor** → paste and run:

```sql
-- Comments / feedback on each resource
create table comments (
  id           bigint generated always as identity primary key,
  resource_id  text not null,
  body         text not null,
  user_name    text,
  user_avatar  text,
  user_email   text,
  user_id      uuid default auth.uid(),
  created_at    timestamptz default now()
);
alter table comments enable row level security;

-- Anyone may read comments
create policy "read comments" on comments for select using (true);
-- Signed-in users may post as themselves
create policy "insert own" on comments for insert
  with check (auth.uid() = user_id);
-- Users may delete their own; the owner may delete any
create policy "delete own or admin" on comments for delete
  using (auth.uid() = user_id
         or auth.jwt() ->> 'email' = 'brigham@brighamlarsonpianos.com');

-- Site settings (e.g. whether the "trusted by" stat is public)
create table site_settings ( key text primary key, value text );
alter table site_settings enable row level security;
create policy "read settings" on site_settings for select using (true);
create policy "owner writes settings" on site_settings for all
  using (auth.jwt() ->> 'email' = 'brigham@brighamlarsonpianos.com')
  with check (auth.jwt() ->> 'email' = 'brigham@brighamlarsonpianos.com');
```
> If you change `ADMIN_EMAIL`, update the two email literals above to match.

## 4. Turn on Google sign-in
1. Supabase → **Authentication → Providers → Google** → enable.
2. It shows a **redirect URL** (`https://<project>.supabase.co/auth/v1/callback`). Copy it.
3. In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials** →
   **Create OAuth client ID** → *Web application*.
   - Authorized redirect URI: paste the Supabase callback URL from step 2.
   - Authorized JavaScript origins: `https://pianotechnologylibrary.com` (and `http://localhost:9284` for local testing).
4. Copy the **Client ID** and **Client secret** into the Supabase Google provider settings → save.
5. Supabase → **Authentication → URL Configuration** → set **Site URL** to
   `https://pianotechnologylibrary.com`.

## 5. Deploy
Commit the updated `config.js` and push — Netlify redeploys automatically.
Visitors can now sign in with Google, and comments are shared across everyone.

---

### How the admin ("trusted by") stat works
- The `Trusted by technicians in 14 countries · 1,204 downloads` line is hidden
  from the public by default.
- When **you** (the `ADMIN_EMAIL`) are signed in, you see it plus a toggle:
  **○ PRIVATE — make public** / **● PUBLIC — hide again**.
- Flipping it writes `stats_public` to `site_settings`, so once the numbers are
  worth showing you can reveal them to everyone with one click. Edit the numbers
  in `index.html` (`#trustStat`).
