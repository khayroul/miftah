#!/usr/bin/env python3
"""
Extract per-ayah and per-word assets from official Quran.com iOS page images.

Inputs:
  - hafs_1405 images_1920/width_1920/pageNNN.png
  - ayahinfo_1920.db (glyph bounding boxes)

Outputs:
  - assets/ayat/ayah_{SSS}_{AAA}.png
  - assets/manifests/ayah_{SSS}_{AAA}.manifest.json
  - assets/words/word_{WWWWW}.png   (WWWWW = glyph_id, zero-padded to width 5)
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

TOTAL_PAGES = 604

DEFAULT_SOURCE_ROOT = Path("/tmp/quran-ios/Example/QuranEngineApp/Resources/hafs_1405")
DEFAULT_IMAGES_DIR = DEFAULT_SOURCE_ROOT / "images_1920" / "width_1920"
DEFAULT_DB_PATH = DEFAULT_SOURCE_ROOT / "images_1920" / "databases" / "ayahinfo_1920.db"

DEFAULT_AYAT_DIR = PROJECT_ROOT / "assets" / "ayat"
DEFAULT_WORDS_DIR = PROJECT_ROOT / "assets" / "words"
DEFAULT_MANIFESTS_DIR = PROJECT_ROOT / "assets" / "manifests"


@dataclass(frozen=True)
class GlyphRow:
    glyph_id: int
    page_number: int
    surah: int
    ayah: int
    position: int
    x0: int
    x1: int
    y0: int
    y1: int

    @property
    def width(self) -> int:
        return self.x1 - self.x0

    @property
    def height(self) -> int:
        return self.y1 - self.y0


def parse_pages_spec(spec: str) -> list[int]:
    pages: set[int] = set()
    for part in spec.split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            start_str, end_str = token.split("-", 1)
            start = int(start_str.strip())
            end = int(end_str.strip())
            if start > end:
                start, end = end, start
            for page in range(start, end + 1):
                pages.add(page)
        else:
            pages.add(int(token))

    valid = sorted(page for page in pages if 1 <= page <= TOTAL_PAGES)
    if not valid:
        raise ValueError("No valid pages in --pages.")
    return valid


def clamp_crop_box(
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    width: int,
    height: int,
    padding: int,
) -> tuple[int, int, int, int]:
    left = max(0, x0 - padding)
    top = max(0, y0 - padding)
    right = min(width, x1 + padding)
    bottom = min(height, y1 + padding)
    return left, top, right, bottom


def ensure_paths(images_dir: Path, db_path: Path) -> None:
    if not images_dir.exists():
        raise FileNotFoundError(f"Images dir not found: {images_dir}")
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")


def fetch_page_glyphs(conn: sqlite3.Connection, page: int) -> list[GlyphRow]:
    query = """
        SELECT
            glyph_id,
            page_number,
            sura_number,
            ayah_number,
            position,
            min_x,
            max_x,
            min_y,
            max_y
        FROM glyphs
        WHERE page_number = ?
        ORDER BY sura_number ASC, ayah_number ASC, position ASC, glyph_id ASC
    """
    rows = conn.execute(query, (page,)).fetchall()
    return [
        GlyphRow(
            glyph_id=int(row["glyph_id"]),
            page_number=int(row["page_number"]),
            surah=int(row["sura_number"]),
            ayah=int(row["ayah_number"]),
            position=int(row["position"]),
            x0=int(row["min_x"]),
            x1=int(row["max_x"]),
            y0=int(row["min_y"]),
            y1=int(row["max_y"]),
        )
        for row in rows
    ]


def save_word_crop(
    page_img: Image.Image,
    glyph: GlyphRow,
    words_dir: Path,
    padding: int,
    overwrite: bool,
) -> bool:
    if glyph.width <= 0 or glyph.height <= 0:
        return False

    out_path = words_dir / f"word_{glyph.glyph_id:05d}.png"
    if out_path.exists() and not overwrite:
        return True

    crop_box = clamp_crop_box(
        glyph.x0,
        glyph.y0,
        glyph.x1,
        glyph.y1,
        page_img.width,
        page_img.height,
        padding,
    )
    crop = page_img.crop(crop_box)
    crop.save(out_path, format="PNG")
    return True


def save_ayah_asset_and_manifest(
    page_img: Image.Image,
    surah: int,
    ayah: int,
    glyphs: list[GlyphRow],
    ayat_dir: Path,
    manifests_dir: Path,
    padding: int,
) -> bool:
    valid_glyphs = [glyph for glyph in glyphs if glyph.width > 0 and glyph.height > 0]
    if not valid_glyphs:
        return False

    x0 = min(glyph.x0 for glyph in valid_glyphs)
    y0 = min(glyph.y0 for glyph in valid_glyphs)
    x1 = max(glyph.x1 for glyph in valid_glyphs)
    y1 = max(glyph.y1 for glyph in valid_glyphs)

    crop_left, crop_top, crop_right, crop_bottom = clamp_crop_box(
        x0,
        y0,
        x1,
        y1,
        page_img.width,
        page_img.height,
        padding,
    )
    crop = page_img.crop((crop_left, crop_top, crop_right, crop_bottom))

    ayah_path = ayat_dir / f"ayah_{surah:03d}_{ayah:03d}.png"
    crop.save(ayah_path, format="PNG")

    manifest_words = []
    for glyph in sorted(valid_glyphs, key=lambda item: (item.position, item.glyph_id)):
        manifest_words.append(
            {
                "word_id": glyph.glyph_id,
                "word_position": glyph.position,
                "x": glyph.x0 - crop_left,
                "y": glyph.y0 - crop_top,
                "width": glyph.width,
                "height": glyph.height,
            }
        )

    manifest = {
        "surah": surah,
        "ayah": ayah,
        "schema_version": "1.0.0",
        "image_width": crop.width,
        "image_height": crop.height,
        "source": "quran.com-ios-hafs_1405",
        "words": manifest_words,
    }

    manifest_path = manifests_dir / f"ayah_{surah:03d}_{ayah:03d}.manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    return True


def run_extract(
    pages: list[int],
    images_dir: Path,
    db_path: Path,
    ayat_dir: Path,
    words_dir: Path,
    manifests_dir: Path,
    ayah_padding: int,
    word_padding: int,
    overwrite_words: bool,
) -> None:
    ayat_dir.mkdir(parents=True, exist_ok=True)
    words_dir.mkdir(parents=True, exist_ok=True)
    manifests_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    total_ayah = 0
    total_word = 0
    invalid_rows = 0

    try:
        for index, page in enumerate(pages, start=1):
            page_path = images_dir / f"page{page:03d}.png"
            if not page_path.exists():
                print(f"[warn] missing page image: {page_path}")
                continue

            glyphs = fetch_page_glyphs(conn, page)
            if not glyphs:
                print(f"[warn] no glyph rows for page {page}")
                continue

            with Image.open(page_path) as page_img:
                page_img = page_img.convert("RGBA")

                ayah_groups: dict[tuple[int, int], list[GlyphRow]] = {}
                for glyph in glyphs:
                    ayah_groups.setdefault((glyph.surah, glyph.ayah), []).append(glyph)

                    if save_word_crop(
                        page_img=page_img,
                        glyph=glyph,
                        words_dir=words_dir,
                        padding=word_padding,
                        overwrite=overwrite_words,
                    ):
                        if glyph.width > 0 and glyph.height > 0:
                            total_word += 1
                    else:
                        invalid_rows += 1

                page_ayah = 0
                for (surah, ayah), ayah_glyphs in ayah_groups.items():
                    if save_ayah_asset_and_manifest(
                        page_img=page_img,
                        surah=surah,
                        ayah=ayah,
                        glyphs=ayah_glyphs,
                        ayat_dir=ayat_dir,
                        manifests_dir=manifests_dir,
                        padding=ayah_padding,
                    ):
                        page_ayah += 1
                        total_ayah += 1

            print(
                f"[ok] page {page:03d} ({index}/{len(pages)}): "
                f"ayah={page_ayah}, glyph_rows={len(glyphs)}"
            )
    finally:
        conn.close()

    print("-" * 60)
    print(f"Ayah assets generated:  {total_ayah}")
    print(f"Word crops processed:   {total_word}")
    print(f"Invalid glyph rows:     {invalid_rows}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract per-ayah and per-word PNG assets from official Quran.com pages."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Quran.com iOS hafs_1405 root (default: {DEFAULT_SOURCE_ROOT})",
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=None,
        help="Override page image directory (contains pageNNN.png).",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="Override ayah info DB path (ayahinfo_1920.db).",
    )
    parser.add_argument(
        "--pages",
        type=str,
        default="1-604",
        help="Page spec, e.g. 1-604 or 586,589",
    )
    parser.add_argument(
        "--ayat-out",
        type=Path,
        default=DEFAULT_AYAT_DIR,
        help=f"Output directory for ayah PNGs (default: {DEFAULT_AYAT_DIR})",
    )
    parser.add_argument(
        "--words-out",
        type=Path,
        default=DEFAULT_WORDS_DIR,
        help=f"Output directory for word PNGs (default: {DEFAULT_WORDS_DIR})",
    )
    parser.add_argument(
        "--manifests-out",
        type=Path,
        default=DEFAULT_MANIFESTS_DIR,
        help=f"Output directory for ayah manifests (default: {DEFAULT_MANIFESTS_DIR})",
    )
    parser.add_argument(
        "--ayah-padding",
        type=int,
        default=8,
        help="Padding (px) around ayah crop bounds (default: 8).",
    )
    parser.add_argument(
        "--word-padding",
        type=int,
        default=2,
        help="Padding (px) around word crop bounds (default: 2).",
    )
    parser.add_argument(
        "--overwrite-words",
        action="store_true",
        help="Overwrite existing word PNGs if present.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pages = parse_pages_spec(args.pages)
    images_dir = args.images_dir or (args.source_root / "images_1920" / "width_1920")
    db_path = args.db or (args.source_root / "images_1920" / "databases" / "ayahinfo_1920.db")

    if args.ayah_padding < 0 or args.word_padding < 0:
        raise ValueError("Padding values must be >= 0.")

    ensure_paths(images_dir, db_path)

    print("=" * 60)
    print("Miftah — Extract Official Ayah/Word Assets")
    print(f"Images:           {images_dir}")
    print(f"DB:               {db_path}")
    print(f"Ayah out:         {args.ayat_out}")
    print(f"Word out:         {args.words_out}")
    print(f"Manifests out:    {args.manifests_out}")
    print(f"Pages:            {len(pages)} ({pages[0]}..{pages[-1]})")
    print(f"Ayah padding:     {args.ayah_padding}px")
    print(f"Word padding:     {args.word_padding}px")
    print("=" * 60)

    run_extract(
        pages=pages,
        images_dir=images_dir,
        db_path=db_path,
        ayat_dir=args.ayat_out,
        words_dir=args.words_out,
        manifests_dir=args.manifests_out,
        ayah_padding=args.ayah_padding,
        word_padding=args.word_padding,
        overwrite_words=args.overwrite_words,
    )

    print("Done.")


if __name__ == "__main__":
    main()
