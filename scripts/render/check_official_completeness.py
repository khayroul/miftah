#!/usr/bin/env python3
"""
Check asset completeness against official Quran.com iOS glyph database.

Validates that expected page/ayah/word assets and manifests exist for selected pages.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

TOTAL_PAGES = 604

DEFAULT_SOURCE_ROOT = Path("/tmp/quran-ios/Example/QuranEngineApp/Resources/hafs_1405")
DEFAULT_DB_PATH = DEFAULT_SOURCE_ROOT / "images_1920" / "databases" / "ayahinfo_1920.db"

DEFAULT_PAGES_DIR = PROJECT_ROOT / "assets" / "pages"
DEFAULT_AYAT_DIR = PROJECT_ROOT / "assets" / "ayat"
DEFAULT_WORDS_DIR = PROJECT_ROOT / "assets" / "words"
DEFAULT_MANIFESTS_DIR = PROJECT_ROOT / "assets" / "manifests"

DEFAULT_REPORT_PATH = PROJECT_ROOT / "test" / "reports" / "official_completeness_report.json"


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
        raise ValueError("No valid pages found in --pages.")
    return valid


def fetch_expected_sets(db_path: Path, pages: list[int]) -> tuple[set[str], set[int]]:
    conn = sqlite3.connect(str(db_path))
    try:
        placeholders = ",".join("?" for _ in pages)
        query = f"""
            SELECT
                sura_number,
                ayah_number,
                glyph_id,
                min_x,
                max_x,
                min_y,
                max_y
            FROM glyphs
            WHERE page_number IN ({placeholders})
        """
        ayah_keys: set[str] = set()
        word_ids: set[int] = set()
        for row in conn.execute(query, pages):
            surah = int(row[0])
            ayah = int(row[1])
            glyph_id = int(row[2])
            min_x = int(row[3])
            max_x = int(row[4])
            min_y = int(row[5])
            max_y = int(row[6])

            ayah_keys.add(f"{surah:03d}_{ayah:03d}")
            if max_x - min_x > 0 and max_y - min_y > 0:
                word_ids.add(glyph_id)
        return ayah_keys, word_ids
    finally:
        conn.close()


def check_presence(expected: set[str], existing_dir: Path, prefix: str, suffix: str) -> tuple[int, list[str]]:
    missing: list[str] = []
    for token in sorted(expected):
        filename = f"{prefix}{token}{suffix}"
        if not (existing_dir / filename).exists():
            missing.append(filename)
    return len(expected) - len(missing), missing


def check_word_presence(expected_ids: set[int], words_dir: Path) -> tuple[int, list[str]]:
    missing: list[str] = []
    for glyph_id in sorted(expected_ids):
        filename = f"word_{glyph_id:05d}.png"
        if not (words_dir / filename).exists():
            missing.append(filename)
    return len(expected_ids) - len(missing), missing


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check official asset completeness (pages, ayat, words, manifests)."
    )
    parser.add_argument("--pages", type=str, default="1-604")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--db", type=Path, default=None)
    parser.add_argument("--pages-dir", type=Path, default=DEFAULT_PAGES_DIR)
    parser.add_argument("--ayat-dir", type=Path, default=DEFAULT_AYAT_DIR)
    parser.add_argument("--words-dir", type=Path, default=DEFAULT_WORDS_DIR)
    parser.add_argument("--manifests-dir", type=Path, default=DEFAULT_MANIFESTS_DIR)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--max-missing-list", type=int, default=200)
    args = parser.parse_args()

    pages = parse_pages_spec(args.pages)
    db_path = args.db or (args.source_root / "images_1920" / "databases" / "ayahinfo_1920.db")
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")

    ayah_expected, word_expected = fetch_expected_sets(db_path, pages)

    expected_page_tokens = {f"{page:03d}" for page in pages}
    page_ok, page_missing = check_presence(expected_page_tokens, args.pages_dir, "page_", ".png")
    thumb_ok, thumb_missing = check_presence(expected_page_tokens, args.pages_dir, "page_", "_thumb.png")
    page_manifest_ok, page_manifest_missing = check_presence(
        expected_page_tokens, args.manifests_dir, "page_", ".manifest.json"
    )

    ayah_ok, ayah_missing = check_presence(ayah_expected, args.ayat_dir, "ayah_", ".png")
    ayah_manifest_ok, ayah_manifest_missing = check_presence(
        ayah_expected, args.manifests_dir, "ayah_", ".manifest.json"
    )
    word_ok, word_missing = check_word_presence(word_expected, args.words_dir)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pages_requested": len(pages),
        "expected": {
            "pages": len(expected_page_tokens),
            "thumbnails": len(expected_page_tokens),
            "page_manifests": len(expected_page_tokens),
            "ayah_images": len(ayah_expected),
            "ayah_manifests": len(ayah_expected),
            "word_images": len(word_expected),
        },
        "present": {
            "pages": page_ok,
            "thumbnails": thumb_ok,
            "page_manifests": page_manifest_ok,
            "ayah_images": ayah_ok,
            "ayah_manifests": ayah_manifest_ok,
            "word_images": word_ok,
        },
        "missing_counts": {
            "pages": len(page_missing),
            "thumbnails": len(thumb_missing),
            "page_manifests": len(page_manifest_missing),
            "ayah_images": len(ayah_missing),
            "ayah_manifests": len(ayah_manifest_missing),
            "word_images": len(word_missing),
        },
    }

    passed = all(count == 0 for count in summary["missing_counts"].values())

    details = {
        "summary": summary,
        "pass": passed,
        "missing_samples": {
            "pages": page_missing[: args.max_missing_list],
            "thumbnails": thumb_missing[: args.max_missing_list],
            "page_manifests": page_manifest_missing[: args.max_missing_list],
            "ayah_images": ayah_missing[: args.max_missing_list],
            "ayah_manifests": ayah_manifest_missing[: args.max_missing_list],
            "word_images": word_missing[: args.max_missing_list],
        },
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(details, handle, indent=2)

    print("=" * 60)
    print("Miftah — Official Asset Completeness Check")
    print(f"Pages: {len(pages)} ({pages[0]}..{pages[-1]})")
    print(f"DB:    {db_path}")
    print("-" * 60)
    for key in [
        "pages",
        "thumbnails",
        "page_manifests",
        "ayah_images",
        "ayah_manifests",
        "word_images",
    ]:
        expected = summary["expected"][key]
        present = summary["present"][key]
        missing = summary["missing_counts"][key]
        print(f"{key:16} expected={expected:6d}  present={present:6d}  missing={missing:6d}")
    print("-" * 60)
    print(f"PASS: {passed}")
    print(f"Report: {args.report}")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
