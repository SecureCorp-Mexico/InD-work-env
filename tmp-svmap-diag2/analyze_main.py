#!/usr/bin/env python3
import re
from pathlib import Path

js = Path("main-live.js").read_text()
print("size", len(js))
for pat in [
    "ensureMapLayers",
    "cartocdn",
    "openfreemap",
    "EMPTY_STYLE",
    "e8eef5",
    "style.load",
    "setStyle",
    "addSource",
    "fitBounds",
]:
    print(f"{pat}: {js.count(pat)}")

m = re.search(r"new \w+\.Map\(\{.{0,700}\}", js, re.S)
print("MAP_CTOR:", (m.group(0)[:700] if m else "NONE"))

for label, pat in [
    ("OFM", r"openfreemap.{0,100}"),
    ("CARTO", r"cartocdn.{0,100}"),
    ("BG", r"background-color.{0,40}"),
    ("GLYPHS", r"glyphs.{0,120}"),
]:
    m = re.search(pat, js)
    print(f"{label}:", m.group(0) if m else None)

# style.load listener
for m in re.finditer(r".{40}style\.load.{40}", js):
    print("STYLE_LOAD_CTX:", m.group(0))
    break

# ensureMapLayers nearby
idx = js.find("ensureMapLayers")
if idx >= 0:
    print("ENSURE_SNIP:", js[idx : idx + 200])
else:
    print("NO ensureMapLayers string — minified name?")
    # look for style.load pattern with handler
    for m in re.finditer(r'\.on\("style\.load"', js):
        print("on style.load at", m.start(), js[m.start() : m.start() + 80])
