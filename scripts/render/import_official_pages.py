#!/usr/bin/env python3
"""
Import official Quran.com iOS mushaf page assets (hafs_1405) into Miftah.

This script copies page PNGs and generates per-page hitbox manifests from
ayahinfo_1920.db so page visuals match Quran.com iOS while preserving
word-level interactivity.

Usage:
  python3 scripts/render/import_official_pages.py
  python3 scripts/render/import_official_pages.py --pages 586,589
  python3 scripts/render/import_official_pages.py --source-root /path/to/hafs_1405
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from pathlib import Path
from typing import Iterable

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

DEFAULT_SOURCE_ROOT = Path("/tmp/quran-ios/Example/QuranEngineApp/Resources/hafs_1405")
DEFAULT_IMAGES_DIR = DEFAULT_SOURCE_ROOT / "images_1920" / "width_1920"
DEFAULT_DB_PATH = DEFAULT_SOURCE_ROOT / "images_1920" / "databases" / "ayahinfo_1920.db"

DEFAULT_PAGES_DIR = PROJECT_ROOT / "assets" / "pages"
DEFAULT_MANIFESTS_DIR = PROJECT_ROOT / "assets" / "manifests"

TOTAL_PAGES = 604


def parse_pages_spec(spec: str) -> list[int]:
    """Parse page list/range string: '1-3,10,586'."""
    if not spec:
        return list(range(1, TOTAL_PAGES + 1))

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
        raise ValueError("No valid pages found in --pages spec.")
    return valid


def ensure_paths_exist(images_dir: Path, db_path: Path) -> None:
    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")
    if not db_path.exists():
        raise FileNotFoundError(f"Ayah info DB not found: {db_path}")


def fetch_page_rows(conn: sqlite3.Connection, page: int) -> list[sqlite3.Row]:
    query = """
        SELECT
            glyph_id,
            page_number,
            line_number,
            sura_number,
            ayah_number,
            position,
            min_x,
            max_x,
            min_y,
            max_y
        FROM glyphs
        WHERE page_number = ?
        ORDER BY line_number ASC, position ASC, glyph_id ASC
    """
    cur = conn.execute(query, (page,))
    return cur.fetchall()


def build_manifest(page: int, image_w: int, image_h: int, rows: Iterable[sqlite3.Row]) -> dict:
    row_list = list(rows)
    words = []

    for row in row_list:
        x0 = int(row["min_x"])
        x1 = int(row["max_x"])
        y0 = int(row["min_y"])
        y1 = int(row["max_y"])
        width = x1 - x0
        height = y1 - y0
        if width <= 0 or height <= 0:
            continue

        surah = int(row["sura_number"])
        ayah = int(row["ayah_number"])
        position = int(row["position"])

        words.append(
            {
                "location": f"{surah}:{ayah}:{position}",
                "surah": surah,
                "ayah": ayah,
                "word_position": position,
                "word_id": int(row["glyph_id"]),
                "x": x0,
                "y": y0,
                "width": width,
                "height": height,
            }
        )

    manifest = {
        "page": page,
        "schema_version": "1.0.0",
        "surah_start": int(row_list[0]["sura_number"]) if row_list else 0,
        "ayah_start": int(row_list[0]["ayah_number"]) if row_list else 0,
        "surah_end": int(row_list[-1]["sura_number"]) if row_list else 0,
        "ayah_end": int(row_list[-1]["ayah_number"]) if row_list else 0,
        "image_width": image_w,
        "image_height": image_h,
        "words": words,
    }
    return manifest


def copy_page_assets(
    source_png: Path,
    dest_png: Path,
    dest_thumb: Path,
    thumb_scale: float,
) -> tuple[int, int]:
    shutil.copy2(source_png, dest_png)

    with Image.open(source_png) as page_img:
        width, height = page_img.size
        thumb_w = max(1, int(round(width * thumb_scale)))
        thumb_h = max(1, int(round(height * thumb_scale)))
        thumb = page_img.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        thumb.save(dest_thumb, format="PNG")

    return width, height


def run_import(
    pages: list[int],
    images_dir: Path,
    db_path: Path,
    pages_out: Path,
    manifests_out: Path,
    thumb_scale: float,
) -> None:
    pages_out.mkdir(parents=True, exist_ok=True)
    manifests_out.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        for page in pages:
            src_png = images_dir / f"page{page:03d}.png"
            if not src_png.exists():
                print(f"[warn] Missing source image for page {page}: {src_png}")
                continue

            dest_png = pages_out / f"page_{page:03d}.png"
            dest_thumb = pages_out / f"page_{page:03d}_thumb.png"
            image_w, image_h = copy_page_assets(src_png, dest_png, dest_thumb, thumb_scale)

            rows = fetch_page_rows(conn, page)
            manifest = build_manifest(page, image_w, image_h, rows)
            dest_manifest = manifests_out / f"page_{page:03d}.manifest.json"
            with open(dest_manifest, "w", encoding="utf-8") as handle:
                json.dump(manifest, handle, ensure_ascii=False, indent=2)

            print(
                f"[ok] page {page:03d} -> {dest_png.name}, {dest_manifest.name}, "
                f"{len(manifest['words'])} words"
            )
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import official Quran.com iOS page images and hitboxes."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Root folder that contains images_1920/ and databases/ (default: {DEFAULT_SOURCE_ROOT})",
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=None,
        help="Override source images directory (contains pageNNN.png).",
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
        help="Pages to import. Examples: 1-604, 586,589",
    )
    parser.add_argument(
        "--pages-out",
        type=Path,
        default=DEFAULT_PAGES_DIR,
        help=f"Output directory for page PNGs (default: {DEFAULT_PAGES_DIR})",
    )
    parser.add_argument(
        "--manifests-out",
        type=Path,
        default=DEFAULT_MANIFESTS_DIR,
        help=f"Output directory for manifests (default: {DEFAULT_MANIFESTS_DIR})",
    )
    parser.add_argument(
        "--thumb-scale",
        type=float,
        default=0.25,
        help="Thumbnail scale factor (default: 0.25).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    images_dir = args.images_dir or (args.source_root / "images_1920" / "width_1920")
    db_path = args.db or (args.source_root / "images_1920" / "databases" / "ayahinfo_1920.db")

    pages = parse_pages_spec(args.pages)
    ensure_paths_exist(images_dir, db_path)

    if args.thumb_scale <= 0:
        raise ValueError("--thumb-scale must be > 0")

    print("=" * 60)
    print("Miftah — Import Official Quran.com iOS Assets")
    print(f"Source images:    {images_dir}")
    print(f"Source DB:        {db_path}")
    print(f"Output pages:     {args.pages_out}")
    print(f"Output manifests: {args.manifests_out}")
    print(f"Pages:            {len(pages)} ({pages[0]}..{pages[-1]})")
    print("=" * 60)

    run_import(
        pages=pages,
        images_dir=images_dir,
        db_path=db_path,
        pages_out=args.pages_out,
        manifests_out=args.manifests_out,
        thumb_scale=args.thumb_scale,
    )
    print("Done.")


if __name__ == "__main__":
    main()
