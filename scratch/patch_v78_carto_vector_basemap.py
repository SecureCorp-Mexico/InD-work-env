#!/usr/bin/env python3
"""Patch SecureVu Map main.js: CARTO raster → Positron vector (fixes API KEY REQUIRED watermark)."""
from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/securevu-map-src')

MAIN = ROOT / 'app/src/main.js'
INDEX = ROOT / 'app/index.html'
SW = ROOT / 'app/public/sw.js'

BUILD = 'v78-carto-vector-basemap-20260901'

OLD_RASTER = re.compile(
    r"const CARTO_STYLE = \{[\s\S]*?\n\};",
    re.MULTILINE,
)
NEW_BLOCK = """// Basemap = CARTO Positron vector (no API key; legacy raster now watermarks).
// “3D” = OpenFreeMap planet vector fill-extrusion buildings on top. No setStyle
// swap — toggle only adds/removes the extrusion layer + pitch.
const OFM_PLANET_URL = 'https://tiles.openfreemap.org/planet';
const BASEMAP_STORE = 'securevu-map-basemap'; // 'carto' | 'ofm3d'
const CARTO_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';"""

OLD_SETUP = re.compile(
    r"// ─── Map Setup ──[\s\S]*?const BASEMAP_STORE = 'securevu-map-basemap'; // 'carto' \| 'ofm3d'\n\nconst CARTO_STYLE = \{[\s\S]*?\n\};",
    re.MULTILINE,
)
NEW_SETUP = """// ─── Map Setup ────────────────────────────────────────────────────────────────
""" + NEW_BLOCK.split("const OFM_PLANET_URL", 1)[0].rstrip() + """
const OFM_PLANET_URL = 'https://tiles.openfreemap.org/planet';
const BASEMAP_STORE = 'securevu-map-basemap'; // 'carto' | 'ofm3d'
const CARTO_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';"""


def patch_main(text: str) -> str:
    if 'positron-gl-style/style.json' in text:
        print('main.js already patched')
        return text
    if OLD_SETUP.search(text):
        text = OLD_SETUP.sub(NEW_SETUP, text, count=1)
    elif OLD_RASTER.search(text):
        text = OLD_RASTER.sub(
            "const CARTO_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';",
            text,
            count=1,
        )
    else:
        raise SystemExit('Could not locate CARTO_STYLE block in main.js')
    text = text.replace(
        "'text-font': ['Noto Sans Bold']",
        "'text-font': ['Montserrat Medium', 'Open Sans Bold', 'Noto Sans Regular']",
    )
    return text


def patch_meta(path: Path, attr: str, value: str) -> None:
    text = path.read_text()
    text2, n = re.subn(
        rf'(<meta name="{attr}" content=")[^"]*(")',
        rf'\g<1>{value}\2',
        text,
        count=1,
    )
    if n:
        path.write_text(text2)
        print(f'updated {path.name} {attr}={value}')
    else:
        print(f'warn: no {attr} in {path}')


def patch_sw(text: str) -> str:
    if BUILD in text:
        print('sw.js already patched')
        return text
    text = re.sub(
        r"const CACHE = 'svmap-shell-[^']+';",
        f"const CACHE = 'svmap-shell-{BUILD}';",
        text,
        count=1,
    )
    text = re.sub(
        r"/\* SecureVu Map PWA — [^*]+ \*/",
        f"/* SecureVu Map PWA — v78: CARTO vector Positron basemap (no API-key watermark). */",
        text,
        count=1,
    )
    return text


def main() -> None:
    main_text = MAIN.read_text()
    MAIN.write_text(patch_main(main_text))
    print(f'patched {MAIN}')
    patch_meta(INDEX, 'svmap-build', BUILD)
    sw_text = SW.read_text()
    SW.write_text(patch_sw(sw_text))
    print(f'patched {SW}')


if __name__ == '__main__':
    main()
