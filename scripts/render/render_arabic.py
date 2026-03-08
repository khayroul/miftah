#!/usr/bin/env python3
"""
Miftah — Gate B: Arabic Rendering Pipeline (QCF V2 Edition)
Pre-renders Quran pages using QCF V2 (Quran Complex Font) glyph fonts.

Each page uses its own font (QCF2_P001.TTF – QCF2_P604.TTF) containing pre-shaped
glyphs for every word on that page. Glyph codepoints (qpcV2) come from the
mushaf-layout dataset. This produces pixel-perfect Madinah mushaf calligraphy.

Usage:
    python3 render_arabic.py [--golden-only] [--page N] [--pages START-END] [--debug]

Outputs:
    assets/pages/page_{NNN}.png               — Full mushaf pages
    assets/pages/page_{NNN}_thumb.png          — Thumbnails
    assets/manifests/page_{NNN}.manifest.json
    assets/ayat/ayah_{SSS}_{AAA}.png           — Per-ayah images
    assets/manifests/ayah_{SSS}_{AAA}.manifest.json

Requires:
    - Pillow (PIL)
    - QCF V2 TTF fonts in assets/fonts/qcf-v2/ (QCF2_P001.TTF – QCF2_P604.TTF)
    - mushaf-layout data in data/mushaf-layout/mushaf/
"""

import json
import sys
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
ASSETS_DIR = PROJECT_ROOT / "assets"
QCF_FONT_DIR = ASSETS_DIR / "fonts" / "qcf-v2"
GOLDEN_DIR = PROJECT_ROOT / "test" / "golden"

# ---------------------------------------------------------------------------
# Page dimensions — clean modern style
# ---------------------------------------------------------------------------
PAGE_WIDTH = 1200
PAGE_HEIGHT = 1920
THUMB_SCALE = 0.25

# Layout
MARGIN_X = 42              # tight margins — maximize text width for larger font
HEADER_Y = 30              # y position of header text
HEADER_BOTTOM = 70         # y of separator line
TEXT_TOP = 90               # start text higher
TEXT_BOTTOM_PAD = 55        # less bottom padding
LINES_PER_PAGE = 15

# Surah header banner
SURAH_BANNER_HEIGHT = 50
SURAH_BANNER_PAD = 12      # vertical padding after banner
SURAH_BANNER_INSET = 40    # horizontal inset from margin
SURAH_BANNER_BG = (245, 243, 238)
SURAH_BANNER_BORDER = (200, 195, 185)
SURAH_BANNER_TEXT_COLOR = (80, 70, 55)

# Colors
TEXT_COLOR = (25, 20, 15)
HEADER_COLOR = (120, 120, 120)
SEPARATOR_COLOR = (220, 218, 215)
PAGE_NUM_COLOR = (150, 150, 150)

# Font sizes
HEADER_FONT_SIZE = 28
SURAH_BANNER_FONT_SIZE = 22
PAGE_NUM_FONT_SIZE = 24

# Golden test pages per BUILD_PLAN
GOLDEN_PAGES = [1, 2, 77, 489, 604]

# Juz boundaries (page where each juz starts)
JUZ_START_PAGES = [
    1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
    201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
    402, 422, 442, 462, 482, 502, 522, 542, 562, 582
]


# ===================================================================
# Data Loading
# ===================================================================

def load_surah_metadata():
    """Load surah names from quran-data.xml."""
    xml_path = DATA_DIR / "qul" / "quran-data.xml"
    if not xml_path.exists():
        return {}
    tree = ET.parse(xml_path)
    root = tree.getroot()
    surahs = {}
    for s in root.findall(".//sura"):
        idx = int(s.get("index"))
        surahs[idx] = {
            "name_ar": s.get("name"),
            "name_en": s.get("tname"),
            "ayas": int(s.get("ayas")),
        }
    return surahs


def load_mushaf_layout(page_number):
    """Load mushaf line-break + QCF glyph data for one page."""
    p = DATA_DIR / "mushaf-layout" / "mushaf" / f"page-{page_number:03d}.json"
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def load_quran_text():
    """Load Uthmani text for ayah-strip rendering."""
    p = DATA_DIR / "qul" / "quran-uthmani.txt"
    if not p.exists():
        return {}
    verses = {}
    with open(p, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split('|', 2)
            if len(parts) == 3:
                verses[(int(parts[0]), int(parts[1]))] = parts[2]
    return verses


def load_page_mapping():
    """Load page -> ayat mapping for ayah-strip rendering."""
    p = DATA_DIR / "seed" / "verse_metadata.json"
    if not p.exists():
        return {}
    with open(p, 'r', encoding='utf-8') as f:
        meta = json.load(f)
    pages = {}
    for key, v in meta.get('verses', {}).items():
        parts = key.split(':')
        if len(parts) == 2:
            page = v.get('page_number', 0)
            if page > 0:
                pages.setdefault(page, []).append((int(parts[0]), int(parts[1])))
    for page in pages:
        pages[page].sort()
    return pages


# ===================================================================
# Helpers
# ===================================================================

def get_juz(page):
    for i in range(len(JUZ_START_PAGES) - 1, -1, -1):
        if page >= JUZ_START_PAGES[i]:
            return i + 1
    return 1


def get_page_surahs(layout_data):
    """Surah numbers present on this page."""
    surahs = set()
    for line in layout_data.get("lines", []):
        if line["type"] == "surah-header":
            surahs.add(int(line.get("surah", "0")))
        elif line["type"] == "text":
            for part in line.get("verseRange", "").split("-"):
                if ":" in part:
                    surahs.add(int(part.split(":")[0]))
    return sorted(surahs)


def get_qcf_font(page_number, size):
    """Load QCF V2 font for a specific page."""
    p = QCF_FONT_DIR / f"QCF2_P{page_number:03d}.TTF"
    if not p.exists():
        raise FileNotFoundError(f"QCF V2 font missing: {p}")
    return ImageFont.truetype(str(p), size)


_header_font_cache = {}

def get_header_font(size=HEADER_FONT_SIZE):
    if size in _header_font_cache:
        return _header_font_cache[size]
    for c in ["/System/Library/Fonts/Helvetica.ttc",
              "/System/Library/Fonts/SFNSText.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(c):
            f = ImageFont.truetype(c, size)
            _header_font_cache[size] = f
            return f
    f = ImageFont.load_default()
    _header_font_cache[size] = f
    return f


_arabic_font_cache = {}

def get_arabic_font(size=HEADER_FONT_SIZE):
    if size in _arabic_font_cache:
        return _arabic_font_cache[size]
    candidates = []
    # Check project fonts dir (non-QCF fonts)
    fd = ASSETS_DIR / "fonts"
    if fd.exists():
        for fp in fd.glob("*.[tT][tT][fFcC]"):
            if "QCF" not in fp.name:
                candidates.append(str(fp))
    candidates += [
        "/System/Library/Fonts/Supplemental/GeezaPro.ttc",
        "/System/Library/Fonts/GeezaPro.ttc",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                f = ImageFont.truetype(c, size)
                _arabic_font_cache[size] = f
                return f
            except Exception:
                continue
    f = get_header_font(size)
    _arabic_font_cache[size] = f
    return f


# ===================================================================
# Line Extraction
# ===================================================================

def extract_page_lines(layout_data):
    """Parse mushaf-layout into renderable line objects.

    Returns list of dicts with keys:
        type:   "text" | "basmala" | "surah-header"
        glyphs: str          — QCF V2 glyph string for full line
        words:  list[dict]   — per-word: glyph, location, word (Arabic)
        surah:  int           (surah-header only)
    """
    lines = []
    for obj in layout_data.get("lines", []):
        lt = obj["type"]
        if lt == "surah-header":
            lines.append({"type": "surah-header", "surah": int(obj.get("surah", "0")),
                          "glyphs": "", "words": []})
        elif lt == "basmala":
            lines.append({"type": "basmala", "glyphs": obj.get("qpcV2", ""), "words": []})
        elif lt == "text":
            words = []
            parts = []
            for w in obj.get("words", []):
                g = w.get("qpcV2", "")
                parts.append(g)
                words.append({"glyph": g, "location": w.get("location", ""),
                              "word": w.get("word", "")})
            lines.append({"type": "text", "glyphs": " ".join(parts), "words": words})
    return lines


# ===================================================================
# Font Size
# ===================================================================

def find_font_size(draw, page_number, lines, max_width, max_height):
    """Binary search for largest font where all lines fit horizontally,
    and total line block fits vertically."""
    glyph_lines = [l["glyphs"] for l in lines
                   if l["type"] in ("text", "basmala") and l["glyphs"]]
    if not glyph_lines:
        return 40

    num = len(glyph_lines)

    # Also collect per-line word glyphs for word-by-word width check
    word_lines = []
    for l in lines:
        if l["type"] in ("text", "basmala") and l["glyphs"]:
            word_lines.append([w["glyph"] for w in l.get("words", [])] or [l["glyphs"]])

    MIN_WORD_GAP = 8  # minimum pixels between words when rendered word-by-word

    lo, hi = 20, 120
    while hi - lo > 1:
        mid = (lo + hi) // 2
        font = get_qcf_font(page_number, mid)
        fits = True

        # Horizontal check: word-by-word width + minimal gaps
        for wl in word_lines:
            total = sum(font.getbbox(g)[2] - font.getbbox(g)[0] for g in wl)
            needed = total + (len(wl) - 1) * MIN_WORD_GAP
            if needed > max_width:
                fits = False
                break

        # Vertical check: line height * num_lines * spacing <= max_height
        # 1.05 = tight mushaf density
        if fits:
            bb = font.getbbox(glyph_lines[0])
            lh = bb[3] - bb[1]
            if lh * num * 1.05 > max_height:
                fits = False

        if fits:
            lo = mid
        else:
            hi = mid
    return lo


# ===================================================================
# Page Rendering
# ===================================================================

def render_page(page_number, layout_data, surah_meta, output_dir, debug=False):
    """Render one mushaf page with QCF V2 fonts."""
    lines = extract_page_lines(layout_data)
    if not lines:
        return None

    img = Image.new("RGB", (PAGE_WIDTH, PAGE_HEIGHT), "white")
    draw = ImageDraw.Draw(img)

    surah_headers = [l for l in lines if l["type"] == "surah-header"]
    text_lines = [l for l in lines if l["type"] in ("text", "basmala")]

    # Compute text area
    banner_space = len(surah_headers) * (SURAH_BANNER_HEIGHT + SURAH_BANNER_PAD)
    text_area_top = TEXT_TOP + banner_space
    text_area_bottom = PAGE_HEIGHT - TEXT_BOTTOM_PAD
    text_area_height = text_area_bottom - text_area_top
    text_width = PAGE_WIDTH - 2 * MARGIN_X

    # Font size
    font_size = find_font_size(draw, page_number, lines, text_width, text_area_height)
    qcf = get_qcf_font(page_number, font_size)

    # Measure actual glyph height from the densest line
    max_glyph_h = 0
    for l in text_lines:
        if l["glyphs"].strip():
            bb = qcf.getbbox(l["glyphs"])
            h = bb[3] - bb[1]
            if h > max_glyph_h:
                max_glyph_h = h

    # Line spacing: glyph height * ratio (tight, mushaf-like)
    # 1.05 = very tight, matching real mushaf density
    num = len(text_lines)
    line_spacing = max_glyph_h * 1.05 if max_glyph_h > 0 else text_area_height / max(num, 1)
    total_block_height = line_spacing * num

    # Vertically center the text block in the available area
    text_area_top += max(0, (text_area_height - total_block_height) / 2)

    # --- Header ---
    page_surahs = get_page_surahs(layout_data)
    primary_surah = page_surahs[-1] if page_surahs else 1
    juz = get_juz(page_number)

    hdr = get_header_font(HEADER_FONT_SIZE)
    ar_hdr = get_arabic_font(HEADER_FONT_SIZE)

    draw.text((MARGIN_X, HEADER_Y), f"Juz' {juz}", font=hdr, fill=HEADER_COLOR)

    sm = surah_meta.get(primary_surah, {})
    ar_name = sm.get("name_ar", "")
    en_name = sm.get("name_en", "")

    rx = PAGE_WIDTH - MARGIN_X
    if ar_name:
        ar_bb = ar_hdr.getbbox(ar_name)
        ar_w = ar_bb[2] - ar_bb[0]
        rx -= ar_w
        draw.text((rx, HEADER_Y - 5), ar_name, font=ar_hdr, fill=HEADER_COLOR)
        rx -= 15
    if en_name:
        en_bb = hdr.getbbox(en_name)
        en_w = en_bb[2] - en_bb[0]
        rx -= en_w
        draw.text((rx, HEADER_Y), en_name, font=hdr, fill=HEADER_COLOR)

    draw.line([(MARGIN_X, HEADER_BOTTOM), (PAGE_WIDTH - MARGIN_X, HEADER_BOTTOM)],
              fill=SEPARATOR_COLOR, width=1)

    # --- Surah header banners ---
    banner_y = TEXT_TOP
    banner_font = get_arabic_font(SURAH_BANNER_FONT_SIZE)
    for sh in surah_headers:
        sn = sh.get("surah", 0)
        name = surah_meta.get(sn, {}).get("name_ar", f"Surah {sn}")

        bx1 = MARGIN_X + SURAH_BANNER_INSET
        bx2 = PAGE_WIDTH - MARGIN_X - SURAH_BANNER_INSET
        by1 = banner_y
        by2 = by1 + SURAH_BANNER_HEIGHT

        draw.rounded_rectangle([bx1, by1, bx2, by2], radius=8,
                                fill=SURAH_BANNER_BG, outline=SURAH_BANNER_BORDER)

        bb = banner_font.getbbox(name)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        draw.text(((PAGE_WIDTH - tw) / 2,
                    by1 + (SURAH_BANNER_HEIGHT - th) / 2 - bb[1]),
                   name, font=banner_font, fill=SURAH_BANNER_TEXT_COLOR)

        banner_y += SURAH_BANNER_HEIGHT + SURAH_BANNER_PAD

    # --- Render text lines ---
    word_boxes = []
    ayat_on_page = set()
    ti = 0

    for line in lines:
        if line["type"] == "surah-header":
            continue

        y = text_area_top + ti * line_spacing
        ti += 1

        glyphs = line["glyphs"]
        if not glyphs.strip():
            continue

        words = line.get("words", [])

        if line["type"] == "basmala" or not words:
            # Center
            bb = qcf.getbbox(glyphs)
            tw = bb[2] - bb[0]
            draw.text(((PAGE_WIDTH - tw) / 2, y), glyphs, font=qcf, fill=TEXT_COLOR)
        else:
            # Justified RTL word-by-word
            widths = []
            for w in words:
                bb = qcf.getbbox(w["glyph"])
                widths.append(bb[2] - bb[0])

            total_w = sum(widths)
            n_gaps = len(words) - 1

            # Always justify — mushaf lines fill the full width.
            # Distribute remaining space evenly between words.
            if n_gaps > 0 and total_w < text_width:
                gap = (text_width - total_w) / n_gaps
            elif n_gaps > 0:
                # Line overflows: use minimal gap, will slightly exceed margins
                gap = font_size * 0.15
            else:
                gap = 0

            cx = PAGE_WIDTH - MARGIN_X
            for j, w in enumerate(words):
                ww = widths[j]
                bb = qcf.getbbox(w["glyph"])
                h = bb[3] - bb[1]

                wx = cx - ww
                draw.text((wx, y), w["glyph"], font=qcf, fill=TEXT_COLOR)

                loc = w.get("location", "")
                if loc:
                    parts = loc.split(":")
                    if len(parts) == 3:
                        ayat_on_page.add((int(parts[0]), int(parts[1])))

                word_boxes.append({
                    "text": w.get("word", ""),
                    "location": loc,
                    "x": round(wx), "y": round(y),
                    "w": round(ww), "h": round(h),
                })

                if debug:
                    draw.rectangle([wx, y, wx + ww, y + h], outline="red", width=1)

                cx -= ww + gap

    # --- Page number ---
    pn_font = get_header_font(PAGE_NUM_FONT_SIZE)
    pn = str(page_number)
    pn_bb = pn_font.getbbox(pn)
    draw.text(((PAGE_WIDTH - (pn_bb[2] - pn_bb[0])) / 2, PAGE_HEIGHT - 50),
               pn, font=pn_font, fill=PAGE_NUM_COLOR)

    # --- Save ---
    page_path = output_dir / "pages" / f"page_{page_number:03d}.png"
    page_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(page_path))

    # Thumbnail
    tw, th = int(PAGE_WIDTH * THUMB_SCALE), int(PAGE_HEIGHT * THUMB_SCALE)
    thumb = img.resize((tw, th), Image.LANCZOS)
    thumb_path = output_dir / "pages" / f"page_{page_number:03d}_thumb.png"
    thumb.save(str(thumb_path))

    # Manifest
    ayat_sorted = sorted(ayat_on_page)
    manifest = {
        "page": page_number,
        "surah_start": ayat_sorted[0][0] if ayat_sorted else 0,
        "ayah_start": ayat_sorted[0][1] if ayat_sorted else 0,
        "surah_end": ayat_sorted[-1][0] if ayat_sorted else 0,
        "ayah_end": ayat_sorted[-1][1] if ayat_sorted else 0,
        "schema_version": "1.0.0",
        "image_width": PAGE_WIDTH,
        "image_height": PAGE_HEIGHT,
        "font_size_pt": font_size,
        "renderer": "qcf-v2",
        "words": word_boxes,
    }
    mp = output_dir / "manifests" / f"page_{page_number:03d}.manifest.json"
    mp.parent.mkdir(parents=True, exist_ok=True)
    with open(mp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return page_path


# ===================================================================
# Ayah Strip Rendering
# ===================================================================

def render_ayah(surah, ayah, page_mapping, output_dir):
    """Render one ayah as a horizontal strip using QCF V2 glyphs."""
    # Find which page this ayah is on
    page_num = None
    for pg, ayat in page_mapping.items():
        if (surah, ayah) in ayat:
            page_num = pg
            break
    if not page_num:
        return None

    layout_data = load_mushaf_layout(page_num)
    if not layout_data:
        return None

    # Collect qpcV2 glyphs for this ayah
    ayah_glyphs = []
    for line in layout_data.get("lines", []):
        if line.get("type") != "text":
            continue
        for w in line.get("words", []):
            loc = w.get("location", "")
            parts = loc.split(":")
            if len(parts) == 3 and int(parts[0]) == surah and int(parts[1]) == ayah:
                ayah_glyphs.append(w.get("qpcV2", ""))

    if not ayah_glyphs:
        return None

    glyph_text = " ".join(ayah_glyphs)
    WIDTH = 2400
    PAD = 40

    qcf = get_qcf_font(page_num, 48)
    bb = qcf.getbbox(glyph_text)
    text_w, text_h = bb[2] - bb[0], bb[3] - bb[1]
    height = max(text_h + 2 * PAD, 80)

    img = Image.new("RGB", (WIDTH, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text(((WIDTH - text_w) / 2, PAD), glyph_text, font=qcf, fill=TEXT_COLOR)

    ayah_path = output_dir / "ayat" / f"ayah_{surah:03d}_{ayah:03d}.png"
    ayah_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(ayah_path))

    manifest = {
        "surah": surah, "ayah": ayah,
        "schema_version": "1.0.0",
        "image_width": WIDTH, "image_height": height,
        "renderer": "qcf-v2", "words": [],
    }
    mp = output_dir / "manifests" / f"ayah_{surah:03d}_{ayah:03d}.manifest.json"
    mp.parent.mkdir(parents=True, exist_ok=True)
    with open(mp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return ayah_path


# ===================================================================
# Batch Rendering
# ===================================================================

def render_golden_pages(surah_meta, page_mapping, debug=False):
    """Render the 5 golden test pages + sample ayah strips."""
    print("\n--- Golden Test Pages ---")
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)

    for pn in GOLDEN_PAGES:
        ld = load_mushaf_layout(pn)
        if not ld:
            print(f"  Page {pn}: no layout data, skipping")
            continue
        path = render_page(pn, ld, surah_meta, GOLDEN_DIR, debug=debug)
        if path:
            kb = os.path.getsize(path) / 1024
            print(f"  Page {pn}: {path} ({kb:.0f} KB)")

            # Render first 3 ayat as strips
            ayat = page_mapping.get(pn, [])
            for s, a in ayat[:3]:
                ap = render_ayah(s, a, page_mapping, GOLDEN_DIR)
                if ap:
                    print(f"    Ayah {s}:{a}: {ap}")


def render_page_range(start, end, surah_meta, output_dir, debug=False):
    """Render pages start–end inclusive."""
    print(f"\n--- Rendering pages {start}–{end} ---")
    rendered = 0
    for pn in range(start, end + 1):
        ld = load_mushaf_layout(pn)
        if not ld:
            continue
        path = render_page(pn, ld, surah_meta, output_dir, debug=debug)
        if path:
            rendered += 1
            if rendered % 20 == 0:
                print(f"  Rendered {rendered} pages (current: {pn})")
    print(f"  Done: {rendered} pages")
    return rendered


# ===================================================================
# Main
# ===================================================================

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Miftah Arabic Rendering Pipeline (QCF V2)")
    parser.add_argument("--golden-only", action="store_true", help="Render 5 golden test pages")
    parser.add_argument("--page", type=int, help="Render one page")
    parser.add_argument("--pages", type=str, help="Page range, e.g. '1-61'")
    parser.add_argument("--debug", action="store_true", help="Draw hitbox overlay")
    args = parser.parse_args()

    print("=" * 60)
    print("Miftah — Gate B: Arabic Rendering Pipeline (QCF V2)")
    print("=" * 60)

    # Verify fonts
    test = QCF_FONT_DIR / "QCF2_P001.TTF"
    if not test.exists():
        print(f"\nERROR: QCF V2 fonts not found in {QCF_FONT_DIR}/")
        sys.exit(1)
    fc = len(list(QCF_FONT_DIR.glob("QCF2_P*.TTF")))
    print(f"\nQCF V2 fonts: {fc}/604 in {QCF_FONT_DIR}")

    # Verify mushaf-layout
    if not load_mushaf_layout(1):
        print("ERROR: mushaf-layout data not found")
        sys.exit(1)
    print("mushaf-layout: OK")

    # Load metadata
    surah_meta = load_surah_metadata()
    print(f"Surahs: {len(surah_meta)}")

    page_mapping = load_page_mapping()
    print(f"Page mapping: {len(page_mapping)} pages")

    # Route
    if args.golden_only or (not args.page and not args.pages):
        render_golden_pages(surah_meta, page_mapping, debug=args.debug)
    elif args.pages:
        parts = args.pages.split('-')
        s = int(parts[0])
        e = int(parts[1]) if len(parts) > 1 else s
        render_page_range(s, e, surah_meta, ASSETS_DIR, debug=args.debug)
    elif args.page:
        ld = load_mushaf_layout(args.page)
        if ld:
            path = render_page(args.page, ld, surah_meta, ASSETS_DIR, debug=args.debug)
            print(f"Rendered page {args.page}: {path}")
        else:
            print(f"No layout data for page {args.page}")

    print("\nDone.")


if __name__ == "__main__":
    main()
