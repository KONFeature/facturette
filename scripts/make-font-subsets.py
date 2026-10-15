#!/usr/bin/env python3
"""
Dev-time generator for the substitute fonts used to repair non-embedded fonts
(src/lib/facturx/fonts/). Not run by the tests nor by the app.

    python scripts/make-font-subsets.py <croscorefonts-dir> <agl-dir>

Needs fontTools (`pip install fonttools`, e.g. in a temporary venv). The input directory is the
unpacked ChromeOS core fonts 1.31.0 archive (Apache 2.0):
https://commondatastorage.googleapis.com/chromeos-localmirror/distfiles/croscorefonts-1.31.0.tar.bz2
(sha256 672c3487883ec1ef83d9254240d4327b014212abc823d06d15816095867315e1).
<agl-dir> holds glyphlist.txt and aglfn.txt of https://github.com/adobe-type-tools/agl-aglfn
(BSD-3-Clause, Copyright 2002-2019 Adobe).

Writes:
  src/lib/facturx/fonts/{arimo,tinos,cousine}.ts  subset programs (base64) + metrics of each style
                                                  + Adobe core-14 AFM widths of the matching
                                                  standard font (from @cantoo/pdf-lib's vendored
                                                  standard-fonts metrics, MIT)
  src/lib/facturx/fonts/glyph-names.ts            StandardEncoding / WinAnsiEncoding /
                                                  MacRomanEncoding tables and the Adobe Glyph List
                                                  entries for every character of the subsets
Then formats them with Biome.
"""

import base64
import io
import json
import subprocess
import sys
import zlib
from pathlib import Path

from fontTools import subset
from fontTools.encodings.StandardEncoding import StandardEncoding
from fontTools.encodings.MacRoman import MacRoman
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "lib" / "facturx" / "fonts"
AFM_DIR = ROOT / "node_modules" / "@cantoo" / "pdf-lib" / "src" / "packages" / "standard-fonts"

STYLES = ["regular", "bold", "italic", "boldItalic"]
FAMILIES = {
    "arimo": {
        "name": "Arimo",
        "files": ["Arimo-Regular", "Arimo-Bold", "Arimo-Italic", "Arimo-BoldItalic"],
        "core": ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
        "serif": False,
        "fixedPitch": False,
    },
    "tinos": {
        "name": "Tinos",
        "files": ["Tinos-Regular", "Tinos-Bold", "Tinos-Italic", "Tinos-BoldItalic"],
        "core": ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
        "serif": True,
        "fixedPitch": False,
    },
    "cousine": {
        "name": "Cousine",
        "files": ["Cousine-Regular", "Cousine-Bold", "Cousine-Italic", "Cousine-BoldItalic"],
        "core": ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
        "serif": False,
        "fixedPitch": True,
    },
}


AGL2UV: dict = {}
UV2AGL: dict = {}


def load_agl(agl_dir: Path) -> None:
    """Full AGL (name -> single code point) and canonical names (AGLFN first, then AGL)."""
    for line in (agl_dir / "glyphlist.txt").read_text().splitlines():
        if line.startswith("#") or ";" not in line:
            continue
        name, codes = line.split(";")
        if " " in codes:
            continue
        AGL2UV[name] = int(codes, 16)
    for line in (agl_dir / "aglfn.txt").read_text().splitlines():
        if line.startswith("#") or ";" not in line:
            continue
        code, name, _ = line.split(";")
        UV2AGL[int(code, 16)] = name
    for name, uv in sorted(AGL2UV.items()):
        UV2AGL.setdefault(uv, name)


def win_ansi() -> list:
    """PDF WinAnsiEncoding (ISO 32000-1 Annex D)."""
    names = [""] * 256
    for code in range(32, 256):
        try:
            ch = bytes([code]).decode("cp1252")
        except UnicodeDecodeError:
            continue
        names[code] = UV2AGL.get(ord(ch), "")
    # Annex D lists 240 as space and 255 as hyphen. Its note mapping the unused codes to bullet
    # is a viewer convention, not an encoding entry: they stay undefined here.
    names[0o240] = "space"
    names[0o255] = "hyphen"
    return names


def standard() -> list:
    return [("" if n == ".notdef" else n) for n in StandardEncoding]


def mac_roman() -> list:
    names = [("" if n == ".notdef" else n) for n in MacRoman]
    for code in range(32):
        names[code] = ""
    return names


ENCODINGS: dict = {}


def wanted_unicodes() -> set:
    uni = set()
    for table in ENCODINGS.values():
        for name in table:
            if name and name in AGL2UV:
                uni.add(AGL2UV[name])
    uni.update(range(0x20, 0x7F))
    uni.update(range(0xA0, 0x180))  # Latin-1 Supplement + Latin Extended-A (French: œ, Ÿ)
    uni.update(range(0x0218, 0x021C))  # S/T with comma below (core-14 AFM glyphs)
    uni.update(range(0x2010, 0x2027))  # dashes, quotes, bullets, ellipsis
    uni.update([0x2030, 0x2039, 0x203A, 0x2044, 0x20AC, 0x2122, 0x2212, 0x2202, 0x2206])
    uni.update([0x220F, 0x2211, 0x221A, 0x221E, 0x222B, 0x2248, 0x2260, 0x2264, 0x2265])
    uni.update([0x25CA, 0x03A9, 0x2126, 0x03C0, 0x0131, 0xFB01, 0xFB02, 0x0192])
    uni.update(range(0x02C6, 0x02DE))
    return uni


def subset_font(path: Path, unicodes: set) -> bytes:
    options = subset.Options()
    options.layout_features = []
    options.hinting = False
    options.glyph_names = True
    options.legacy_cmap = False
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["kern", "hdmx", "VDMX", "LTSH", "gasp", "DSIG", "GDEF", "GPOS", "GSUB"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    font = TTFont(str(path))
    sub = subset.Subsetter(options)
    sub.populate(unicodes=sorted(unicodes))
    sub.subset(font)
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def afm(core: str) -> dict:
    raw = json.loads((AFM_DIR / f"{core}.compressed.json").read_text())
    return json.loads(zlib.decompress(base64.b64decode(raw)))


def metrics(program: bytes) -> dict:
    font = TTFont(io.BytesIO(program))
    upm = font["head"].unitsPerEm
    scale = lambda v: round(v * 1000 / upm)  # noqa: E731
    head = font["head"]
    os2 = font["OS/2"]
    return {
        "postScriptName": font["name"].getDebugName(6),
        "unitsPerEm": upm,
        "bbox": [scale(head.xMin), scale(head.yMin), scale(head.xMax), scale(head.yMax)],
        "italicAngle": font["post"].italicAngle,
        "ascent": scale(font["hhea"].ascent),
        "descent": scale(font["hhea"].descent),
        "capHeight": scale(getattr(os2, "sCapHeight", 0) or font["hhea"].ascent),
        "glyphCount": len(font.getGlyphOrder()),
    }


def ts_string(s: str) -> str:
    return json.dumps(s)


def write_family(key: str, spec: dict, src: Path, unicodes: set) -> None:
    styles = []
    total = 0
    for style, file, core in zip(STYLES, spec["files"], spec["core"]):
        program = subset_font(src / f"{file}.ttf", unicodes)
        total += len(program)
        m = metrics(program)
        core_afm = afm(core)
        widths = " ".join(f"{c['N']} {c['WX']}" for c in core_afm["CharMetrics"] if c["N"])
        print(f"  {file}: {len(program)} bytes, {m['glyphCount']} glyphs")
        styles.append(
            f"""  {style}: {{
    postScriptName: {ts_string(m["postScriptName"])},
    coreFont: {ts_string(core)},
    unitsPerEm: {m["unitsPerEm"]},
    bbox: {json.dumps(m["bbox"])},
    italicAngle: {m["italicAngle"]},
    ascent: {m["ascent"]},
    descent: {m["descent"]},
    capHeight: {m["capHeight"]},
    stemV: {core_afm.get("StdVW", 80)},
    coreWidths: {ts_string(widths)},
    program: {ts_string(base64.b64encode(program).decode("ascii"))},
  }},"""
        )
    print(f"  {spec['name']}: {total} bytes of font programs")
    body = "\n".join(styles)
    content = f"""// Generated by scripts/make-font-subsets.py from the ChromeOS core fonts 1.31.0. Do not edit.
// {spec["name"]}: Copyright 2010-2014 Google Inc., Apache License 2.0 (see LICENSE-Apache-2.0.txt).
// coreWidths: Adobe Core 14 AFM advance widths of the metric-compatible standard font.
import type {{ SubstituteFamily }} from "./types"

export const family: SubstituteFamily = {{
  name: {ts_string(spec["name"])},
  serif: {"true" if spec["serif"] else "false"},
  fixedPitch: {"true" if spec["fixedPitch"] else "false"},
  styles: {{
{body}
  }},
}}
"""
    (OUT / f"{key}.ts").write_text(content)


def write_glyph_names(unicodes: set) -> None:
    entries = sorted(
        (name, uv) for name, uv in AGL2UV.items() if uv in unicodes
    )
    agl = " ".join(f"{name} {uv:04X}" for name, uv in entries)
    canonical = " ".join(
        f"{uv:04X} {UV2AGL[uv]}" for uv in sorted(unicodes) if uv in UV2AGL
    )
    tables = "\n".join(
        f"export const {key}Encoding = {ts_string(' '.join(n or '.' for n in names))}"
        for key, names in ENCODINGS.items()
    )
    content = f"""// Generated by scripts/make-font-subsets.py. Do not edit.
// Simple-font encodings (ISO 32000-1 Annex D) as 256 space-separated glyph names, "." = undefined,
// and the Adobe Glyph List (Copyright 2002-2019 Adobe, BSD-3-Clause, see LICENSE-AGL.txt) restricted to the substitute subsets.

{tables}

/** "glyphName HEX" pairs: every AGL name whose character is in the substitute subsets. */
export const aglNames = {ts_string(agl)}

/** "HEX glyphName" pairs: the canonical AGL name of each character of the subsets. */
export const aglCanonical = {ts_string(canonical)}
"""
    (OUT / "glyph-names.ts").write_text(content)


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    src = Path(sys.argv[1])
    load_agl(Path(sys.argv[2]))
    ENCODINGS.update(standard=standard(), winAnsi=win_ansi(), macRoman=mac_roman())
    OUT.mkdir(parents=True, exist_ok=True)
    unicodes = wanted_unicodes()
    for key, spec in FAMILIES.items():
        write_family(key, spec, src, unicodes)
    write_glyph_names(unicodes)
    subprocess.run(["bunx", "biome", "format", "--write", str(OUT)], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
