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
- `data.js` — the catalog: every part, fixture, and video is one object in `RESOURCES`
- `app.js` — tab filtering, search, card rendering
- `styles.css` — Blueprint & Bench design system

## Adding a resource

Append an object to `RESOURCES` in `data.js`:

```js
{ id: "BLP-114", cat: "parts", title: "Part Name",
  maker: "Maker", desc: "One-sentence description.",
  formats: ["F3D"], fusion: "https://a360.co/XXXXXXX" }
```

For videos use `youtube: "VIDEO_ID"` instead of `fusion`/`formats`.

ID ranges: parts `1xx` · jigs & fixtures `2xx` · player piano `3xx` ·
cabinet `4xx` · training videos `5xx`.

## Run locally

```
python3 -m http.server 9284 --directory .
```

Founded by [Brigham Larson Pianos](https://www.brighamlarsonpianos.com) · Utah, USA
