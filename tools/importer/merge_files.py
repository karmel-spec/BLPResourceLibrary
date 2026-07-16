#!/usr/bin/env python3
"""Patch data.js entries with hosted file URLs from manifest.json.
Matches manifest items to entries via their thumb slug. Idempotent."""
import json, re, os

DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(DIR, "..", ".."))

manifest = json.load(open(f"{DIR}/manifest.json"))
by_thumb = {it["thumb"]: it for it in manifest if it.get("thumb") and it.get("files")}

data = open(f"{ROOT}/data.js").read()
entry_re = re.compile(r'(\{ id: "(BLP-\d{4})",.*?thumb: "(thumbs/[^"]+)",.*?\})', re.S)

patched, skipped = 0, 0
def patch(m):
    global patched, skipped
    block, rid, thumb = m.group(1), m.group(2), m.group(3)
    it = by_thumb.get(thumb)
    if not it or "files:" in block:
        skipped += 1
        return block
    files = {k: v for k, v in it["files"].items() if v}
    if not files:
        skipped += 1
        return block
    formats = json.dumps([k.upper() for k in ("step", "stl", "f3d", "3mf") if k in files])
    block = re.sub(r'formats: \[[^\]]*\]', f'formats: {formats}', block)
    block = block.replace(' thumb: "', f' files: {json.dumps(files)}, thumb: "')
    patched += 1
    return block

data = entry_re.sub(patch, data)
open(f"{ROOT}/data.js", "w").write(data)
print(f"patched: {patched}, unchanged: {skipped}")
