#!/usr/bin/env node
// Copy every hosted model file from the OLD Supabase project's public bucket
// to the NEW project, then rewrite data.js URLs. Idempotent (upserts).
// Usage: node tools/migrate-storage.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD = "https://tlkbvniiaqwxmgewhxvx.supabase.co";

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "tools/importer/.env"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim()]));

const NEW = env.SUPABASE_URL.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_KEY;
if (NEW.includes("tlkbvniiaqwxmgewhxvx")) {
  console.error("✗ tools/importer/.env still points at the OLD project — update SUPABASE_URL + SUPABASE_SERVICE_KEY first.");
  process.exit(1);
}

const dataJs = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
const urls = [...new Set([...dataJs.matchAll(new RegExp(OLD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/storage/v1/object/public/([^\"\\s]+)", "g"))].map((m) => m[1]))];
console.log(`Found ${urls.length} hosted files to copy.`);

let ok = 0, failed = 0, skipped = 0;
for (const objectPath of urls) {
  try {
    // Already copied on a previous run? (compare sizes via HEAD on both sides)
    const [have, want] = await Promise.all([
      fetch(`${NEW}/storage/v1/object/public/${objectPath}`, { method: "HEAD" }),
      fetch(`${OLD}/storage/v1/object/public/${objectPath}`, { method: "HEAD" }),
    ]);
    if (have.ok && want.ok &&
        have.headers.get("content-length") === want.headers.get("content-length")) {
      ok++; skipped++;
      if (ok % 25 === 0) console.log(`  …${ok}/${urls.length}`);
      continue;
    }
    const src = await fetch(`${OLD}/storage/v1/object/public/${objectPath}`);
    if (!src.ok) throw new Error(`download ${src.status}`);
    const buf = Buffer.from(await src.arrayBuffer());
    const up = await fetch(`${NEW}/storage/v1/object/${objectPath}`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/octet-stream", "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 100)}`);
    ok++;
    if (ok % 25 === 0) console.log(`  …${ok}/${urls.length}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${objectPath} — ${e.message}`);
  }
}
console.log(`\nCopied ${ok}/${urls.length} (${skipped} already there, ${failed} failed).`);

if (failed === 0 && ok > 0) {
  const updated = dataJs.split(OLD).join(NEW);
  fs.writeFileSync(path.join(ROOT, "data.js"), updated);
  console.log("✓ data.js URLs rewritten to the new project.");
} else if (failed > 0) {
  console.log("⚠ NOT rewriting data.js until all files copy cleanly. Re-run to retry failures.");
}
