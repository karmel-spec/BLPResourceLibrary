# Importing Fusion files in bulk (Autodesk Platform Services)

This connects Brigham's Autodesk/Fusion account to an importer that inventories
every model, downloads a thumbnail for each, and generates ready-to-paste
`data.js` entries — so adding hundreds of files doesn't mean hundreds of manual
share-links.

The tool lives in `tools/importer/`. It has **zero dependencies** (just Node 18+)
and uses PKCE OAuth, so **no client secret is ever stored**.

---

## What needs Brigham (the two login moments)

Everything else is automated. Only these two steps require his Autodesk login,
and he does them himself — the tool never sees his password:

1. **Create the free APS app** (once) — needs his Autodesk sign-in.
2. **Authorize the importer** (`node import.mjs login`) — a browser opens to
   Autodesk's real sign-in page; he approves; the tool catches the token.

---

## Step 1 — Create the APS app  ⟵ Brigham logs in here

1. Go to <https://aps.autodesk.com> → **Sign in** (his normal Autodesk/Fusion account).
2. Top-right menu → **Applications** → **Create application**.
3. Choose app type **Desktop, Mobile, Single-Page App** (this is the PKCE type — no secret).
4. Fill in:
   - **Name:** `Piano Technology Library Importer`
   - **Callback URL:** `http://localhost:8080/api/auth/callback`  ← must be exact
5. Under **APIs**, enable: **Data Management API** and **Model Derivative API**.
6. Create it, then copy the **Client ID**.

> If the only app types offered require a secret, that's fine too — pick
> "Traditional Web App", set the same callback, and paste the secret into `.env`
> as `APS_CLIENT_SECRET=…`. The importer uses it automatically if present.

## Step 2 — Configure the tool

```bash
cd tools/importer
cp .env.example .env
# open .env and paste the Client ID after APS_CLIENT_ID=
```

## Step 3 — Sign in  ⟵ Brigham logs in here

```bash
node import.mjs login
```
The browser opens to Autodesk. Brigham signs in and clicks **Allow**. The tab
says "Signed in — you can close this." A token is saved locally (expires in ~1h;
just re-run `login` if it lapses). **Nothing but the token touches this machine.**

## Step 4 — Run the import

```bash
node import.mjs all
```
That does three things:
- **`list`** — walks every hub → project → folder → file into `manifest.json`
  (names, folder paths, and the internal IDs needed for the next steps).
- **`thumbs`** — downloads a rendered model thumbnail for each file into
  `../../thumbs/`. Files that have never been opened in Fusion may not have a
  thumbnail yet — those get flagged; opening them in Fusion once generates one.
- **`gen`** — writes `import-output/data-additions.js` (ready-to-paste catalog
  entries) and `import-output/review.txt` (what it guessed and what to check).

You can also run the steps individually (`node import.mjs list`, etc.).

## Step 5 — Review & merge

1. Open `import-output/review.txt` — it lists each file, its guessed category,
   and flags anything uncertain (`please verify`) or missing a thumbnail.
2. Tune `tools/importer/category-map.json` if the folder→category guesses need
   adjusting, then re-run `node import.mjs gen`.
3. Paste the entries from `import-output/data-additions.js` into `data.js`, add a
   one-line `desc`, and commit. Done.

---

## About the download links

The APS API **cannot create `a360.co` share links** — Autodesk only mints those
from the Fusion UI (right-click a design → **Share**). So each generated entry
has a `fusion: "PASTE_a360_SHARE_LINK"` placeholder. Two ways to fill it:

- **Quick:** paste a share link per file (fine for a handful).
- **Better for bulk — host the files ourselves:** the importer already has the
  version IDs, so it can be extended to download each design's F3D + a translated
  STEP/STL and upload them to **Supabase Storage** (free 1 GB). Then cards get a
  real "Download STEP/STL" button served by the library, with no dependency on
  Autodesk keeping share links alive. Say the word and I'll add the `--files`
  step + wire the download buttons — it fits the "permanent record" goal better.

## Safety notes

- `.env`, `token.json`, `manifest.json`, and `import-output/` are gitignored —
  no credentials or tokens are ever committed.
- The tool only ever **reads** (`data:read` scope). It cannot modify or delete
  anything in Brigham's Fusion account.
