# BLP Resource Library

A free, open library of piano technology resources for technicians worldwide —
Fusion 360 models of obsolete parts, shop-built jigs and fixtures, and training
video from the Brigham Larson Pianos restoration shop.

> "No piano technician should ever have to solve the same specialized problem twice."

**Design:** "Blueprint & Bench" — drafting-grid engineering aesthetic coordinated
with the BrighamLarsonPianos.com brand (BLP red `#9E2020`, ink `#1D2226`).

## Structure

Static site — no build step, no dependencies.

- `index.html` — page shell (header, hero title block, mission, footer)
- `data.js` — the catalog (`RESOURCES`), video topics (`TOPICS`), and the
  contributor registry (`CONTRIBUTORS`)
- `app.js` — tab/topic filtering, search, card rendering, contributor bylines
- `contributor.html` + `contributor.js` — technician profile pages
  (`contributor.html?id=brigham-larson`): photo, bio, credential, links, and
  everything they've shared
- `styles.css` — Blueprint & Bench design system

## Adding a resource

Append an object to `RESOURCES` in `data.js`:

```js
{ id: "BLP-114", cat: "parts", title: "Part Name",
  maker: "Maker", desc: "One-sentence description.",
  formats: ["F3D"], fusion: "https://a360.co/XXXXXXX", by: "brigham-larson" }
```

For videos use `youtube: "VIDEO_ID", dur: "12:34", sub: "<topic key>"` instead
of `fusion`/`formats`. The 100 current training videos were scraped from the
[BLP YouTube channel](https://www.youtube.com/@brighamspianoservice) training
playlists and categorized into the topics defined in `TOPICS`.

ID ranges: parts `1xx` · jigs & fixtures `2xx` · player piano `3xx` ·
cabinet `4xx` · training videos `V001+`.

## Adding a contributor

Add an entry to `CONTRIBUTORS` in `data.js` (name, credential, location, photo
URL, bio, website/social links), then set that key as the `by` field on their
resources. Every card shows a "shared by" byline linking to their profile page.

## Run locally

```
python3 -m http.server 9284 --directory .
```

Founded by [Brigham Larson Pianos](https://www.brighamlarsonpianos.com) · Utah, USA
