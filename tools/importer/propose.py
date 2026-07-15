#!/usr/bin/env python3
"""First-cut curation: score every manifest item INCLUDE / EXCLUDE / REVIEW.
Output: import-output/proposed-import.txt for human review."""
import json, re, os
from collections import defaultdict

m = json.load(open("manifest.json"))

EXCLUDE_RULES = [
    (r"\btest\b|^test", "test file"),
    (r"garden|staircase|home projects", "personal / non-piano"),
    (r"fastener", "generic hardware"),
    (r"toolpath|heating cycle|support fill|initial trim|probe.calibrate|virtual tool rest", "CNC process file, not a part"),
    (r"cnc table|techno cnc|hds router|din rail|3d scanner|dowel cart|locline|mloc|clamping pipe|vise handle|angle iron|matt bracket|castellation", "shop infrastructure, not piano-specific"),
    (r"drawing", "2D drawing of a design already included"),
    (r"ripple|the whites|plastic bottom", "unclear/WIP"),
]
INCLUDE_HINTS = [
    (r"flange|damper|whippen|butt|shank|comb|sticker|trapwork|hammer", "action part"),
    (r"bridge|termination|pinblock|soundboard", "belly part"),
    (r"key ?top|keytop|key set|key measuring|key clamping|key fixture|key jig", "keys/keytop tooling"),
    (r"jig|fixture|clamp|support|fence|v-block|block", "shop jig/fixture"),
    (r"player|pneumatic|elbow|spool", "player piano"),
    (r"music desk|desk|lid|column|molding|moulding|cabinet|caster", "cabinet"),
    (r"stringer|string", "stringing"),
]

def is_drawing(it):
    return "Drawing" in (it.get("fileType") or "")

def score(it):
    hay = (it["folderPath"] + " " + it["name"]).lower()
    if is_drawing(it):
        return "EXCLUDE", "2D drawing (3D design imported separately)"
    for pat, why in EXCLUDE_RULES:
        if re.search(pat, hay):
            return "EXCLUDE", why
    for pat, why in INCLUDE_HINTS:
        if re.search(pat, hay):
            return "INCLUDE", why
    return "REVIEW", "no clear signal — needs a human eye"

# Collapse version iterations: same base name with vN suffix -> keep highest
def base_name(name):
    return re.sub(r"\s*v\d+$", "", name.strip(), flags=re.I).lower()

groups = defaultdict(list)
for it in m:
    groups[base_name(it["name"])].append(it)

results = {"INCLUDE": [], "EXCLUDE": [], "REVIEW": []}
for base, items in groups.items():
    def ver(it):
        g = re.search(r"v(\d+)$", it["name"].strip(), re.I)
        return int(g.group(1)) if g else 0
    items.sort(key=ver, reverse=True)
    keeper, dupes = items[0], items[1:]
    verdict, why = score(keeper)
    results[verdict].append((keeper, why))
    for d in dupes:
        results["EXCLUDE"].append((d, f"older iteration of “{keeper['name']}”"))

os.makedirs("import-output", exist_ok=True)
with open("import-output/proposed-import.txt", "w") as f:
    f.write("PROPOSED IMPORT — first cut, please review\n")
    f.write("Cross off anything in INCLUDE that shouldn't be public; rescue anything from EXCLUDE/REVIEW that should.\n\n")
    for verdict in ("INCLUDE", "REVIEW", "EXCLUDE"):
        items = sorted(results[verdict], key=lambda x: (x[0]["folderPath"], x[0]["name"]))
        f.write(f"======== {verdict} ({len(items)}) ========\n")
        last_folder = None
        for it, why in items:
            folder = it["folderPath"].split("/", 1)[-1]
            if folder != last_folder:
                f.write(f"\n  [{folder}]\n")
                last_folder = folder
            thumb = "🖼" if it.get("thumb") else "  "
            f.write(f"    {thumb} {it['name']}  — {why}\n")
        f.write("\n")

print({k: len(v) for k, v in results.items()})
