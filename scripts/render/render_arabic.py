#!/usr/bin/env python3
"""
Miftah — Gate B: Arabic Rendering Pipeline
Pre-renders Quran pages, ayah strips, and word images using Cairo + Pango.

Usage:
    python3 render_arabic.py [--golden-only] [--page N] [--surah S --ayah A] [--debug]

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
PAGE_WIDTH_MM = 130   # Madinah mushaf width in mm
PAGE_HEIGHT_MM = 185  # Madinah mushaf height in mm
MM_TO_PT = DPI / 25.4

PAGE_WIDTH = int(PAGE_WIDTH_MM * MM_TO_PT)    # ~1535 px at 300 DPI
PAGE_HEIGHT = int(PAGE_HEIGHT_MM * MM_TO_PT)   # ~2185 px at 300 DPI

THUMB_SCALE = 72 / 300  # 72 DPI thumbnails

# Margins (fraction of page dimension)
MARGIN_X_FRAC = 0.07
MARGIN_TOP_FRAC = 0.05
MARGIN_BOTTOM_FRAC = 0.05

# Ayah strip rendering
AYAH_WIDTH = 2400   # px at 300 DPI (wider for readability)
AYAH_PADDING = 40   # px

# Font settings
FONT_FAMILY = "KFGQPC Uthman Taha Naskh"
FONT_SIZE_AYAH = 32  # pt for ayah strips (larger, one ayah)

# Quran page layout (standard Madinah mushaf: 15 lines per page)
LINES_PER_PAGE = 15

# Golden test pages per BUILD_PLAN
GOLDEN_PAGES = [1, 2, 77, 489, 604]

# Ayah end marker
AYAH_MARKER = "\u06DD"  # ۝


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
        if c.exists() and c.stat().st_size > 10000:
            return c
    return None


def setup_font(font_path):
    """Register font with fontconfig so Pango can find it."""
    import subprocess
    fc_conf = Path.home() / ".config" / "fontconfig" / "fonts.conf"
    fc_conf.parent.mkdir(parents=True, exist_ok=True)
    fc_conf.write_text(f"""<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>{font_path.parent}</dir>
</fontconfig>
""")
    subprocess.run(["fc-cache", "-f"], capture_output=True)

    result = subprocess.run(["fc-match", FONT_FAMILY], capture_output=True, text=True)
    if FONT_FAMILY.lower().replace(" ", "") not in result.stdout.lower().replace(" ", ""):
        print(f"WARNING: Font '{FONT_FAMILY}' not found by fontconfig")
        print(f"  fc-match returned: {result.stdout.strip()}")
        return False
    return True


def load_quran_text():
    """Load full Quran text from tanzil files."""
    uthmani_path = DATA_DIR / "qul" / "quran-uthmani.txt"
    if not uthmani_path.exists():
        print(f"ERROR: {uthmani_path} not found.")
        sys.exit(1)

    verses = {}
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
    """Load page → ayat mapping from tanzil verse_metadata.json (100% coverage)."""
    meta_path = DATA_DIR / "seed" / "verse_metadata.json"
    if not meta_path.exists():
        # Fallback to old ayat.json
        ayat_path = DATA_DIR / "seed" / "ayat.json"
        if not ayat_path.exists():
            return {}
        with open(ayat_path, 'r') as f:
            ayat = json.load(f)
        pages = {}
        for a in ayat:
            page = a.get('page_number', 0)
            if page > 0:
                pages.setdefault(page, []).append((a['surah_id'], a['ayah_number']))
        for page in pages:
            pages[page].sort()
        return pages

    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    pages = {}
    for key, v in meta.get('verses', {}).items():
        parts = key.split(':')
        if len(parts) != 2:
            continue
        surah, ayah = int(parts[0]), int(parts[1])
        page = v.get('page_number', 0)
        if page > 0:
            pages.setdefault(page, []).append((surah, ayah))

    for page in pages:
        pages[page].sort()

    return pages


def compute_font_size(cr, text, text_width, text_height, target_lines=15):
    """Binary search for font size that fills ~target_lines on the page."""
    lo, hi = 8.0, 60.0
    best_size = 16.0

    for _ in range(20):  # binary search iterations
        mid = (lo + hi) / 2.0

        layout = PangoCairo.create_layout(cr)
        desc = Pango.FontDescription.new()
        desc.set_family(FONT_FAMILY)
        desc.set_size(int(mid * Pango.SCALE))
        layout.set_font_description(desc)
        layout.set_alignment(Pango.Alignment.RIGHT)
        layout.set_justify(True)
        layout.set_auto_dir(True)
        layout.set_width(int(text_width * Pango.SCALE))
        layout.set_wrap(Pango.WrapMode.WORD_CHAR)
        layout.set_text(text, -1)

        line_count = layout.get_line_count()

        if line_count <= target_lines:
            best_size = mid
            lo = mid  # try larger
        else:
            hi = mid  # try smaller

    return best_size


def create_page_layout(cr, text, font_size, text_width):
    """Create a justified RTL Pango layout for a mushaf page."""
    layout = PangoCairo.create_layout(cr)

    desc = Pango.FontDescription.new()
    desc.set_family(FONT_FAMILY)
    desc.set_size(int(font_size * Pango.SCALE))
    layout.set_font_description(desc)

    layout.set_alignment(Pango.Alignment.RIGHT)
    layout.set_justify(True)
    layout.set_auto_dir(True)
    layout.set_width(int(text_width * Pango.SCALE))
    layout.set_wrap(Pango.WrapMode.WORD_CHAR)
    layout.set_text(text, -1)

    return layout


def extract_word_boxes(layout, offset_x, offset_y):
    """Extract per-word bounding boxes from a Pango layout using its iterator.
    Note: Pango get_index() returns byte offsets in UTF-8, not character offsets.
    """
    text = layout.get_text()
    text_bytes = text.encode('utf-8')

    # Collect cluster-level boxes
    clusters = []
    layout_iter = layout.get_iter()

    while True:
        char_ext = layout_iter.get_cluster_extents()
        log_rect = char_ext[1]
        x = log_rect.x / Pango.SCALE + offset_x
        y = log_rect.y / Pango.SCALE + offset_y
        w = log_rect.width / Pango.SCALE
        h = log_rect.height / Pango.SCALE

        byte_idx = layout_iter.get_index()
        if byte_idx < len(text_bytes) and w > 0 and h > 0:
            # Decode the character at this byte position
            char = text_bytes[byte_idx:byte_idx+4].decode('utf-8', errors='ignore')[:1]
            clusters.append({
                "byte_idx": byte_idx,
                "char": char,
                "x": x, "y": y, "w": w, "h": h,
            })

        if not layout_iter.next_cluster():
            break

    if not clusters:
        return []

    # Group clusters into words by splitting on spaces
    # Find word boundaries in byte space
    words = []
    current_word_clusters = []

    for cl in clusters:
        bi = cl["byte_idx"]
        if bi < len(text_bytes) and text_bytes[bi:bi+1] in (b' ', b'\n'):
            # Space: flush current word
            if current_word_clusters:
                words.append(current_word_clusters)
                current_word_clusters = []
        else:
            current_word_clusters.append(cl)

    if current_word_clusters:
        words.append(current_word_clusters)

    # Merge clusters in each word into a single bounding box
    result = []
    for word_clusters in words:
        if not word_clusters:
            continue
        # RTL: x coordinates go right-to-left
        min_x = min(c["x"] for c in word_clusters)
        min_y = min(c["y"] for c in word_clusters)
        max_x = max(c["x"] + c["w"] for c in word_clusters)
        max_y = max(c["y"] + c["h"] for c in word_clusters)

        # Get word text from byte range
        start_byte = word_clusters[0]["byte_idx"]
        end_byte = word_clusters[-1]["byte_idx"] + 4  # rough end
        end_byte = min(end_byte, len(text_bytes))
        decoded = text_bytes[start_byte:end_byte].decode('utf-8', errors='ignore').split()
        word_text = decoded[0] if decoded else ""

        if word_text:
            result.append({
                "text": word_text,
                "x": round(min_x),
                "y": round(min_y),
                "w": round(max_x - min_x),
                "h": round(max_y - min_y),
            })

    return result


def render_page(page_number, page_ayat, quran_text, output_dir, debug=False):
    """Render a single mushaf page with justified text filling 15 lines."""
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, PAGE_WIDTH, PAGE_HEIGHT)
    cr = cairo.Context(surface)

    # White background
    cr.set_source_rgb(1, 1, 1)
    cr.paint()

    # Margins
    margin_x = int(PAGE_WIDTH * MARGIN_X_FRAC)
    margin_top = int(PAGE_HEIGHT * MARGIN_TOP_FRAC)
    margin_bottom = int(PAGE_HEIGHT * MARGIN_BOTTOM_FRAC)
    text_width = PAGE_WIDTH - (2 * margin_x)
    text_height = PAGE_HEIGHT - margin_top - margin_bottom

    # Collect all text for this page
    page_text_parts = []
    ayat_on_page = []

    for surah, ayah in page_ayat:
        text = quran_text.get((surah, ayah), '')
        if text:
            page_text_parts.append(f"{text} {AYAH_MARKER}{ayah}")
            ayat_on_page.append((surah, ayah))

    full_text = " ".join(page_text_parts)

    if not full_text.strip():
        return None

    # Compute optimal font size to fill ~15 lines
    font_size = compute_font_size(cr, full_text, text_width, text_height, LINES_PER_PAGE)

    # Create layout
    cr.save()
    cr.translate(margin_x, margin_top)
    cr.set_source_rgb(0, 0, 0)

    layout = create_page_layout(cr, full_text, font_size, text_width)
    line_count = layout.get_line_count()

    # Vertically distribute: compute line spacing to fill text_height
    ink_rect, logical_rect = layout.get_pixel_extents()
    natural_height = logical_rect.height

    if natural_height > 0 and line_count > 1:
        # Set line spacing to fill the available height
        target_spacing = (text_height - natural_height) / line_count
        if target_spacing > 0:
            layout.set_line_spacing(1.0 + (target_spacing * Pango.SCALE) / layout.get_font_description().get_size())

    # Re-measure after spacing adjustment
    ink_rect, logical_rect = layout.get_pixel_extents()

    # Center vertically if text doesn't fill the page (e.g. short surahs)
    y_offset = 0
    if logical_rect.height < text_height * 0.8:
        y_offset = (text_height - logical_rect.height) // 2
        cr.translate(0, y_offset)

    PangoCairo.show_layout(cr, layout)

    # Extract word bounding boxes
    word_boxes = extract_word_boxes(layout, margin_x, margin_top + y_offset)

    # Debug overlay: draw word hitbox rectangles
    if debug and word_boxes:
        cr.set_source_rgba(1, 0, 0, 0.3)
        cr.set_line_width(1)
        for box in word_boxes:
            cr.rectangle(box["x"] - margin_x, box["y"] - margin_top - y_offset,
                         box["w"], box["h"])
            cr.stroke()

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
        "surah_start": ayat_on_page[0][0] if ayat_on_page else 0,
        "ayah_start": ayat_on_page[0][1] if ayat_on_page else 0,
        "surah_end": ayat_on_page[-1][0] if ayat_on_page else 0,
        "ayah_end": ayat_on_page[-1][1] if ayat_on_page else 0,
        "schema_version": "1.0.0",
        "image_width": PAGE_WIDTH,
        "image_height": PAGE_HEIGHT,
        "dpi": DPI,
        "font_size_pt": round(font_size, 1),
        "line_count": line_count,
        "words": word_boxes,
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

    layout = PangoCairo.create_layout(measure_cr)
    desc = Pango.FontDescription.new()
    desc.set_family(FONT_FAMILY)
    desc.set_size(int(FONT_SIZE_AYAH * Pango.SCALE))
    layout.set_font_description(desc)
    layout.set_alignment(Pango.Alignment.RIGHT)
    layout.set_auto_dir(True)
    layout.set_width(int((AYAH_WIDTH - 2 * AYAH_PADDING) * Pango.SCALE))
    layout.set_wrap(Pango.WrapMode.WORD)
    layout.set_text(text, -1)

    ink_rect, logical_rect = layout.get_pixel_extents()
    text_height = logical_rect.height + (2 * AYAH_PADDING)
    text_height = max(text_height, 80)

    # Actual render
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, AYAH_WIDTH, text_height)
    cr = cairo.Context(surface)

    cr.set_source_rgb(1, 1, 1)
    cr.paint()

    cr.set_source_rgb(0, 0, 0)
    cr.translate(AYAH_PADDING, AYAH_PADDING)

    layout = PangoCairo.create_layout(cr)
    desc = Pango.FontDescription.new()
    desc.set_family(FONT_FAMILY)
    desc.set_size(int(FONT_SIZE_AYAH * Pango.SCALE))
    layout.set_font_description(desc)
    layout.set_alignment(Pango.Alignment.RIGHT)
    layout.set_auto_dir(True)
    layout.set_width(int((AYAH_WIDTH - 2 * AYAH_PADDING) * Pango.SCALE))
    layout.set_wrap(Pango.WrapMode.WORD)
    layout.set_text(text, -1)

    PangoCairo.show_layout(cr, layout)

    # Extract word boxes
    word_boxes = extract_word_boxes(layout, AYAH_PADDING, AYAH_PADDING)

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
        "words": word_boxes,
    }

    manifest_path = output_dir / "manifests" / f"ayah_{surah:03d}_{ayah:03d}.manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return ayah_path


def render_golden_pages(quran_text, page_mapping, debug=False):
    """Render the 5 golden test pages."""
    print("\n--- Golden Test Pages ---")

    golden_output = GOLDEN_DIR
    golden_output.mkdir(parents=True, exist_ok=True)

    for page_num in GOLDEN_PAGES:
        ayat = page_mapping.get(page_num, [])
        if not ayat:
            print(f"  Page {page_num}: no page mapping available, skipping")
            continue

        path = render_page(page_num, ayat, quran_text, golden_output, debug=debug)
        if path:
            print(f"  Page {page_num}: {path} ({len(ayat)} ayat)")

            # Also render individual ayah strips for first 5 ayat
            for surah, ayah_num in ayat[:5]:
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
    parser.add_argument("--debug", action="store_true", help="Draw word hitbox debug overlay")
    args = parser.parse_args()

    print("=" * 60)
    print("Miftah — Gate B: Arabic Rendering Pipeline")
    print("=" * 60)

    # Check font
    font_path = find_font()
    if not font_path:
        print("\nERROR: KFGQPC font not found!")
        print(f"Place the font file in: {FONT_DIR}/")
        sys.exit(1)

    print(f"\nFont: {font_path}")
    font_ok = setup_font(font_path)
    print(f"Font registered: {'OK' if font_ok else 'FALLBACK'}")

    # Load data
    print("\nLoading Quran text...")
    quran_text = load_quran_text()
    print(f"  Loaded {len(quran_text)} verses")

    page_mapping = load_page_mapping()
    print(f"  Page mapping: {len(page_mapping)} pages")

    if args.golden_only or (not args.page and not args.surah):
        render_golden_pages(quran_text, page_mapping, debug=args.debug)
    elif args.page:
        ayat = page_mapping.get(args.page, [])
        if ayat:
            path = render_page(args.page, ayat, quran_text, ASSETS_DIR, debug=args.debug)
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
