#!/usr/bin/env python3
"""Merge Karmel's selected files into data.js as new catalog entries."""
import json, re, os, sys
from collections import defaultdict

DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(DIR, "..", ".."))

manifest = json.load(open(f"{DIR}/manifest.json"))
selected = [l.strip() for l in open(f"{DIR}/import-output/selected.txt") if l.strip()]

def norm(s): return re.sub(r"[^a-z0-9]+", "", s.lower())
def base(s): return norm(re.sub(r"\s*v\d+$", "", s.strip(), flags=re.I))

# Original Fusion names of the 21 files already in the library
EXISTING = [
 "BushLaneColumn75ScaleSolid","Initial key height setter","Grand Hammer Coving Jig",
 "Steinway small lid prop","Wurliter 983993 music desk","Ken in WA Music Desk",
 "Emerson Player Deck","Knabe 116388 little comb piece","Gulbransen 149314 player elbow",
 "Kimball brass damper flange","Chickering 80147 damper lever","Steinway over damper head",
 "Steinway damper head","Knabe Flange top section","Knabe Double Hammer Flange",
 "Emerson flange","Emerson High Treble Flange","K&B 37121 Double flange",
 "K&B 37121 Double Flange","K and B 37121 whippen flange",
]
existing_bases = {base(n) for n in EXISTING}

# ---- categorize ------------------------------------------------------------
def categorize(name, folder):
    hay = f"{folder} {name}".lower()
    if re.search(r"action geometry|brown action|full action|full stack|assembly \d|^stack|keybed|key ?frame|fallboard|e4 key|keystick|action cavity|demo$|1859", hay): return "research"
    if re.search(r"player|pneumatic|gulbransen|coinola|organ", hay): return "player"
    if re.search(r"music desk|\blid\b|column|scroll|\bleg\b|trim|bench|caster|ferrule|mirror|\brings?\b|front$|hoist|holster", hay): return "cabinet"
    if re.search(r"jig|fixture|setter|clamp|nozzle|spreader|v-block|support|fence|probe|standoff|iso30|stamp|ptg tag|boxes|routing|din rail|z setter|holder|measuring tool", hay): return "fixtures"
    return "parts"

MAKERS = ["Steinway","Knabe","Chickering","Emerson","Wurlitzer","Wurliter","Gulbransen","Kimball",
 "Bush","Yamaha","Baldwin","Mason & Hamlin","Mason and Hamlin","Kawai","Bechstein","Kohler","K&B",
 "K and B","Renner","Petrof","Mathushek","Schimmel","S&N","Prein","Taylor","Erard","Hallet","Kemble",
 "Bernareggi","Zwicki","Hino"]
def maker_of(name):
    for mk in MAKERS:
        if mk.lower() in name.lower():
            return {"Wurliter":"Wurlitzer","Mason and Hamlin":"Mason & Hamlin","K and B":"Kohler & Brambach","K&B":"Kohler & Brambach","S&N":"Schimmel & Nelson","Bush":"Bush & Lane"}.get(mk, mk)
    return "BLP Shop"

def tidy(name):
    t = re.sub(r"[_]+", " ", name).strip()
    t = re.sub(r"\s+", " ", t)
    return t[0].upper() + t[1:] if t else t

# ---- match selection to manifest, dedup ------------------------------------
by_name = defaultdict(list)
for it in manifest: by_name[it["name"]].append(it)

picked, seen_bases, skipped_existing, missing = [], set(), [], []
for name in selected:
    b = base(name)
    if b in existing_bases: skipped_existing.append(name); continue
    if b in seen_bases: continue
    cands = by_name.get(name) or [it for it in manifest if base(it["name"]) == b]
    if not cands: missing.append(name); continue
    cands.sort(key=lambda it: (bool(it.get("thumb")), it["name"]), reverse=True)
    picked.append(cands[0]); seen_bases.add(b)

# ---- assign ids ------------------------------------------------------------
data = open(f"{ROOT}/data.js").read()
BLOCKS = {"parts":1000,"fixtures":2000,"player":3000,"cabinet":4000,"research":5000}
counters = {}
for cat, blk in BLOCKS.items():
    used = [int(m) for m in re.findall(r'id: "BLP-(\d{4})"', data) if blk <= int(m) < blk+1000]
    counters[cat] = (max(used) if used else blk) + 1

entries, kept_slugs, catcount = [], set(), defaultdict(int)
for it in sorted(picked, key=lambda x: (categorize(x["name"], x["folderPath"]), x["name"])):
    cat = categorize(it["name"], it["folderPath"])
    rid = f"BLP-{counters[cat]}"; counters[cat] += 1
    catcount[cat] += 1
    thumb = f' thumb: "{it["thumb"]}",' if it.get("thumb") else ""
    if it.get("thumb"): kept_slugs.add(os.path.basename(it["thumb"]))
    entries.append(
f'''  {{ id: "{rid}", cat: "{cat}", title: {json.dumps(tidy(it["name"]))},
    maker: {json.dumps(maker_of(it["name"]))}, desc: "",
    formats: ["F3D"],{thumb}
    by: "brigham-larson", dateAdded: "2026-07-15" }},''')

block = ("\n  // ---- Imported from the BLP Fusion account (July 2026 bulk import) ----\n"
         + "\n".join(entries) + "\n")
marker = "  // ---- Training Videos (scraped from the BLP YouTube channel) ----"
assert marker in data
data = data.replace(marker, block + "\n" + marker)

# add research to CATEGORIES if missing
if '"research"' not in data.split("const CATEGORIES")[1].split("];")[0]:
    data = data.replace('{ key: "video",    label: "VIDEO" },',
        '{ key: "research", label: "RESEARCH" },\n  { key: "video",    label: "VIDEO" },')

open(f"{ROOT}/data.js","w").write(data)

print(f"selected lines: {len(selected)}")
print(f"skipped (already in library): {len(skipped_existing)}")
print(f"new entries: {len(entries)}  by category: {dict(catcount)}")
if missing: print("NOT FOUND in manifest:", missing)
json.dump(sorted(kept_slugs), open(f"{DIR}/import-output/kept-slugs.json","w"))
