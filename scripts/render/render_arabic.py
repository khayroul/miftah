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
MARGIN_X_FRAC = 0.08    # increased from 0.07 for Arabic diacritical overflow
MARGIN_TOP_FRAC = 0.05
MARGIN_BOTTOM_FRAC = 0.05

# Ayah strip rendering
AYAH_WIDTH = 2400   # px at 300 DPI (wider for readability)
AYAH_PADDING = 40   # px

# Font settings
FONT_FAMILY = "KFGQPC Uthman Taha Naskh"
FONT_SIZE_AYAH = 32  # pt for ayah strips (larger, one ayah)
FONT_SIZE_PAGE_MAX = 48  # pt cap for page rendering (dense pages ~48pt)

# Quran page layout (standard Madinah mushaf: 15 lines per page)
LINES_PER_PAGE = 15

# Golden test pages per BUILD_PLAN
GOLDEN_PAGES = [1, 2, 77, 489, 604]

# Ayah end marker — we use the real Unicode ۝ character in text so Pango allocates space,
# then overpaint the fallback glyph with a custom Cairo-drawn ornamental circle + number
AYAH_MARKER_CHAR = "\u06DD"  # End of Ayah mark (enclosing, digits go inside)

# Bismillah (QPC orthography, matching our text source)
BISMILLAH_QPC = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ"

# Surahs that do NOT get Bismillah: At-Tawbah (9)
# Al-Fatihah (1) already has Bismillah as verse 1 in the text
NO_BISMILLAH_SURAHS = {9}

# Eastern Arabic digits for ayah numbers inside the stop mark
EASTERN_DIGITS = "٠١٢٣٤٥٦٧٨٩"

def to_eastern_arabic(n):
    """Convert integer to Eastern Arabic numeral string."""
    return "".join(EASTERN_DIGITS[int(d)] for d in str(n))


def draw_ayah_marker(cr, cx, cy, radius, number_str, font_size):
    """Draw a custom end-of-ayah marker: ornamental circle with number inside.

    Args:
        cr: Cairo context
        cx, cy: Center position
        radius: Radius of the marker circle
        number_str: Eastern Arabic digit string
        font_size: Font size for the number
    """
    # Draw ornamental circle (double ring)
    cr.save()
    cr.set_source_rgb(0, 0, 0)
    cr.set_line_width(1.5)

    # Outer circle
    cr.arc(cx, cy, radius, 0, 2 * math.pi)
    cr.stroke()

    # Inner circle (slightly smaller)
    cr.arc(cx, cy, radius * 0.78, 0, 2 * math.pi)
    cr.stroke()

    # Small decorative dots at cardinal points
    dot_r = radius * 0.08
    for angle in [0, math.pi/2, math.pi, 3*math.pi/2]:
        dx = cx + radius * 0.89 * math.cos(angle)
        dy = cy + radius * 0.89 * math.sin(angle)
        cr.arc(dx, dy, dot_r, 0, 2 * math.pi)
        cr.fill()

    # Draw number centered inside using Cairo toy text API
    # (Avoids PangoCairo.create_layout which corrupts font resolution state
    #  when called with a different font size inside a per-line rendering loop)
    num_font_size = font_size * 0.55
    cr.select_font_face(FONT_FAMILY, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    cr.set_font_size(num_font_size)
    extents = cr.text_extents(number_str)
    tx = cx - extents.width / 2 - extents.x_bearing
    ty = cy - extents.height / 2 - extents.y_bearing
    cr.move_to(tx, ty)
    cr.show_text(number_str)

    cr.restore()


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


def load_mushaf_layout(page_number):
    """Load mushaf line-break data from zonetecde/mushaf-layout."""
    layout_path = DATA_DIR / "mushaf-layout" / "mushaf" / f"page-{page_number:03d}.json"
    if not layout_path.exists():
        return None
    with open(layout_path) as f:
        return json.load(f)


def build_mushaf_page_lines(page_number, page_ayat, quran_text):
    """Build per-line text using mushaf layout line breaks with our QPC tokens.

    Returns (lines, marker_ayah_numbers, ayat_on_page) or None.
    """
    layout_data = load_mushaf_layout(page_number)
    if not layout_data:
        return None

    # Pre-split verse texts into tokens
    verse_tokens = {}
    for surah, ayah in page_ayat:
        text = quran_text.get((surah, ayah), '')
        if text:
            verse_tokens[(surah, ayah)] = text.split()

    lines = []
    marker_ayah_numbers = []
    ayat_on_page = []

    for line_obj in layout_data.get('lines', []):
        line_type = line_obj.get('type', 'text')

        if line_type == 'surah-header':
            lines.append('')  # Placeholder (decorative header rendered later)
            continue

        if line_type == 'basmala':
            lines.append(BISMILLAH_QPC)
            continue

        # Text line: map word locations to our QPC tokens
        line_tokens = []
        for w in line_obj.get('words', []):
            parts = w['location'].split(':')
            if len(parts) != 3:
                continue
            s, a, p = int(parts[0]), int(parts[1]), int(parts[2])

            tokens = verse_tokens.get((s, a), [])
            if p <= len(tokens):
                line_tokens.append(tokens[p - 1])

            if (s, a) not in ayat_on_page:
                ayat_on_page.append((s, a))

            # Last word of verse → add ayah end marker
            if p == len(tokens):
                marker_text = AYAH_MARKER_CHAR + to_eastern_arabic(a)
                line_tokens.append(marker_text)
                marker_ayah_numbers.append(a)

        lines.append(' '.join(line_tokens))

    return lines, marker_ayah_numbers, ayat_on_page


def compute_font_size_for_lines(cr, lines, text_width, text_height):
    """Find largest font size where every line fits within text_width and
    line height fits within text_height / LINES_PER_PAGE, capped at FONT_SIZE_PAGE_MAX."""
    lo, hi = 8.0, FONT_SIZE_PAGE_MAX
    best_size = 16.0
    max_line_h = text_height / LINES_PER_PAGE

    non_empty = [l for l in lines if l.strip()]
    if not non_empty:
        return best_size

    for _ in range(20):
        mid = (lo + hi) / 2.0
        fits = True

        for line_text in non_empty:
            layout = PangoCairo.create_layout(cr)
            desc = Pango.FontDescription.new()
            desc.set_family(FONT_FAMILY)
            desc.set_size(int(mid * Pango.SCALE))
            layout.set_font_description(desc)
            layout.set_auto_dir(True)
            layout.set_width(int(text_width * Pango.SCALE))
            layout.set_wrap(Pango.WrapMode.WORD)
            layout.set_text(line_text, -1)

            # Check horizontal: no line should wrap
            if layout.get_line_count() > 1:
                fits = False
                break

            # Check vertical: line height must fit the 15-line grid
            _, logical = layout.get_pixel_extents()
            if logical.height > max_line_h:
                fits = False
                break

        if fits:
            best_size = mid
            lo = mid
        else:
            hi = mid

    return best_size


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

    # Try mushaf layout for accurate line breaks (matches Madinah mushaf)
    mushaf_result = build_mushaf_page_lines(page_number, page_ayat, quran_text)

    if mushaf_result:
        page_lines, marker_ayah_numbers, ayat_on_page = mushaf_result

        # Per-line rendering with forced line breaks
        font_size = compute_font_size_for_lines(cr, page_lines, text_width, text_height)
        line_height = text_height / LINES_PER_PAGE
        word_boxes = []
        marker_idx = 0
        marker_radius = font_size * 0.55
        line_count = len([l for l in page_lines if l.strip()])

        # Two-pass rendering: text first, then markers.
        # Rendering any text (PangoCairo or Cairo toy API) inside the per-line
        # PangoCairo loop corrupts font resolution state, causing subsequent
        # lines to render at wrong sizes. Splitting into passes avoids this.

        # Collect marker positions and word boxes during pass 1
        marker_positions = []  # (abs_cx, abs_cy, ayah_num)
        marker_idx = 0

        # --- Pass 1: Render all text lines (PangoCairo) ---
        cr.save()
        cr.translate(margin_x, margin_top)
        cr.set_source_rgb(0, 0, 0)

        for i, line_text in enumerate(page_lines):
            if not line_text.strip():
                continue

            y_pos = i * line_height

            # Create per-line layout
            is_basmala = (line_text == BISMILLAH_QPC)
            layout = PangoCairo.create_layout(cr)
            desc = Pango.FontDescription.new()
            desc.set_family(FONT_FAMILY)
            desc.set_size(int(font_size * Pango.SCALE))
            layout.set_font_description(desc)
            layout.set_auto_dir(True)
            layout.set_width(int(text_width * Pango.SCALE))
            if is_basmala:
                layout.set_alignment(Pango.Alignment.CENTER)
            else:
                layout.set_alignment(Pango.Alignment.RIGHT)
                layout.set_justify(True)
                layout.set_justify_last_line(True)
            layout.set_text(line_text, -1)

            cr.save()
            cr.translate(0, y_pos)
            PangoCairo.show_layout(cr, layout)

            # Locate ayah markers on this line (positions only, no drawing yet)
            if AYAH_MARKER_CHAR in line_text:
                text_bytes = line_text.encode('utf-8')

                for ch_i, ch in enumerate(line_text):
                    if ch != AYAH_MARKER_CHAR:
                        continue
                    if marker_idx >= len(marker_ayah_numbers):
                        break

                    ayah_num = marker_ayah_numbers[marker_idx]
                    marker_idx += 1

                    byte_start = len(line_text[:ch_i].encode('utf-8'))
                    digit_str = to_eastern_arabic(ayah_num)
                    end_char = ch_i + 1 + len(digit_str)
                    byte_end = min(len(line_text[:end_char].encode('utf-8')), len(text_bytes))

                    start_rect = layout.index_to_pos(byte_start)
                    end_rect = layout.index_to_pos(byte_end)

                    sx = start_rect.x / Pango.SCALE
                    ex = end_rect.x / Pango.SCALE
                    sy = start_rect.y / Pango.SCALE
                    sh = start_rect.height / Pango.SCALE

                    left_x = min(sx, ex)
                    right_x = max(sx, ex)
                    if right_x - left_x < 2:
                        right_x = left_x + marker_radius * 2

                    # Store absolute position (add margin + line offset)
                    abs_cx = margin_x + (left_x + right_x) / 2
                    abs_cy = margin_top + y_pos + sy + sh / 2

                    marker_positions.append((abs_cx, abs_cy, ayah_num))

            # Extract word boxes for this line
            line_boxes = extract_word_boxes(layout, margin_x, margin_top + y_pos)
            line_boxes = [w for w in line_boxes if AYAH_MARKER_CHAR not in w.get('text', '')]
            word_boxes.extend(line_boxes)

            if debug and line_boxes:
                cr.set_source_rgba(1, 0, 0, 0.3)
                cr.set_line_width(1)
                for box in line_boxes:
                    cr.rectangle(box["x"] - margin_x, box["y"] - margin_top - y_pos,
                                 box["w"], box["h"])
                    cr.stroke()

            cr.restore()

        cr.restore()

        # --- Pass 2: Draw ayah markers (uses absolute coordinates) ---
        for abs_cx, abs_cy, ayah_num in marker_positions:
            # White circle to overpaint fallback glyph
            cr.save()
            cr.set_source_rgb(1, 1, 1)
            cr.arc(abs_cx, abs_cy, marker_radius * 1.2, 0, 2 * math.pi)
            cr.fill()
            cr.restore()

            draw_ayah_marker(cr, abs_cx, abs_cy, marker_radius,
                             to_eastern_arabic(ayah_num), font_size)
    else:
        # Fallback: auto-wrap when mushaf layout is unavailable
        page_text_parts = []
        ayat_on_page = []
        marker_ayah_numbers = []
        prev_surah = None

        for surah, ayah in page_ayat:
            text = quran_text.get((surah, ayah), '')
            if text:
                if ayah == 1 and surah != prev_surah and surah not in NO_BISMILLAH_SURAHS and surah != 1:
                    page_text_parts.append(BISMILLAH_QPC)
                page_text_parts.append(text)
                marker_text = AYAH_MARKER_CHAR + to_eastern_arabic(ayah)
                page_text_parts.append(marker_text)
                marker_ayah_numbers.append(ayah)
                ayat_on_page.append((surah, ayah))
                prev_surah = surah

        full_text = " ".join(page_text_parts)
        if not full_text.strip():
            return None

        font_size = compute_font_size(cr, full_text, text_width, text_height, LINES_PER_PAGE)

        cr.save()
        cr.translate(margin_x, margin_top)
        cr.set_source_rgb(0, 0, 0)

        layout = create_page_layout(cr, full_text, font_size, text_width)
        line_count = layout.get_line_count()

        ink_rect, logical_rect = layout.get_pixel_extents()
        natural_height = logical_rect.height
        if natural_height > 0 and line_count > 1:
            target_spacing = (text_height - natural_height) / line_count
            if target_spacing > 0:
                layout.set_line_spacing(1.0 + (target_spacing * Pango.SCALE) / layout.get_font_description().get_size())

        ink_rect, logical_rect = layout.get_pixel_extents()
        y_offset = 0
        if logical_rect.height < text_height * 0.8:
            y_offset = (text_height - logical_rect.height) // 2
            cr.translate(0, y_offset)

        PangoCairo.show_layout(cr, layout)

        # Draw markers (fallback path)
        if marker_ayah_numbers:
            text_bytes = full_text.encode('utf-8')
            marker_radius = font_size * 0.55
            m_idx = 0
            for ci, ch in enumerate(full_text):
                if ch != AYAH_MARKER_CHAR:
                    continue
                if m_idx >= len(marker_ayah_numbers):
                    break
                ayah_num = marker_ayah_numbers[m_idx]
                m_idx += 1
                byte_start = len(full_text[:ci].encode('utf-8'))
                digit_str = to_eastern_arabic(ayah_num)
                end_char = ci + 1 + len(digit_str)
                byte_end = min(len(full_text[:end_char].encode('utf-8')), len(text_bytes))
                start_rect = layout.index_to_pos(byte_start)
                end_rect = layout.index_to_pos(byte_end)
                sx, ex = start_rect.x / Pango.SCALE, end_rect.x / Pango.SCALE
                sy, sh = start_rect.y / Pango.SCALE, start_rect.height / Pango.SCALE
                left_x, right_x = min(sx, ex), max(sx, ex)
                if right_x - left_x < 2:
                    right_x = left_x + marker_radius * 2
                cx, cy = (left_x + right_x) / 2, sy + sh / 2
                cr.save()
                cr.set_source_rgb(1, 1, 1)
                cr.arc(cx, cy, marker_radius * 1.2, 0, 2 * math.pi)
                cr.fill()
                cr.restore()
                draw_ayah_marker(cr, cx, cy, marker_radius, to_eastern_arabic(ayah_num), font_size)

        word_boxes = extract_word_boxes(layout, margin_x, margin_top + y_offset)
        word_boxes = [w for w in word_boxes if AYAH_MARKER_CHAR not in w.get('text', '')]

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
    parser.add_argument("--pages", type=str, help="Render page range, e.g. '1-61' for Juz 1-3")
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

    if args.golden_only or (not args.page and not args.pages and not args.surah):
        render_golden_pages(quran_text, page_mapping, debug=args.debug)
    elif args.pages:
        # Parse range like "1-61"
        parts = args.pages.split('-')
        start_page = int(parts[0])
        end_page = int(parts[1]) if len(parts) > 1 else start_page
        print(f"\n--- Rendering pages {start_page}-{end_page} ---")
        rendered = 0
        for page_num in range(start_page, end_page + 1):
            ayat = page_mapping.get(page_num, [])
            if not ayat:
                continue
            path = render_page(page_num, ayat, quran_text, ASSETS_DIR, debug=args.debug)
            if path:
                rendered += 1
                if rendered % 10 == 0:
                    print(f"  Rendered {rendered} pages (current: {page_num})")
        print(f"  Done: {rendered} pages rendered to {ASSETS_DIR / 'pages'}")
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
