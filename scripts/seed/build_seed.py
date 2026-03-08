#!/usr/bin/env python3
"""
Miftah — Build Supabase Seed SQL
Merges QUL extracted data + our translations into seed SQL.

Usage:
    python3 build_seed.py

Input:  data/seed/surahs.json       (from extract_qul_data.py)
        data/seed/ayat.json
        data/seed/words.json
        data/seed/word_occurrences.json
        data/qul/bm_wbw translations
        data/qul/en-sahih-international-simple.json
        data/qul/abdullah-basamia-simple.json
        data/qul/indonesian-word-by-word-translation.json
        data/bm_wbw_complete.json
        data/qul/english-wbw-translation.json

Output: data/seed/seed.sql          — Full INSERT SQL for Supabase
        data/seed/seed_stats.txt    — Summary
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
SEED_DIR = DATA_DIR / "seed"
QUL_DIR = DATA_DIR / "qul"


def escape_sql(val):
    """Escape a string for SQL insertion."""
    if val is None:
        return "NULL"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def build_surahs_sql(surahs, surah_meta=None):
    """Generate INSERT for surahs table.
    Uses tanzil metadata for accurate revelation_type and order_revealed.
    """
    lines = ["-- Surahs (114)"]
    lines.append("INSERT INTO surahs (id, name_arabic, name_transliteration, name_bm, name_en, revelation_type, ayah_count, juz_start, page_start, page_end, order_revealed) VALUES")

    values = []
    for s in surahs:
        sid = str(s['id'])
        meta = (surah_meta or {}).get(sid, {})

        # Prefer tanzil metadata for revelation_type (fixes QUL dump issue)
        rev_type = meta.get('revelation_type', s['revelation_type'].lower())
        if rev_type not in ('meccan', 'medinan'):
            rev_type = 'meccan'

        order = meta.get('order_revealed') or s.get('order_revealed')

        # BM names: use transliteration for now (can be refined later)
        name_bm = s['name_transliteration']

        values.append(
            f"({s['id']}, {escape_sql(s['name_arabic'])}, {escape_sql(s['name_transliteration'])}, "
            f"{escape_sql(name_bm)}, {escape_sql(s['name_en'])}, '{rev_type}', "
            f"{s['ayah_count']}, 1, {s.get('page_start') or 0}, {s.get('page_end') or 0}, "
            f"{order or 'NULL'})"
        )

    lines.append(",\n".join(values) + ";")
    return "\n".join(lines)


def load_tanzil_text(filepath):
    """Load tanzil.net text file (surah|ayah|text format)."""
    texts = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split('|', 2)
            if len(parts) == 3:
                key = f"{parts[0]}:{parts[1]}"
                texts[key] = parts[2]
    return texts


def build_ayat_sql(ayat, sahih, basmeih, id_wbw):
    """Generate INSERT for ayat table.
    Merges Arabic text from QUL dump + tanzil.net + translations.
    Uses tanzil verse_metadata.json for complete page/juz/hizb/ruku (all 6,236).
    """
    # Load tanzil.net Arabic text (full 6,236 ayat)
    tanzil_uthmani_path = DATA_DIR / "qul" / "quran-uthmani.txt"
    tanzil_simple_path = DATA_DIR / "qul" / "quran-simple.txt"
    tanzil_uthmani = load_tanzil_text(tanzil_uthmani_path) if tanzil_uthmani_path.exists() else {}
    tanzil_simple = load_tanzil_text(tanzil_simple_path) if tanzil_simple_path.exists() else {}
    print(f"  Tanzil Arabic text: {len(tanzil_uthmani)} uthmani, {len(tanzil_simple)} simple")

    # Load tanzil verse metadata (complete page/juz/hizb/ruku for all 6,236)
    verse_meta_path = SEED_DIR / "verse_metadata.json"
    verse_meta = {}
    surah_meta = {}
    if verse_meta_path.exists():
        with open(verse_meta_path, encoding='utf-8') as f:
            meta_data = json.load(f)
            verse_meta = meta_data.get('verses', {})
            surah_meta = meta_data.get('surahs', {})
        print(f"  Tanzil metadata: {len(verse_meta)} verses (page/juz/hizb/ruku)")

    # Build lookup for QUL dump ayat (has word_count)
    qul_ayat_map = {}
    for a in ayat:
        key = f"{a['surah_id']}:{a['ayah_number']}"
        qul_ayat_map[key] = a

    # Build full ayat list from all sources
    all_verse_keys = set()
    for key in sahih:
        all_verse_keys.add(key)
    for key in basmeih:
        all_verse_keys.add(key)
    for key in tanzil_uthmani:
        all_verse_keys.add(key)
    for key in verse_meta:
        all_verse_keys.add(key)

    # Parse verse keys and sort
    parsed_keys = []
    for key in sorted(all_verse_keys):
        parts = key.split(':')
        if len(parts) == 2:
            parsed_keys.append((int(parts[0]), int(parts[1]), key))
    parsed_keys.sort()

    lines = ["-- Ayat"]
    batch_size = 500
    batch = []
    total = 0

    ayat_with_arabic = 0
    ayat_with_page = 0
    for surah_id, ayah_num, key in parsed_keys:
        qul = qul_ayat_map.get(key, {})
        en = sahih.get(key, {})
        bm = basmeih.get(key, {})
        meta = verse_meta.get(key, {})

        # Prefer tanzil/QPC text (has waqf marks + consistent orthography), fall back to QUL dump
        text_uthmani = tanzil_uthmani.get(key, '') or qul.get('text_uthmani', '')
        text_simple = tanzil_simple.get(key, '') or qul.get('text_simple', '')
        if text_uthmani:
            ayat_with_arabic += 1

        # Use tanzil metadata (complete), fall back to QUL dump
        page_number = meta.get('page_number') or qul.get('page_number', 0)
        juz_number = meta.get('juz_number') or qul.get('juz_number', 0)
        hizb_number = meta.get('hizb_number') or qul.get('hizb_number')
        ruku_number = meta.get('ruku_number') or qul.get('ruku_number')
        sajdah = meta.get('sajdah', False) or qul.get('sajdah', False)
        word_count = qul.get('word_count', 0)

        if page_number:
            ayat_with_page += 1

        en_text = en.get('t', '') if isinstance(en, dict) else ''
        bm_text = bm.get('t', '') if isinstance(bm, dict) else ''

        batch.append(
            f"({surah_id}, {ayah_num}, {escape_sql(text_uthmani)}, {escape_sql(text_simple)}, "
            f"NULL, {escape_sql(en_text)}, {escape_sql(bm_text)}, "
            f"FALSE, NULL, NULL, "
            f"{page_number}, {juz_number}, {hizb_number or 'NULL'}, {ruku_number or 'NULL'}, "
            f"{'TRUE' if sajdah else 'FALSE'}, {word_count}, NULL)"
        )
        total += 1

        if len(batch) >= batch_size:
            lines.append(
                "INSERT INTO ayat (surah_id, ayah_number, text_uthmani, text_simple, "
                "translation_id, translation_en, display_bm, "
                "bm_flagged, bm_resolution_notes, bm_correction_note, "
                "page_number, juz_number, hizb_number, ruku_number, "
                "sajdah, word_count, audio_url) VALUES"
            )
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append(
            "INSERT INTO ayat (surah_id, ayah_number, text_uthmani, text_simple, "
            "translation_id, translation_en, display_bm, "
            "bm_flagged, bm_resolution_notes, bm_correction_note, "
            "page_number, juz_number, hizb_number, ruku_number, "
            "sajdah, word_count, audio_url) VALUES"
        )
        lines.append(",\n".join(batch) + ";")

    lines.insert(1, f"-- Total: {total} ayat ({ayat_with_arabic} with Arabic, {ayat_with_page} with page mapping)")
    return "\n".join(lines), total, ayat_with_arabic


def build_words_sql(words, bm_wbw, en_wbw, word_occurrences):
    """Generate INSERT for words + word_occurrences tables.
    Merges QUL word data + our BM/EN WBW translations.
    """
    # Build WBW lookup: verse_key:position -> translation
    # bm_wbw keys are "surah:ayah:position"

    # First, map QUL word occurrences to verse_key:position
    qul_word_id_to_occ = {}
    for occ in word_occurrences:
        qul_word_id_to_occ[occ['qul_word_id']] = occ

    # Map word IDs to their WBW translations via occurrences
    word_bm_translations = {}  # word_id -> {text: count}
    word_en_translations = {}

    for occ in word_occurrences:
        vk = occ['verse_key']
        pos = occ['position']
        wbw_key = f"{vk}:{pos}"
        word_id = occ['word_id']

        bm = bm_wbw.get(wbw_key, '')
        en = en_wbw.get(wbw_key, '')

        if bm:
            if word_id not in word_bm_translations:
                word_bm_translations[word_id] = {}
            word_bm_translations[word_id][bm] = word_bm_translations[word_id].get(bm, 0) + 1

        if en:
            if word_id not in word_en_translations:
                word_en_translations[word_id] = {}
            word_en_translations[word_id][en] = word_en_translations[word_id].get(en, 0) + 1

    # Pick most common translation for each word
    def most_common(d):
        if not d:
            return ''
        return max(d, key=d.get)

    lines = ["-- Words"]
    batch_size = 500
    batch = []

    for w in words:
        wid = w['id']
        bm_trans = most_common(word_bm_translations.get(wid, {}))
        en_trans = most_common(word_en_translations.get(wid, {}))

        batch.append(
            f"({wid}, {escape_sql(w['text_uthmani'])}, {escape_sql(w['text_simple'])}, "
            f"{escape_sql(bm_trans)}, {escape_sql(en_trans)}, {escape_sql(w['transliteration'])}, "
            f"{escape_sql(w['root'])}, NULL, {escape_sql(w['pos'])}, {w['frequency']})"
        )

        if len(batch) >= batch_size:
            lines.append(
                "INSERT INTO words (id, text_uthmani, text_simple, "
                "translation_bm, translation_en, transliteration, "
                "root, lemma, pos, frequency) VALUES"
            )
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append(
            "INSERT INTO words (id, text_uthmani, text_simple, "
            "translation_bm, translation_en, transliteration, "
            "root, lemma, pos, frequency) VALUES"
        )
        lines.append(",\n".join(batch) + ";")

    lines.insert(1, f"-- Total: {len(words)} unique words")
    return "\n".join(lines)


def build_word_occurrences_sql(occurrences):
    """Generate INSERT for word_occurrences table."""
    lines = ["-- Word Occurrences"]
    lines.append(f"-- Total: {len(occurrences)}")

    batch_size = 1000
    batch = []

    for occ in occurrences:
        # ayah_id will be resolved via subquery using verse_key
        vk_parts = occ['verse_key'].split(':')
        if len(vk_parts) != 2:
            continue
        surah_id = int(vk_parts[0])
        ayah_num = int(vk_parts[1])

        batch.append(
            f"({occ['word_id']}, "
            f"(SELECT id FROM ayat WHERE surah_id = {surah_id} AND ayah_number = {ayah_num}), "
            f"{occ['position']}, {occ['page_number']})"
        )

        if len(batch) >= batch_size:
            lines.append(
                "INSERT INTO word_occurrences (word_id, ayah_id, position, page_number) VALUES"
            )
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append(
            "INSERT INTO word_occurrences (word_id, ayah_id, position, page_number) VALUES"
        )
        lines.append(",\n".join(batch) + ";")

    return "\n".join(lines)


def main():
    print("=" * 60)
    print("Miftah — Build Supabase Seed SQL")
    print("=" * 60)

    # Load extracted QUL data
    surahs = load_json(SEED_DIR / "surahs.json")
    ayat = load_json(SEED_DIR / "ayat.json")
    words = load_json(SEED_DIR / "words.json")
    occurrences = load_json(SEED_DIR / "word_occurrences.json")

    # Load translations
    sahih = load_json(QUL_DIR / "en-sahih-international-simple.json")
    basmeih = load_json(QUL_DIR / "abdullah-basamia-simple.json")
    bm_wbw = load_json(DATA_DIR / "bm_wbw_complete.json")
    en_wbw = load_json(QUL_DIR / "english-wbw-translation.json")

    print(f"\nLoaded: {len(surahs)} surahs, {len(ayat)} ayat (QUL), {len(words)} words")
    print(f"Translations: Sahih={len(sahih)}, Basmeih={len(basmeih)}, BM-WBW={len(bm_wbw)}, EN-WBW={len(en_wbw)}")

    # Load tanzil metadata for surahs
    verse_meta_path = SEED_DIR / "verse_metadata.json"
    surah_meta = {}
    if verse_meta_path.exists():
        with open(verse_meta_path, encoding='utf-8') as f:
            meta_data = json.load(f)
            surah_meta = meta_data.get('surahs', {})
        print(f"Tanzil surah metadata: {len(surah_meta)} surahs")

    # Build SQL
    print("\nBuilding SQL...")
    sql_parts = []

    sql_parts.append("-- Miftah Supabase Seed Data")
    sql_parts.append("-- Generated from QUL data + tanzil.net metadata + BM translations")
    sql_parts.append("-- Run AFTER 001_initial_schema.sql migration")
    sql_parts.append("BEGIN;\n")

    # Surahs
    sql_parts.append(build_surahs_sql(surahs, surah_meta))
    sql_parts.append("")

    # Ayat (with juz_start fix for surahs after ayat are inserted)
    ayat_sql, total_ayat, ayat_with_arabic = build_ayat_sql(ayat, sahih, basmeih, {})
    sql_parts.append(ayat_sql)
    sql_parts.append("")

    # Update surahs.juz_start, page_start, page_end from actual ayat data
    sql_parts.append("-- Update juz_start, page_start, page_end for each surah")
    sql_parts.append("""UPDATE surahs SET
  juz_start = sub.juz_start,
  page_start = sub.page_start,
  page_end = sub.page_end
FROM (
  SELECT surah_id,
    MIN(juz_number) FILTER (WHERE juz_number > 0) AS juz_start,
    MIN(page_number) FILTER (WHERE page_number > 0) AS page_start,
    MAX(page_number) FILTER (WHERE page_number > 0) AS page_end
  FROM ayat GROUP BY surah_id
) sub
WHERE surahs.id = sub.surah_id;""")
    sql_parts.append("")

    # Words
    sql_parts.append(build_words_sql(words, bm_wbw, en_wbw, occurrences))
    sql_parts.append("")

    # Word occurrences
    sql_parts.append(build_word_occurrences_sql(occurrences))
    sql_parts.append("")

    # Reset sequences
    sql_parts.append("-- Reset sequences")
    sql_parts.append("SELECT setval('ayat_id_seq', (SELECT MAX(id) FROM ayat));")
    sql_parts.append("SELECT setval('words_id_seq', (SELECT MAX(id) FROM words));")
    sql_parts.append("SELECT setval('word_occurrences_id_seq', (SELECT MAX(id) FROM word_occurrences));")
    sql_parts.append("")

    sql_parts.append("COMMIT;")

    # Write seed SQL
    seed_sql = "\n".join(sql_parts)
    seed_path = SEED_DIR / "seed.sql"
    with open(seed_path, 'w', encoding='utf-8') as f:
        f.write(seed_sql)

    sql_size = len(seed_sql) / (1024 * 1024)
    print(f"\nWritten: {seed_path} ({sql_size:.1f} MB)")

    # Write stats
    stats = f"""Miftah — Seed Data Statistics
==============================
Surahs: {len(surahs)}
Ayat: {total_ayat} total ({ayat_with_arabic} with Arabic text from QUL)
  → {total_ayat - ayat_with_arabic} ayat need Arabic text (missing from mini dump)
Unique words: {len(words)}
Word occurrences: {len(occurrences)}

Translations loaded:
  Basmeih (BM ayah): {len(basmeih)} ayat
  Sahih (EN ayah): {len(sahih)} ayat
  BM WBW: {len(bm_wbw)} word positions
  EN WBW: {len(en_wbw)} word positions

NOTE: Mini QUL dump only contains ~31% of verses.
Arabic text (text_uthmani, text_simple) is empty for remaining ~69%.
Full data available from QUL full download or tanzil.net.
"""
    stats_path = SEED_DIR / "seed_stats.txt"
    with open(stats_path, 'w') as f:
        f.write(stats)
    print(stats)


if __name__ == "__main__":
    main()
