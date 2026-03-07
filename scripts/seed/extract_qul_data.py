#!/usr/bin/env python3
"""
Miftah — Extract QUL data from mini_quran_dev.sql into clean JSON files.
Parses PostgreSQL COPY statements to extract surahs, ayat, words, roots.

Usage:
    python3 extract_qul_data.py

Input:  data/qul/mini_quran_dev.sql
Output: data/seed/surahs.json
        data/seed/ayat.json
        data/seed/words.json
        data/seed/word_occurrences.json
        data/seed/roots.json
"""

import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
QUL_SQL = DATA_DIR / "qul" / "mini_quran_dev.sql"
SEED_DIR = DATA_DIR / "seed"


def parse_copy_block(filepath, table_name):
    """Extract rows from a COPY ... FROM stdin block."""
    rows = []
    columns = []
    in_block = False
    copy_prefix = f"COPY quran.{table_name} ("

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if not in_block:
                if line.startswith(copy_prefix):
                    # Extract column names
                    col_str = line[len(copy_prefix):line.index(') FROM stdin')]
                    columns = [c.strip().strip('"') for c in col_str.split(',')]
                    in_block = True
                    continue
            else:
                if line.strip() == '\\.' :
                    break
                # Tab-separated values, \N = NULL
                values = line.rstrip('\n').split('\t')
                row = {}
                for i, col in enumerate(columns):
                    val = values[i] if i < len(values) else None
                    if val == '\\N':
                        val = None
                    row[col] = val
                rows.append(row)

    print(f"  {table_name}: {len(rows)} rows, {len(columns)} columns")
    return rows, columns


def extract_chapters(rows):
    """Convert QUL chapters to Miftah surahs format."""
    surahs = []
    for r in rows:
        pages = r.get('pages', '[]')
        try:
            page_list = json.loads(pages) if pages else []
        except (json.JSONDecodeError, TypeError):
            page_list = []

        surahs.append({
            "id": int(r['id']),
            "name_arabic": r['name_arabic'],
            "name_transliteration": r['name_complex'],
            "name_en": r['name_simple'],
            "revelation_type": r['revelation_place'] or 'meccan',
            "ayah_count": int(r['verses_count']),
            "order_revealed": int(r['revelation_order']) if r['revelation_order'] else None,
            "page_start": page_list[0] if page_list else None,
            "page_end": page_list[-1] if page_list else None,
        })

    surahs.sort(key=lambda x: x['id'])
    return surahs


def extract_verses(rows):
    """Convert QUL verses to Miftah ayat format."""
    ayat = []
    for r in rows:
        ayat.append({
            "surah_id": int(r['chapter_id']),
            "ayah_number": int(r['verse_number']),
            "verse_key": r['verse_key'],
            "text_uthmani": r['text_uthmani'],
            "text_simple": r.get('text_imlaei_simple') or r.get('text_qpc_hafs') or '',
            "page_number": int(r['page_number']) if r['page_number'] else 0,
            "juz_number": int(r['juz_number']) if r['juz_number'] else 0,
            "hizb_number": int(r['hizb_number']) if r['hizb_number'] else None,
            "ruku_number": int(r['ruku_number']) if r['ruku_number'] else None,
            "sajdah": r.get('sajdah_type') is not None and r['sajdah_type'] != '',
            "word_count": int(r['words_count']) if r.get('words_count') else 0,
            "qul_verse_id": int(r['id']),
        })

    ayat.sort(key=lambda x: (x['surah_id'], x['ayah_number']))
    return ayat


def extract_words(rows, roots_map):
    """Convert QUL words to Miftah words + word_occurrences."""
    # Group by unique word form (text_uthmani + root)
    # QUL words table has one row per word OCCURRENCE, not unique words
    # We need to deduplicate into unique words + occurrences

    unique_words = {}  # key: (text_uthmani, root_id) -> word data
    occurrences = []

    for r in rows:
        if r.get('char_type_name') == 'end':
            continue  # Skip ayah end markers

        text_uthmani = r.get('text_uthmani') or ''
        text_simple = r.get('text_imlaei_simple') or r.get('text_qpc_hafs') or ''
        root_id = r.get('root_id')
        lemma_id = r.get('lemma_id')

        # Unique key: text + root (same text with different roots = different words)
        word_key = (text_uthmani, root_id or '')

        if word_key not in unique_words:
            root_text = roots_map.get(root_id, {}).get('value', '') if root_id else ''
            unique_words[word_key] = {
                "text_uthmani": text_uthmani,
                "text_simple": text_simple,
                "transliteration": r.get('en_transliteration') or '',
                "root": root_text,
                "pos": r.get('char_type_name') or 'word',
                "frequency": 0,
                "qul_word_ids": [],
            }

        unique_words[word_key]["frequency"] += 1
        unique_words[word_key]["qul_word_ids"].append(int(r['id']))

        occurrences.append({
            "qul_word_id": int(r['id']),
            "word_key": word_key,
            "verse_key": r.get('verse_key') or f"{r.get('chapter_id')}:{r.get('position', 0)}",
            "surah_id": int(r['chapter_id']) if r.get('chapter_id') else None,
            "position": int(r['position']) if r.get('position') else 0,
            "page_number": int(r['page_number']) if r.get('page_number') else 0,
        })

    # Assign IDs to unique words
    word_list = []
    word_key_to_id = {}
    for idx, (key, data) in enumerate(sorted(unique_words.items(), key=lambda x: -x[1]['frequency']), 1):
        word_key_to_id[key] = idx
        word_list.append({
            "id": idx,
            "text_uthmani": data["text_uthmani"],
            "text_simple": data["text_simple"],
            "transliteration": data["transliteration"],
            "root": data["root"],
            "pos": data["pos"],
            "frequency": data["frequency"],
        })

    # Map occurrences to word IDs
    occ_list = []
    for occ in occurrences:
        word_id = word_key_to_id.get(occ["word_key"])
        if word_id:
            occ_list.append({
                "word_id": word_id,
                "verse_key": occ["verse_key"],
                "surah_id": occ["surah_id"],
                "position": occ["position"],
                "page_number": occ["page_number"],
                "qul_word_id": occ["qul_word_id"],
            })

    return word_list, occ_list


def extract_roots(rows):
    """Extract roots keyed by ID for word lookup."""
    roots = {}
    for r in rows:
        roots[r['id']] = {
            "value": r.get('value') or r.get('text_uthmani') or '',
            "text_clean": r.get('text_clean') or '',
            "en_translations": r.get('en_translations') or '',
            "words_count": int(r['words_count']) if r.get('words_count') else 0,
        }
    return roots


def main():
    print("=" * 60)
    print("Miftah — QUL Data Extraction")
    print("=" * 60)

    if not QUL_SQL.exists():
        print(f"ERROR: {QUL_SQL} not found")
        sys.exit(1)

    SEED_DIR.mkdir(parents=True, exist_ok=True)

    # Extract tables
    print("\nParsing QUL SQL dump...")
    chapter_rows, _ = parse_copy_block(QUL_SQL, 'chapters')
    verse_rows, _ = parse_copy_block(QUL_SQL, 'verses')
    word_rows, _ = parse_copy_block(QUL_SQL, 'words')
    root_rows, _ = parse_copy_block(QUL_SQL, 'roots')

    # Transform
    print("\nTransforming data...")
    roots_map = extract_roots(root_rows)
    surahs = extract_chapters(chapter_rows)
    ayat = extract_verses(verse_rows)
    words, occurrences = extract_words(word_rows, roots_map)

    print(f"\n  Surahs: {len(surahs)}")
    print(f"  Ayat: {len(ayat)}")
    print(f"  Unique words: {len(words)}")
    print(f"  Word occurrences: {len(occurrences)}")
    print(f"  Roots: {len(roots_map)}")

    # Write outputs
    for name, data in [
        ("surahs.json", surahs),
        ("ayat.json", ayat),
        ("words.json", words),
        ("word_occurrences.json", occurrences),
        ("roots.json", list(roots_map.values())),
    ]:
        path = SEED_DIR / name
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  Written: {path} ({len(data)} entries)")

    print("\nExtraction complete.")


if __name__ == "__main__":
    main()
