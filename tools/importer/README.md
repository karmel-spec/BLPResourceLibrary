# Fusion importer

Bulk-imports Brigham's Autodesk Fusion account into the library.
Zero dependencies (Node 18+). See **[../../APS_IMPORT.md](../../APS_IMPORT.md)**
for the full setup and the two steps that need Brigham's login.

```bash
cp .env.example .env         # paste your APS Client ID
node import.mjs login        # one-time Autodesk sign-in (browser)
node import.mjs all          # inventory + thumbnails + generate data.js entries
```

Outputs (all gitignored):
- `manifest.json` — full inventory
- `../../thumbs/*.jpg` — downloaded model thumbnails
- `import-output/data-additions.js` — ready-to-paste catalog entries
- `import-output/review.txt` — category guesses + items to verify

Edit `category-map.json` to change how folder/file names map to categories.
