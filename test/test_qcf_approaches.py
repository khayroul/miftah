#!/usr/bin/env python3
"""
Test 3 approaches for rendering QCF V2 glyphs without HarfBuzz interference.

Approach 1: Pango + font features disabled (-liga,-calt,-ccmp,-rlig)
Approach 2: Cairo glyph API — bypass Pango entirely, use show_glyphs()
Approach 3: Cairo + FreeType — use freetype-py for glyph lookup + Cairo rendering
"""

import json
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
QCF_FONT_DIR = PROJECT_ROOT / "assets" / "fonts" / "qcf-v2"
OUT_DIR = PROJECT_ROOT / "test"

PAGE_NUM = 6
FONT_FILE = QCF_FONT_DIR / f"QCF2_P{PAGE_NUM:03d}.TTF"

# Load page layout
with open(DATA_DIR / "mushaf-layout" / "mushaf" / f"page-{PAGE_NUM:03d}.json") as f:
    layout_data = json.load(f)

# Extract text lines with qpcV2 glyphs
text_lines = []
for obj in layout_data.get("lines", []):
    if obj["type"] == "text":
        words = []
        for w in obj.get("words", []):
            words.append(w.get("qpcV2", ""))
        text_lines.append(words)

print(f"Page {PAGE_NUM}: {len(text_lines)} text lines")
for i, wl in enumerate(text_lines):
    print(f"  Line {i+1}: {len(wl)} words — {' '.join(wl)}")

# ============================================================
# APPROACH 1: Pango + font features disabled
# ============================================================
def test_pango_features():
    """Try Pango with all shaping features disabled."""
    try:
        import gi
        gi.require_version('Pango', '1.0')
        gi.require_version('PangoCairo', '1.0')
        from gi.repository import Pango, PangoCairo
        import cairo
    except Exception as e:
        print(f"  SKIP: {e}")
        return

    W, H = 1200, 1920
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()

    layout = PangoCairo.create_layout(ctx)

    # QCF V2 font
    fd = Pango.FontDescription.new()
    fd.set_family(f"QCF2{PAGE_NUM:03d}")
    fd.set_absolute_size(55 * Pango.SCALE)
    layout.set_font_description(fd)

    # Disable ALL shaping features
    attr_list = Pango.AttrList()
    # Disable common features
    features = "-liga,-calt,-ccmp,-rlig,-clig,-kern,-mark,-mkmk,-init,-medi,-fina,-isol"
    attr_list.insert(Pango.attr_font_features_new(features))
    # Also try setting language to English to avoid Arabic shaping
    attr_list.insert(Pango.attr_language_new(Pango.Language.from_string("en")))
    layout.set_attributes(attr_list)

    ctx.set_source_rgb(0.1, 0.08, 0.06)

    y = 100
    for words in text_lines:
        line_text = " ".join(words)
        layout.set_text(line_text, -1)
        layout.set_width(int((W - 80) * Pango.SCALE))
        layout.set_alignment(Pango.Alignment.RIGHT)
        layout.set_justify(True)

        ctx.move_to(40, y)
        PangoCairo.show_layout(ctx, layout)

        y += 110

    out = OUT_DIR / "approach1_pango_features.png"
    surface.write_to_png(str(out))
    print(f"  Saved: {out}")


# ============================================================
# APPROACH 2: Cairo show_glyphs — bypass Pango entirely
# ============================================================
def test_cairo_glyphs():
    """Use Cairo's low-level glyph API, bypassing Pango/HarfBuzz entirely.
    Use FreeType via cairo's font face to map codepoints to glyph IDs."""
    try:
        import cairo
    except Exception as e:
        print(f"  SKIP: {e}")
        return

    W, H = 1200, 1920
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()

    # Load font via Cairo's FreeType font face
    font_face = cairo.ToyFontFace(f"QCF2{PAGE_NUM:03d}")
    ctx.set_font_face(font_face)
    ctx.set_font_size(55)

    ctx.set_source_rgb(0.1, 0.08, 0.06)

    y = 150
    for words in text_lines:
        line_text = " ".join(words)
        # Cairo toy font: show_text
        # This still uses font's cmap, no reshaping
        ctx.move_to(40, y)
        ctx.show_text(line_text)
        y += 110

    out = OUT_DIR / "approach2_cairo_toy.png"
    surface.write_to_png(str(out))
    print(f"  Saved: {out}")


# ============================================================
# APPROACH 3: freetype-py + cairo for precise glyph rendering
# ============================================================
def test_freetype_cairo():
    """Use freetype-py to get glyph indices, then render with cairo show_glyphs."""
    try:
        import freetype
        import cairo
    except ImportError as e:
        print(f"  SKIP (need freetype-py): {e}")
        return

    W, H = 1200, 1920
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()

    # Load font via freetype for cmap lookup
    face = freetype.Face(str(FONT_FILE))
    face.set_char_size(55 * 64)  # 55pt in 26.6 fixed point

    # Also set up Cairo font face from the same font file
    # Use FT font face in Cairo
    ft_face = cairo.FontFace.__new__(cairo.FontFace)
    # We need cairo-ft bindings... let's try a different approach.

    # Alternative: Use Cairo's user font or toy font with manual glyph placement
    # Actually, let's use cairocffi + manual glyph rendering if available

    # Simpler approach: use PIL but with subpixel antialiasing
    # Or: use cairo's select_font_face with the family name
    ctx.select_font_face(f"QCF2{PAGE_NUM:03d}", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(55)

    ctx.set_source_rgb(0.1, 0.08, 0.06)

    # Build glyph arrays from codepoints
    y = 150
    MARGIN_X = 40
    text_width = W - 2 * MARGIN_X

    for words in text_lines:
        # Measure each word width
        word_widths = []
        word_glyphs_list = []  # list of (glyph_index, advance_x) per word
        for wtext in words:
            # Get glyph indices via freetype cmap
            glyphs_for_word = []
            for ch in wtext:
                glyph_idx = face.get_char_index(ord(ch))
                face.load_glyph(glyph_idx)
                adv = face.glyph.advance.x / 64.0  # Convert from 26.6 to pixels
                glyphs_for_word.append((glyph_idx, adv))
            word_w = sum(a for _, a in glyphs_for_word)
            word_widths.append(word_w)
            word_glyphs_list.append(glyphs_for_word)

        total_w = sum(word_widths)
        n_gaps = len(words) - 1
        if n_gaps > 0 and total_w < text_width:
            gap = (text_width - total_w) / n_gaps
        else:
            gap = 10

        # RTL: start from right
        cx = W - MARGIN_X
        cairo_glyphs = []
        for j, word_glyphs in enumerate(word_glyphs_list):
            ww = word_widths[j]
            wx = cx - ww
            gx = wx
            for glyph_idx, adv in word_glyphs:
                cairo_glyphs.append((glyph_idx, gx, y))
                gx += adv
            cx -= ww + gap

        ctx.show_glyphs(cairo_glyphs)
        y += 110

    out = OUT_DIR / "approach3_freetype_cairo.png"
    surface.write_to_png(str(out))
    print(f"  Saved: {out}")


# ============================================================
# APPROACH 4: Cairo FreeType font face (cffi-based)
# ============================================================
def test_cairo_ft():
    """Use cairo's native FreeType font face binding via ctypes to bypass shaping."""
    try:
        import cairo
        import ctypes
        import ctypes.util
    except ImportError as e:
        print(f"  SKIP: {e}")
        return

    # Try to find and use cairo's FreeType font face
    # cairo_ft_font_face_create_for_ft_face requires libcairo and libfreetype

    # Load libfreetype
    ft_lib_path = ctypes.util.find_library("freetype")
    if not ft_lib_path:
        print("  SKIP: libfreetype not found")
        return

    ft_lib = ctypes.cdll.LoadLibrary(ft_lib_path)

    # Load libcairo
    cairo_lib_path = ctypes.util.find_library("cairo")
    if not cairo_lib_path:
        print("  SKIP: libcairo not found")
        return

    cairo_lib = ctypes.cdll.LoadLibrary(cairo_lib_path)

    # Initialize FreeType
    ft_library = ctypes.c_void_p()
    if ft_lib.FT_Init_FreeType(ctypes.byref(ft_library)) != 0:
        print("  SKIP: FT_Init_FreeType failed")
        return

    # Load font face
    ft_face = ctypes.c_void_p()
    font_path = str(FONT_FILE).encode('utf-8')
    if ft_lib.FT_New_Face(ft_library, font_path, 0, ctypes.byref(ft_face)) != 0:
        print(f"  SKIP: FT_New_Face failed for {FONT_FILE}")
        return

    # Create Cairo font face from FT face
    # cairo_ft_font_face_create_for_ft_face(ft_face, load_flags)
    cairo_lib.cairo_ft_font_face_create_for_ft_face.restype = ctypes.c_void_p
    cairo_lib.cairo_ft_font_face_create_for_ft_face.argtypes = [ctypes.c_void_p, ctypes.c_int]

    cairo_font_face_ptr = cairo_lib.cairo_ft_font_face_create_for_ft_face(ft_face, 0)
    if not cairo_font_face_ptr:
        print("  SKIP: cairo_ft_font_face_create_for_ft_face failed")
        return

    W, H = 1200, 1920
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()

    # Set the font face on context via ctypes
    # We need to get the native cairo_t pointer from pycairo
    # pycairo Context object has a _pointer attribute or we can use ctypes
    # Actually, pycairo's Context wraps a cairo_t*

    # Use the internal pointer
    try:
        # pycairo stores the pointer
        ctx_ptr = ctypes.c_void_p.from_address(id(ctx) + object.__sizeof__(ctx) - 8)
        # This is fragile... let's try a different approach
        pass
    except:
        pass

    # Alternative: just use cairocffi if available
    print("  Note: Direct ctypes approach is fragile. Trying cairocffi...")
    try:
        import cairocffi
        from cairocffi import ffi as cffi_ffi

        surface2 = cairocffi.ImageSurface(cairocffi.FORMAT_ARGB32, W, H)
        ctx2 = cairocffi.Context(surface2)
        ctx2.set_source_rgb(1, 1, 1)
        ctx2.paint()

        # Create FT font face in cairocffi
        # cairocffi has cairo_ft_font_face_create_for_ft_face
        from cairocffi import constants
        ft_font_face = cairocffi.ffi.gc(
            cairocffi.cairo.cairo_ft_font_face_create_for_ft_face(ft_face, 0),
            cairocffi.cairo.cairo_font_face_destroy
        )
        cairocffi.cairo.cairo_set_font_face(ctx2._pointer, ft_font_face)
        cairocffi.cairo.cairo_set_font_size(ctx2._pointer, 55.0)

        ctx2.set_source_rgb(0.1, 0.08, 0.06)

        y = 150
        for words in text_lines:
            line_text = " ".join(words)
            ctx2.move_to(40, y)
            ctx2.show_text(line_text)
            y += 110

        out = OUT_DIR / "approach4_cairocffi_ft.png"
        surface2.write_to_png(str(out))
        print(f"  Saved: {out}")
        return

    except ImportError:
        print("  SKIP: cairocffi not available")

    # Clean up
    ft_lib.FT_Done_Face(ft_face)
    ft_lib.FT_Done_FreeType(ft_library)
    print("  Done (no output — need cairocffi or better ctypes binding)")


# ============================================================
# APPROACH 5: Pango per-word rendering (no full-line shaping)
# ============================================================
def test_pango_per_word():
    """Render each word separately with Pango to limit shaping scope."""
    try:
        import gi
        gi.require_version('Pango', '1.0')
        gi.require_version('PangoCairo', '1.0')
        from gi.repository import Pango, PangoCairo
        import cairo
    except Exception as e:
        print(f"  SKIP: {e}")
        return

    W, H = 1200, 1920
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()

    layout = PangoCairo.create_layout(ctx)

    fd = Pango.FontDescription.new()
    fd.set_family(f"QCF2{PAGE_NUM:03d}")
    fd.set_absolute_size(55 * Pango.SCALE)
    layout.set_font_description(fd)

    # Disable shaping
    attr_list = Pango.AttrList()
    attr_list.insert(Pango.attr_font_features_new(
        "-liga,-calt,-ccmp,-rlig,-clig,-kern,-mark,-mkmk,-init,-medi,-fina,-isol"
    ))
    layout.set_attributes(attr_list)

    ctx.set_source_rgb(0.1, 0.08, 0.06)
    MARGIN_X = 40
    text_width = W - 2 * MARGIN_X

    y = 100
    for words in text_lines:
        # Measure each word separately
        word_widths = []
        for wtext in words:
            layout.set_text(wtext, -1)
            layout.set_width(-1)
            w_ext, _ = layout.get_pixel_size()
            word_widths.append(w_ext)

        total_w = sum(word_widths)
        n_gaps = len(words) - 1
        if n_gaps > 0 and total_w < text_width:
            gap = (text_width - total_w) / n_gaps
        else:
            gap = 10

        # RTL: start from right
        cx = W - MARGIN_X
        for j, wtext in enumerate(words):
            ww = word_widths[j]
            wx = cx - ww
            layout.set_text(wtext, -1)
            layout.set_width(-1)
            ctx.move_to(wx, y)
            PangoCairo.show_layout(ctx, layout)
            cx -= ww + gap

        y += 110

    out = OUT_DIR / "approach5_pango_per_word.png"
    surface.write_to_png(str(out))
    print(f"  Saved: {out}")


# ============================================================
# Run all
# ============================================================
if __name__ == "__main__":
    print("\n=== APPROACH 1: Pango + font features disabled ===")
    test_pango_features()

    print("\n=== APPROACH 2: Cairo toy font (show_text) ===")
    test_cairo_glyphs()

    print("\n=== APPROACH 3: FreeType + Cairo show_glyphs ===")
    test_freetype_cairo()

    print("\n=== APPROACH 4: Cairo FT font face (cairocffi) ===")
    test_cairo_ft()

    print("\n=== APPROACH 5: Pango per-word (limited shaping) ===")
    test_pango_per_word()

    print("\n=== All tests done ===")
