#!/usr/bin/env python3
"""
Fetch full ayah-theme chunks from QUL public endpoint and save local JSON.

This avoids relying on the mini dump (which only contains a tiny subset of
quran.ayah_themes rows).

Usage:
  python3 scripts/seed/fetch_qul_ayah_theme_chunks.py
  python3 scripts/seed/fetch_qul_ayah_theme_chunks.py --start-surah 1 --end-surah 2
"""

from __future__ import annotations

import argparse
import html
import json
import random
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
SEED_DIR = DATA_DIR / "seed"
QUL_DIR = DATA_DIR / "qul"
OUTPUT_PATH = QUL_DIR / "ayah_theme_chunks.full.json"

BASE_URL = "https://qul.tarteel.ai/ayah/{verse_key}/theme?partial=1"
USER_AGENT = "miftah-data-fetcher/1.0"

RANGE_RE = re.compile(
    r"This\s+theme\s+is\s+for\s+(\d+)\s+ayahs?\s+from\s+(\d+):(\d+)\s+to\s+(\d+):(\d+)",
    re.IGNORECASE,
)
THEME_RE = re.compile(r'<div class="tw-text-sm tw-text-gray-900">(.*?)</div>', re.DOTALL)
KEYWORD_RE = re.compile(r'<span[^>]*rounded-full[^>]*>(.*?)</span>', re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


class NoThemeError(ValueError):
    """Raised when QUL explicitly says no theme is available for this ayah."""


def clean_html_text(value: str) -> str:
    text = TAG_RE.sub(" ", value)
    text = html.unescape(text)
    text = SPACE_RE.sub(" ", text).strip()
    return text


def load_surah_ayah_counts() -> Dict[int, int]:
    meta_path = SEED_DIR / "verse_metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing {meta_path}. Run parse_tanzil_metadata first.")

    data = json.load(meta_path.open(encoding="utf-8"))
    verses = data.get("verses", {})
    if not isinstance(verses, dict) or not verses:
        raise RuntimeError("verse_metadata.json has no verses map")

    counts: Dict[int, int] = {}
    for key in verses.keys():
        try:
            surah_s, ayah_s = key.split(":", 1)
            surah_id = int(surah_s)
            ayah_num = int(ayah_s)
        except ValueError:
            continue
        counts[surah_id] = max(counts.get(surah_id, 0), ayah_num)

    if len(counts) != 114:
        print(f"WARN: expected 114 surahs, got {len(counts)}")
    return counts


def fetch_theme_html(verse_key: str, retries: int = 8, timeout: int = 30) -> str:
    url = BASE_URL.format(verse_key=verse_key)
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status} for {url}")
                return body
        except urllib.error.HTTPError as err:
            last_error = err
            if err.code in (429, 503, 520, 522, 524):
                sleep_s = min(45.0, (attempt * 5.0) + random.random() * 2.0)
            else:
                sleep_s = min(12.0, (2 ** (attempt - 1)) * 0.5 + random.random() * 0.6)
            time.sleep(sleep_s)
        except Exception as err:  # noqa: BLE001
            last_error = err
            sleep_s = min(12.0, (2 ** (attempt - 1)) * 0.5 + random.random() * 0.6)
            time.sleep(sleep_s)

    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def parse_theme_chunk(html_text: str, expected_surah: int, cursor_ayah: int) -> dict:
    normalized = clean_html_text(html_text)
    if "No theme available for this ayah" in normalized:
        raise NoThemeError("No theme available")

    range_match = RANGE_RE.search(html_text)
    if range_match:
        _, from_surah_s, ayah_from_s, to_surah_s, ayah_to_s = range_match.groups()
        from_surah = int(from_surah_s)
        ayah_from = int(ayah_from_s)
        to_surah = int(to_surah_s)
        ayah_to = int(ayah_to_s)

        if from_surah != expected_surah or to_surah != expected_surah:
            raise ValueError(
                f"Range surah mismatch: expected {expected_surah}, got {from_surah}:{ayah_from}-{to_surah}:{ayah_to}"
            )

        if ayah_from <= 0 or ayah_to < ayah_from:
            raise ValueError(f"Invalid ayah range {ayah_from}-{ayah_to}")

        if not (ayah_from <= cursor_ayah <= ayah_to):
            raise ValueError(
                f"Cursor {cursor_ayah} not in returned range {ayah_from}-{ayah_to}"
            )
    else:
        # Some records are ayah-level themes without explicit chunk-range text.
        ayah_from = cursor_ayah
        ayah_to = cursor_ayah

    theme_match = THEME_RE.search(html_text)
    theme = clean_html_text(theme_match.group(1)) if theme_match else ""
    if not theme:
        raise ValueError("Could not parse theme text from response")

    keywords = [clean_html_text(k) for k in KEYWORD_RE.findall(html_text)]
    keywords = [k for k in keywords if k]

    return {
        "source_chunk_id": None,
        "surah_id": expected_surah,
        "ayah_from": ayah_from,
        "ayah_to": ayah_to,
        "verse_key_from": f"{expected_surah}:{ayah_from}",
        "verse_key_to": f"{expected_surah}:{ayah_to}",
        "verses_count": ayah_to - ayah_from + 1,
        "theme": theme,
        "keywords": keywords,
        "book_id": 62,
        "source": "qul_public_endpoint",
    }


def dedupe_and_reindex(chunks: List[dict]) -> List[dict]:
    deduped: List[dict] = []
    seen = set()

    for chunk in chunks:
        key = (
            int(chunk["surah_id"]),
            int(chunk["ayah_from"]),
            int(chunk["ayah_to"]),
            str(chunk["theme"]).strip(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(chunk)

    deduped.sort(key=lambda c: (int(c["surah_id"]), int(c["ayah_from"]), int(c["ayah_to"])))
    for idx, chunk in enumerate(deduped, 1):
        chunk["id"] = idx
    return deduped


def load_existing(path: Path) -> List[dict]:
    if not path.exists():
        return []
    try:
        data = json.load(path.open(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except Exception:  # noqa: BLE001
        return []
    return []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-surah", type=int, default=1)
    parser.add_argument("--end-surah", type=int, default=114)
    parser.add_argument("--sleep-ms", type=int, default=80)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=8)
    parser.add_argument("--no-resume", action="store_true")
    parser.add_argument("--output", type=str, default=str(OUTPUT_PATH))
    args = parser.parse_args()

    if args.start_surah < 1 or args.end_surah > 114 or args.start_surah > args.end_surah:
        raise SystemExit("Invalid surah range")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    surah_counts = load_surah_ayah_counts()

    existing = [] if args.no_resume else load_existing(out_path)
    existing = dedupe_and_reindex(existing)

    last_to_by_surah: Dict[int, int] = {}
    for chunk in existing:
        sid = int(chunk.get("surah_id") or 0)
        ay_to = int(chunk.get("ayah_to") or 0)
        if sid:
            last_to_by_surah[sid] = max(last_to_by_surah.get(sid, 0), ay_to)

    all_chunks = existing.copy()
    req_count = 0
    missing_theme_count = 0

    print("=" * 60)
    print("Miftah — Fetch QUL Ayah Theme Chunks")
    print("=" * 60)
    print(f"Output: {out_path}")
    print(f"Resume: {'no' if args.no_resume else 'yes'} (existing={len(existing)})")

    sleep_s = max(0.0, args.sleep_ms / 1000.0)

    for surah_id in range(args.start_surah, args.end_surah + 1):
        max_ayah = surah_counts.get(surah_id)
        if not max_ayah:
            print(f"WARN: missing ayah count for surah {surah_id}, skipped")
            continue

        cursor = 1
        if not args.no_resume:
            cursor = min(max_ayah + 1, last_to_by_surah.get(surah_id, 0) + 1)

        if cursor > max_ayah:
            print(f"Surah {surah_id:>3}: already complete ({max_ayah} ayat)")
            continue

        added = 0
        while cursor <= max_ayah:
            verse_key = f"{surah_id}:{cursor}"
            chunk = None
            last_html = ""
            no_theme = False
            for parse_attempt in range(1, 4):
                html_text = fetch_theme_html(
                    verse_key,
                    retries=max(1, args.retries),
                    timeout=max(5, args.timeout),
                )
                req_count += 1
                last_html = html_text
                try:
                    chunk = parse_theme_chunk(html_text, surah_id, cursor)
                    break
                except NoThemeError:
                    no_theme = True
                    break
                except ValueError:
                    if parse_attempt < 3:
                        time.sleep(0.5 * parse_attempt)
                        continue

            if no_theme:
                missing_theme_count += 1
                cursor += 1
                if sleep_s > 0:
                    time.sleep(sleep_s)
                continue

            if chunk is None:
                snippet = clean_html_text(last_html)[:260]
                raise RuntimeError(
                    f"Failed to parse theme chunk for {verse_key}. Response snippet: {snippet}"
                )
            all_chunks.append(chunk)
            added += 1

            cursor = int(chunk["ayah_to"]) + 1
            if sleep_s > 0:
                time.sleep(sleep_s)

            if cursor <= max_ayah and added % 20 == 0:
                print(f"  Surah {surah_id}: fetched {added} chunks so far (next ayah {cursor})")

        print(f"Surah {surah_id:>3}: fetched {added} chunks")

        # Save incremental progress per surah
        all_chunks = dedupe_and_reindex(all_chunks)
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(all_chunks, f, ensure_ascii=False, indent=2)

    all_chunks = dedupe_and_reindex(all_chunks)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)

    print(f"\nDone: {len(all_chunks)} chunks, {req_count} HTTP requests")
    print(f"No-theme ayahs skipped: {missing_theme_count}")
    if all_chunks:
        first = all_chunks[0]
        last = all_chunks[-1]
        print(
            f"Range coverage: {first['surah_id']}:{first['ayah_from']} -> "
            f"{last['surah_id']}:{last['ayah_to']}"
        )


if __name__ == "__main__":
    main()
