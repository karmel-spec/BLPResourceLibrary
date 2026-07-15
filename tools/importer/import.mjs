#!/usr/bin/env node
// ============================================================================
// Piano Technology Library — Autodesk (APS) Fusion importer
// ----------------------------------------------------------------------------
// Zero-dependency Node (18+) tool. Signs Brigham in to Autodesk once (3-legged
// OAuth with PKCE — no client secret stored), walks his entire Fusion account,
// and turns it into library data: an inventory manifest, downloaded model
// thumbnails, and ready-to-paste data.js entries.
//
//   node import.mjs login     # one-time browser sign-in (Brigham logs in here)
//   node import.mjs list      # inventory every hub/project/folder/file -> manifest.json
//   node import.mjs thumbs    # download a model thumbnail for each file -> ../../thumbs
//   node import.mjs gen       # generate data.js entries from manifest + category-map.json
//   node import.mjs all       # list + thumbs + gen
//
// See APS_IMPORT.md for the one-time setup (creating the APS app).
// ============================================================================

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..", ".."); // repo root (where thumbs/ + data.js live)
const BASE = "https://developer.api.autodesk.com";
const PORT = 8080;
const REDIRECT = `http://localhost:${PORT}/api/auth/callback`;
const SCOPE = "data:read";

const TOKEN_FILE = path.join(DIR, "token.json");
const MANIFEST_FILE = path.join(DIR, "manifest.json");
const OUT_DIR = path.join(DIR, "import-output");
const THUMBS_DIR = path.join(ROOT, "thumbs");

// ---- tiny .env loader ------------------------------------------------------
function loadEnv() {
  const f = path.join(DIR, ".env");
  const env = {};
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}
const ENV = loadEnv();
const CLIENT_ID = ENV.APS_CLIENT_ID;

function die(msg) { console.error("\n✗ " + msg + "\n"); process.exit(1); }
function log(...a) { console.log(...a); }
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ============================================================================
// OAuth (3-legged, PKCE) — Brigham signs in in his browser; we catch the code.
// ============================================================================
async function login() {
  if (!CLIENT_ID) die("APS_CLIENT_ID missing. Copy .env.example to .env and paste your app's Client ID (see APS_IMPORT.md).");

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(8));

  const authUrl = `${BASE}/authentication/v2/authorize?` + new URLSearchParams({
    response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT,
    scope: SCOPE, code_challenge: challenge, code_challenge_method: "S256", state,
  });

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      if (u.pathname !== "/api/auth/callback") { res.writeHead(404); res.end(); return; }
      const err = u.searchParams.get("error");
      const got = u.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><body style="font-family:system-ui;text-align:center;padding:60px;background:#14181b;color:#dfe4e8">
        <h2 style="color:${err ? "#ff9d9d" : "#7ee08a"}">${err ? "Sign-in failed: " + err : "✓ Signed in — you can close this tab."}</h2>
        <p>Return to your terminal.</p></body>`);
      server.close();
      if (err) reject(new Error(err)); else resolve(got);
    });
    server.listen(PORT, () => {
      log(`\nOpening your browser to sign in to Autodesk…`);
      log(`If it doesn't open, paste this URL:\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });

  const tokenRes = await fetch(`${BASE}/authentication/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, client_id: CLIENT_ID,
      code_verifier: verifier, redirect_uri: REDIRECT,
    }),
  });
  const tok = await tokenRes.json();
  if (!tok.access_token) die("Token exchange failed: " + JSON.stringify(tok));
  tok.obtained_at = Date.now();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tok, null, 2));
  log("✓ Signed in. Token saved. Now run:  node import.mjs all\n");
  return tok.access_token;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`, () => {});
}

function accessToken() {
  if (!fs.existsSync(TOKEN_FILE)) die("Not signed in. Run:  node import.mjs login");
  const tok = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  const ageMin = (Date.now() - tok.obtained_at) / 60000;
  if (ageMin > (tok.expires_in / 60) - 2) die("Token expired. Run:  node import.mjs login");
  return tok.access_token;
}

// ---- APS GET helper --------------------------------------------------------
async function api(url, token) {
  const r = await fetch(url.startsWith("http") ? url : BASE + url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${url}\n${await r.text()}`);
  return r.json();
}

// ============================================================================
// list — walk hubs -> projects -> folders -> items into manifest.json
// ============================================================================
async function list() {
  const token = accessToken();
  const out = [];
  const hubs = await api("/project/v1/hubs", token);
  log(`Found ${hubs.data.length} hub(s).`);
  for (const hub of hubs.data) {
    const projects = await api(`/project/v1/hubs/${hub.id}/projects`, token);
    log(`  Hub "${hub.attributes.name}" — ${projects.data.length} project(s)`);
    for (const proj of projects.data) {
      const top = await api(`/project/v1/hubs/${hub.id}/projects/${proj.id}/topFolders`, token);
      for (const folder of top.data) {
        await walkFolder(token, proj.id, folder, folder.attributes.name, out);
      }
    }
  }
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(out, null, 2));
  log(`\n✓ Inventory complete: ${out.length} file(s) -> manifest.json`);
  return out;
}

async function walkFolder(token, projectId, folder, folderPath, out) {
  let url = `/data/v1/projects/${projectId}/folders/${folder.id}/contents`;
  while (url) {
    const page = await api(url, token);
    const versions = Object.fromEntries((page.included || []).map((v) => [v.id, v]));
    for (const d of page.data) {
      if (d.type === "folders") {
        await walkFolder(token, projectId, d, `${folderPath}/${d.attributes.name}`, out);
      } else if (d.type === "items") {
        const tipId = d.relationships?.tip?.data?.id;
        const tip = versions[tipId] || {};
        const name = (d.attributes.displayName || tip.attributes?.displayName || "Untitled").replace(/\.f3d$/i, "");
        const ext = tip.attributes?.fileType || tip.attributes?.extension?.type || "";
        const derivativeUrn = tip.relationships?.derivatives?.data?.id || null;
        // Only CAD designs (skip drawings/exports we don't want as cards)
        out.push({
          name, folderPath, projectId,
          itemId: d.id, versionId: tipId, derivativeUrn,
          fileType: ext, webView: d.attributes?.extension?.data?.sourceFileName || null,
        });
      }
    }
    url = page.links?.next?.href || null;
  }
}

// ============================================================================
// thumbs — download a model thumbnail (Model Derivative API) per file
// ============================================================================
async function thumbs() {
  const token = accessToken();
  if (!fs.existsSync(MANIFEST_FILE)) die("Run `list` first.");
  const items = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  let n = 0, skipped = 0;
  for (const it of items) {
    if (!it.derivativeUrn) { skipped++; continue; }
    const urn = b64url(Buffer.from(it.derivativeUrn));
    it.slug = it.slug || slugify(it.name);
    const dest = path.join(THUMBS_DIR, `${it.slug}.jpg`);
    try {
      const r = await fetch(`${BASE}/modelderivative/v2/designdata/${urn}/thumbnail?width=400&height=400`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { skipped++; continue; }
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      it.thumb = `thumbs/${it.slug}.jpg`;
      n++;
      if (n % 10 === 0) log(`  …${n} thumbnails`);
    } catch (e) { skipped++; }
  }
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(items, null, 2));
  log(`\n✓ Downloaded ${n} thumbnail(s) to thumbs/  (${skipped} had none yet — open them in Fusion once to generate)`);
}

// ============================================================================
// gen — turn the manifest into ready-to-paste data.js entries
// ============================================================================
function gen() {
  if (!fs.existsSync(MANIFEST_FILE)) die("Run `list` first.");
  const items = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  const map = JSON.parse(fs.readFileSync(path.join(DIR, "category-map.json"), "utf8"));

  // Continue ID numbering from what's already in data.js.
  const dataJs = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
  const nextId = {};
  for (const cat of Object.keys(map.ranges)) {
    const base = map.ranges[cat];
    const used = [...dataJs.matchAll(/id:\s*"BLP-(\d+)"/g)]
      .map((m) => +m[1]).filter((n) => n >= base && n < base + 100);
    nextId[cat] = (used.length ? Math.max(...used) : base - 1) + 1;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const lines = [], review = [];
  for (const it of items) {
    const { cat, why } = guessCategory(it, map);
    const id = `BLP-${nextId[cat]++}`;
    const maker = guessMaker(it.name) || "Piano Rebuilding";
    lines.push(
`  { id: "${id}", cat: "${cat}", title: ${JSON.stringify(tidyTitle(it.name))},
    maker: ${JSON.stringify(maker)}, desc: "",
    formats: ["F3D"], fusion: "PASTE_a360_SHARE_LINK",${it.thumb ? ` thumb: ${JSON.stringify(it.thumb)},` : ""}
    by: "brigham-larson", dateAdded: "${today}" },`);
    review.push(`${id}  [${cat}]  ${it.name}   (folder: ${it.folderPath}) — ${why}${it.thumb ? "" : "  ⚠ NO THUMBNAIL"}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, "data-additions.js"), lines.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "review.txt"),
    `${items.length} files. Review categories, add descriptions, and paste a360 share links.\n\n` + review.join("\n") + "\n");
  log(`\n✓ Generated ${items.length} entries -> import-output/data-additions.js`);
  log(`  Review categories + add share links using import-output/review.txt`);
  log(`\nNOTE: the API cannot mint a360.co share links — paste those from Fusion,`);
  log(`  OR switch to self-hosted downloads (see APS_IMPORT.md "Hosting the files").`);
}

// ---- heuristics ------------------------------------------------------------
function guessCategory(it, map) {
  const hay = `${it.folderPath} ${it.name}`.toLowerCase();
  for (const rule of map.rules) {
    if (rule.match.some((kw) => hay.includes(kw))) return { cat: rule.cat, why: `matched "${rule.match.find((kw) => hay.includes(kw))}"` };
  }
  return { cat: map.default, why: "no keyword match — please verify" };
}
function guessMaker(name) {
  const makers = ["Steinway", "Knabe", "Chickering", "Emerson", "Wurlitzer", "Gulbransen",
    "Kimball", "Bush", "Yamaha", "Baldwin", "Mason", "Kawai", "Bechstein", "Kohler"];
  return makers.find((m) => name.toLowerCase().includes(m.toLowerCase()));
}
function tidyTitle(name) {
  return name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

// ============================================================================
const cmd = (process.argv[2] || "help").toLowerCase();
const run = {
  login,
  list,
  thumbs,
  gen: async () => gen(),
  all: async () => { await list(); await thumbs(); gen(); },
  help: async () => log(`
Piano Technology Library — Fusion importer

  node import.mjs login    one-time Autodesk sign-in (opens your browser)
  node import.mjs list     inventory the whole account -> manifest.json
  node import.mjs thumbs   download model thumbnails -> ../../thumbs
  node import.mjs gen      generate data.js entries -> import-output/
  node import.mjs all      list + thumbs + gen

First time? See APS_IMPORT.md.`),
};
(run[cmd] || run.help)().catch((e) => die(e.message));
