#!/usr/bin/env python3
"""
Miftah — Gate B: Arabic Rendering Pipeline
Pre-renders Quran pages, ayah strips, and word images using Cairo + Pango.

Usage:
    python3 render_arabic.py [--golden-only] [--page N] [--surah S --ayah A]

Outputs:
    assets/pages/page_{NNN}.png           — Full mushaf pages (300 DPI)
    assets/pages/page_{NNN}_thumb.png     — Thumbnails (72 DPI)
    assets/manifests/page_{NNN}.manifest.json
    assets/ayat/ayah_{SSS}_{AAA}.png      — Per-ayah images
    assets/manifests/ayah_{SSS}_{AAA}.manifest.json

Requires:
    - pycairo, PyGObject (Pango + PangoCairo)
    - KFGQPC Uthman Taha Naskh font in assets/fonts/
"""

import json
import sys
import os
import math
from pathlib import Path

try:
    import cairo
    import gi
    gi.require_version('Pango', '1.0')
    gi.require_version('PangoCairo', '1.0')
    from gi.repository import Pango, PangoCairo
except ImportError as e:
    print(f"ERROR: Missing dependency: {e}")
    print("Install: brew install pygobject3 py3cairo gobject-introspection")
    sys.exit(1)

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
ASSETS_DIR = PROJECT_ROOT / "assets"
FONT_DIR = ASSETS_DIR / "fonts"
GOLDEN_DIR = PROJECT_ROOT / "test" / "golden"

# Rendering constants
DPI = 300
PAGE_WIDTH_MM = 130  # Madinah mushaf width in mm
PAGE_HEIGHT_MM = 185  # Madinah mushaf height in mm
MM_TO_PT = DPI / 25.4

PAGE_WIDTH = int(PAGE_WIDTH_MM * MM_TO_PT)   # ~1535 px at 300 DPI
PAGE_HEIGHT = int(PAGE_HEIGHT_MM * MM_TO_PT)  # ~2185 px at 300 DPI

THUMB_SCALE = 72 / 300  # 72 DPI thumbnails

# Ayah strip rendering
AYAH_WIDTH = 2400  # px at 300 DPI (wider for readability)
AYAH_PADDING = 40  # px

# Font settings
FONT_FAMILY = "KFGQPC Uthman Taha Naskh"
FONT_SIZE_PAGE = 22  # pt for mushaf pages
FONT_SIZE_AYAH = 32  # pt for ayah strips (larger, one ayah)

# Quran page layout (standard Madinah mushaf: 15 lines per page)
LINES_PER_PAGE = 15
LINE_HEIGHT_RATIO = 1.8  # line height as multiple of font size

# Golden test pages per BUILD_PLAN
GOLDEN_PAGES = [1, 2, 77, 489, 604]


def find_font():
    """Find the KFGQPC font file."""
    candidates = [
        FONT_DIR / "KFGQPCUthmanTahaNaskh-Regular.ttf",
        FONT_DIR / "KFGQPC Uthman Taha Naskh Regular.ttf",
        FONT_DIR / "UthmanTN_v2-0.ttf",
        Path.home() / "Library" / "Fonts" / "KFGQPCUthmanTahaNaskh-Regular.ttf",
    ]
    for f in FONT_DIR.glob("*.[tToO][tT][fF]"):
        candidates.insert(0, f)

    for c in candidates:
        if c.exists() and c.stat().st_size > 10000:  # Must be a real font, not HTML
            return c
    return None


def setup_font(font_path):
    """Register font with fontconfig so Pango can find it."""
    import subprocess
    # Add font directory to fontconfig
    fc_conf = Path.home() / ".config" / "fontconfig" / "fonts.conf"
    fc_conf.parent.mkdir(parents=True, exist_ok=True)
    fc_conf.write_text(f"""<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>{font_path.parent}</dir>
</fontconfig>
""")
    subprocess.run(["fc-cache", "-f"], capture_output=True)

    # Verify font is found
    result = subprocess.run(["fc-match", FONT_FAMILY], capture_output=True, text=True)
    if FONT_FAMILY.lower().replace(" ", "") not in result.stdout.lower().replace(" ", ""):
        print(f"WARNING: Font '{FONT_FAMILY}' not found by fontconfig")
        print(f"  fc-match returned: {result.stdout.strip()}")
        print(f"  Will try to use it anyway via font path: {font_path}")
        return False
    return True


def load_quran_text():
    """Load full Quran text from tanzil files."""
    uthmani_path = DATA_DIR / "qul" / "quran-uthmani.txt"
    if not uthmani_path.exists():
        print(f"ERROR: {uthmani_path} not found. Run download first.")
        sys.exit(1)

    verses = {}  # (surah, ayah) -> text
    with open(uthmani_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split('|', 2)
            if len(parts) == 3:
                surah, ayah = int(parts[0]), int(parts[1])
                verses[(surah, ayah)] = parts[2]
    return verses


def load_page_mapping():
    """Load page → ayat mapping from seed data or QUL dump."""
    ayat_path = DATA_DIR / "seed" / "ayat.json"
    if not ayat_path.exists():
        return {}

    with open(ayat_path, 'r') as f:
        ayat = json.load(f)

    pages = {}  # page_number -> [(surah, ayah, text)]
    for a in ayat:
        page = a.get('page_number', 0)
        if page > 0:
            if page not in pages:
                pages[page] = []
            pages[page].append((a['surah_id'], a['ayah_number']))

    # Sort ayat within each page
    for page in pages:
        pages[page].sort()

    return pages


def create_pango_layout(cr, text, font_family, font_size, width=None):
    """Create a Pango layout for Arabic text (RTL)."""
    layout = PangoCairo.create_layout(cr)

    # Set font
    desc = Pango.FontDescription.new()
    desc.set_family(font_family)
    desc.set_size(int(font_size * Pango.SCALE))
    layout.set_font_description(desc)

    # RTL + center alignment for Quran
    layout.set_alignment(Pango.Alignment.CENTER)
    layout.set_auto_dir(True)  # Auto-detect RTL

    if width:
        layout.set_width(int(width * Pango.SCALE))
        layout.set_wrap(Pango.WrapMode.WORD)

    layout.set_text(text, -1)
    return layout


def render_page(page_number, page_ayat, quran_text, output_dir):
    """Render a single mushaf page."""
    # Create surface
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, PAGE_WIDTH, PAGE_HEIGHT)
    cr = cairo.Context(surface)

    # White background
    cr.set_source_rgb(1, 1, 1)
    cr.paint()

    # Text color
    cr.set_source_rgb(0, 0, 0)

    # Margins
    margin_x = int(PAGE_WIDTH * 0.08)
    margin_top = int(PAGE_HEIGHT * 0.06)
    text_width = PAGE_WIDTH - (2 * margin_x)
    text_height = PAGE_HEIGHT - (2 * margin_top)
    line_height = text_height / LINES_PER_PAGE

    # Collect all text for this page
    page_text_parts = []
    word_positions = []  # For manifest

    for surah, ayah in page_ayat:
        text = quran_text.get((surah, ayah), '')
        if text:
            # Add ayah marker (Quranic ayah end sign ۝ with number)
            page_text_parts.append(f"{text} \u06DD{ayah}")

    full_text = " ".join(page_text_parts)

    if not full_text.strip():
        return None

    # Render text
    cr.save()
    cr.translate(margin_x, margin_top)

    layout = create_pango_layout(cr, full_text, FONT_FAMILY, FONT_SIZE_PAGE, text_width)
    PangoCairo.show_layout(cr, layout)

    # Get layout extents for manifest
    ink_rect, logical_rect = layout.get_pixel_extents()

    cr.restore()

    # Save page image
    page_path = output_dir / "pages" / f"page_{page_number:03d}.png"
    page_path.parent.mkdir(parents=True, exist_ok=True)
    surface.write_to_png(str(page_path))

    # Save thumbnail
    thumb_w = int(PAGE_WIDTH * THUMB_SCALE)
    thumb_h = int(PAGE_HEIGHT * THUMB_SCALE)
    thumb_surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, thumb_w, thumb_h)
    thumb_cr = cairo.Context(thumb_surface)
    thumb_cr.scale(THUMB_SCALE, THUMB_SCALE)
    thumb_cr.set_source_surface(surface)
    thumb_cr.paint()

    thumb_path = output_dir / "pages" / f"page_{page_number:03d}_thumb.png"
    thumb_surface.write_to_png(str(thumb_path))

    # Build manifest
    manifest = {
        "page": page_number,
        "surah_start": page_ayat[0][0] if page_ayat else 0,
        "ayah_start": page_ayat[0][1] if page_ayat else 0,
        "surah_end": page_ayat[-1][0] if page_ayat else 0,
        "ayah_end": page_ayat[-1][1] if page_ayat else 0,
        "schema_version": "1.0.0",
        "image_width": PAGE_WIDTH,
        "image_height": PAGE_HEIGHT,
        "dpi": DPI,
        "words": [],  # TODO: per-word hitboxes via Pango iter
    }

    manifest_path = output_dir / "manifests" / f"page_{page_number:03d}.manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return page_path


def render_ayah(surah, ayah, text, output_dir):
    """Render a single ayah as a horizontal strip."""
    # First pass: measure text height
    measure_surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, AYAH_WIDTH, 100)
    measure_cr = cairo.Context(measure_surface)

    layout = create_pango_layout(
        measure_cr, text, FONT_FAMILY, FONT_SIZE_AYAH,
        AYAH_WIDTH - (2 * AYAH_PADDING)
    )
    ink_rect, logical_rect = layout.get_pixel_extents()
    text_height = logical_rect.height + (2 * AYAH_PADDING)
    text_height = max(text_height, 80)  # Minimum height

    # Actual render
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, AYAH_WIDTH, text_height)
    cr = cairo.Context(surface)

    # White background
    cr.set_source_rgb(1, 1, 1)
    cr.paint()

    # Text
    cr.set_source_rgb(0, 0, 0)
    cr.translate(AYAH_PADDING, AYAH_PADDING)

    layout = create_pango_layout(
        cr, text, FONT_FAMILY, FONT_SIZE_AYAH,
        AYAH_WIDTH - (2 * AYAH_PADDING)
    )
    PangoCairo.show_layout(cr, layout)

    # Save
    ayah_path = output_dir / "ayat" / f"ayah_{surah:03d}_{ayah:03d}.png"
    ayah_path.parent.mkdir(parents=True, exist_ok=True)
    surface.write_to_png(str(ayah_path))

    # Manifest
    manifest = {
        "surah": surah,
        "ayah": ayah,
        "schema_version": "1.0.0",
        "image_width": AYAH_WIDTH,
        "image_height": text_height,
        "words": [],  # TODO: per-word hitboxes
    }

    manifest_path = output_dir / "manifests" / f"ayah_{surah:03d}_{ayah:03d}.manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return ayah_path


def render_golden_pages(quran_text, page_mapping):
    """Render the 5 golden test pages."""
    print("\n--- Golden Test Pages ---")

    golden_output = GOLDEN_DIR
    golden_output.mkdir(parents=True, exist_ok=True)

    for page_num in GOLDEN_PAGES:
        ayat = page_mapping.get(page_num, [])
        if not ayat:
            # For pages not in our mapping, render first few ayat of that page range
            print(f"  Page {page_num}: no page mapping available, skipping")
            continue

        path = render_page(page_num, ayat, quran_text, golden_output)
        if path:
            print(f"  Page {page_num}: {path} ({len(ayat)} ayat)")

            # Also render individual ayah strips for these pages
            for surah, ayah_num in ayat[:5]:  # First 5 ayat per page
                text = quran_text.get((surah, ayah_num), '')
                if text:
                    ayah_path = render_ayah(surah, ayah_num, text, golden_output)
                    print(f"    Ayah {surah}:{ayah_num}: {ayah_path}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Miftah Arabic Rendering Pipeline")
    parser.add_argument("--golden-only", action="store_true", help="Only render 5 golden test pages")
    parser.add_argument("--page", type=int, help="Render specific page number")
    parser.add_argument("--surah", type=int, help="Render specific surah")
    parser.add_argument("--ayah", type=int, help="Render specific ayah (requires --surah)")
    args = parser.parse_args()

    print("=" * 60)
    print("Miftah — Gate B: Arabic Rendering Pipeline")
    print("=" * 60)

    # Check font
    font_path = find_font()
    if not font_path:
        print("\nERROR: KFGQPC font not found!")
        print(f"Place the font file in: {FONT_DIR}/")
        print("Download from: fonts.qurancomplex.gov.sa or search 'KFGQPC Uthman Taha Naskh TTF'")
        sys.exit(1)

    print(f"\nFont: {font_path}")
    font_ok = setup_font(font_path)
    print(f"Font registered: {'OK' if font_ok else 'FALLBACK (may use system Arabic font)'}")

    # Load data
    print("\nLoading Quran text...")
    quran_text = load_quran_text()
    print(f"  Loaded {len(quran_text)} verses")

    page_mapping = load_page_mapping()
    print(f"  Page mapping: {len(page_mapping)} pages")

    if args.golden_only or (not args.page and not args.surah):
        render_golden_pages(quran_text, page_mapping)
    elif args.page:
        ayat = page_mapping.get(args.page, [])
        if ayat:
            path = render_page(args.page, ayat, quran_text, ASSETS_DIR)
            print(f"Rendered page {args.page}: {path}")
        else:
            print(f"No page mapping for page {args.page}")
    elif args.surah and args.ayah:
        text = quran_text.get((args.surah, args.ayah), '')
        if text:
            path = render_ayah(args.surah, args.ayah, text, ASSETS_DIR)
            print(f"Rendered ayah {args.surah}:{args.ayah}: {path}")
        else:
            print(f"No text for {args.surah}:{args.ayah}")

    print("\nDone.")


if __name__ == "__main__":
    main()
