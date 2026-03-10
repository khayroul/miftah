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
        data/seed/themes.json
        data/seed/theme_ayat.json
        data/seed/ayah_theme_chunks.json
        data/seed/mutashabihat.json
        data/seed/mutashabihat_ayat.json
        data/seed/tafsir_notes.json
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
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
SEED_DIR = DATA_DIR / "seed"
QUL_DIR = DATA_DIR / "qul"

ARABIC_DIACRITICS_RE = re.compile(
    r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u08D3-\u08E1\u08E3-\u08FF]"
)


def escape_sql(val):
    """Escape a string for SQL insertion."""
    if val is None:
        return "NULL"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_json_optional(path, default):
    if not path.exists():
        return default
    return load_json(path)


def to_sql_text_array(values):
    if not values:
        return "ARRAY[]::TEXT[]"
    escaped = ", ".join(escape_sql(v) for v in values if v is not None and str(v).strip())
    if not escaped:
        return "ARRAY[]::TEXT[]"
    return f"ARRAY[{escaped}]"


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


def safe_int(value, default=0):
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def tokenize_uthmani_words(text):
    return [token for token in str(text or "").split() if token]


def strip_arabic_diacritics(text):
    return ARABIC_DIACRITICS_RE.sub("", str(text or ""))


def build_full_ayah_records(ayat, sahih, basmeih):
    """Build canonical ayah records (full 6,236) used by both ayat and WBW seed."""
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
        with open(verse_meta_path, encoding="utf-8") as f:
            meta_data = json.load(f)
            verse_meta = meta_data.get("verses", {})
            surah_meta = meta_data.get("surahs", {})
        print(f"  Tanzil metadata: {len(verse_meta)} verses (page/juz/hizb/ruku)")

    # Build lookup for QUL dump ayat (has word_count for covered subset)
    qul_ayat_map = {}
    for row in ayat:
        key = f"{row['surah_id']}:{row['ayah_number']}"
        qul_ayat_map[key] = row

    # Build full ayat keyset from all core sources
    all_verse_keys = set()
    all_verse_keys.update(sahih.keys())
    all_verse_keys.update(basmeih.keys())
    all_verse_keys.update(tanzil_uthmani.keys())
    all_verse_keys.update(verse_meta.keys())

    parsed_keys = []
    for key in sorted(all_verse_keys):
        parts = key.split(":")
        if len(parts) != 2:
            continue
        parsed_keys.append((int(parts[0]), int(parts[1]), key))
    parsed_keys.sort()

    records = []
    for surah_id, ayah_number, key in parsed_keys:
        qul = qul_ayat_map.get(key, {})
        en = sahih.get(key, {})
        bm = basmeih.get(key, {})
        meta = verse_meta.get(key, {})

        text_uthmani = tanzil_uthmani.get(key, "") or qul.get("text_uthmani", "")
        text_simple = tanzil_simple.get(key, "") or qul.get("text_simple", "")
        tokens = tokenize_uthmani_words(text_uthmani)

        word_count = safe_int(qul.get("word_count"), 0)
        if word_count <= 0:
            word_count = len(tokens)

        records.append(
            {
                "surah_id": surah_id,
                "ayah_number": ayah_number,
                "verse_key": key,
                "text_uthmani": text_uthmani,
                "text_simple": text_simple,
                "translation_en": en.get("t", "") if isinstance(en, dict) else "",
                "translation_bm": bm.get("t", "") if isinstance(bm, dict) else "",
                "page_number": safe_int(meta.get("page_number"), safe_int(qul.get("page_number"), 0)),
                "juz_number": safe_int(meta.get("juz_number"), safe_int(qul.get("juz_number"), 0)),
                "hizb_number": meta.get("hizb_number") if meta.get("hizb_number") is not None else qul.get("hizb_number"),
                "ruku_number": meta.get("ruku_number") if meta.get("ruku_number") is not None else qul.get("ruku_number"),
                "sajdah": bool(meta.get("sajdah", False) or qul.get("sajdah", False)),
                "word_count": word_count,
            }
        )

    return records, surah_meta


def build_ayat_sql(ayah_records):
    """Generate INSERT for ayat table.
    Uses canonical full ayah records (all 6,236).
    """
    lines = ["-- Ayat"]
    batch_size = 500
    batch = []
    total = 0

    ayat_with_arabic = 0
    ayat_with_page = 0
    for row in ayah_records:
        text_uthmani = row["text_uthmani"]
        if text_uthmani:
            ayat_with_arabic += 1

        page_number = safe_int(row["page_number"], 0)
        juz_number = safe_int(row["juz_number"], 0)
        hizb_number = row["hizb_number"]
        ruku_number = row["ruku_number"]
        sajdah = row["sajdah"]
        word_count = safe_int(row["word_count"], 0)

        if page_number:
            ayat_with_page += 1

        batch.append(
            f"({row['surah_id']}, {row['ayah_number']}, {escape_sql(text_uthmani)}, {escape_sql(row['text_simple'])}, "
            f"NULL, {escape_sql(row['translation_en'])}, {escape_sql(row['translation_bm'])}, "
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


def most_common_text(counts):
    if not counts:
        return None
    max_count = max(counts.values())
    winners = sorted([text for text, count in counts.items() if count == max_count])
    return winners[0] if winners else None


def pick_legacy_word_entry(token, legacy_by_exact, legacy_by_stripped):
    candidates = legacy_by_exact.get(token, [])
    if not candidates:
        stripped = strip_arabic_diacritics(token)
        candidates = legacy_by_stripped.get(stripped, []) if stripped else []
    if not candidates:
        return None
    ranked = sorted(
        candidates,
        key=lambda row: (-safe_int(row.get("frequency"), 0), str(row.get("text_uthmani") or "")),
    )
    return ranked[0]


def build_complete_words_and_occurrences(ayah_records, legacy_words, bm_wbw, en_wbw):
    """Generate full-coverage words + occurrences from canonical ayah text."""
    legacy_by_exact = defaultdict(list)
    legacy_by_stripped = defaultdict(list)
    for row in legacy_words:
        token = str(row.get("text_uthmani") or "").strip()
        if not token:
            continue
        legacy_by_exact[token].append(row)
        legacy_by_stripped[strip_arabic_diacritics(token)].append(row)

    token_frequency = defaultdict(int)
    token_bm_counts = defaultdict(lambda: defaultdict(int))
    token_en_counts = defaultdict(lambda: defaultdict(int))

    for ayah in ayah_records:
        verse_key = ayah["verse_key"]
        tokens = tokenize_uthmani_words(ayah["text_uthmani"])
        for position, token in enumerate(tokens, 1):
            token_frequency[token] += 1
            wbw_key = f"{verse_key}:{position}"

            bm_translation = str(bm_wbw.get(wbw_key, "") or "").strip()
            if bm_translation:
                token_bm_counts[token][bm_translation] += 1

            en_translation = str(en_wbw.get(wbw_key, "") or "").strip()
            if en_translation:
                token_en_counts[token][en_translation] += 1

    sorted_tokens = sorted(token_frequency.keys(), key=lambda token: (-token_frequency[token], token))
    token_to_word_id = {token: idx for idx, token in enumerate(sorted_tokens, 1)}

    words = []
    for token in sorted_tokens:
        legacy = pick_legacy_word_entry(token, legacy_by_exact, legacy_by_stripped)
        legacy_text_simple = str(legacy.get("text_simple") or "").strip() if legacy else ""
        fallback_text_simple = strip_arabic_diacritics(token)
        text_simple = legacy_text_simple or fallback_text_simple or token

        words.append(
            {
                "id": token_to_word_id[token],
                "text_uthmani": token,
                "text_simple": text_simple,
                "translation_bm": most_common_text(token_bm_counts.get(token, {})),
                "translation_en": most_common_text(token_en_counts.get(token, {})),
                "transliteration": str(legacy.get("transliteration") or "").strip() if legacy else "",
                "root": str(legacy.get("root") or "").strip() if legacy else "",
                "pos": str(legacy.get("pos") or "word").strip() if legacy else "word",
                "frequency": token_frequency[token],
            }
        )

    occurrences = []
    for ayah in ayah_records:
        tokens = tokenize_uthmani_words(ayah["text_uthmani"])
        for position, token in enumerate(tokens, 1):
            occurrences.append(
                {
                    "word_id": token_to_word_id[token],
                    "verse_key": ayah["verse_key"],
                    "position": position,
                    "page_number": safe_int(ayah["page_number"], 0),
                }
            )

    return words, occurrences


def audit_word_occurrence_coverage(ayah_records, occurrences):
    expected_positions = {}
    for ayah in ayah_records:
        tokens = tokenize_uthmani_words(ayah["text_uthmani"])
        expected_positions[ayah["verse_key"]] = set(range(1, len(tokens) + 1))

    actual_positions = defaultdict(set)
    for occ in occurrences:
        actual_positions[occ["verse_key"]].add(safe_int(occ["position"], 0))

    mismatches = []
    missing_token_total = 0
    for ayah in ayah_records:
        verse_key = ayah["verse_key"]
        expected = expected_positions.get(verse_key, set())
        actual = actual_positions.get(verse_key, set())
        missing = sorted([pos for pos in expected if pos not in actual])
        if not missing:
            continue
        missing_token_total += len(missing)
        mismatches.append(
            {
                "verse_key": verse_key,
                "expected_count": len(expected),
                "actual_count": len(actual),
                "missing_positions": missing,
            }
        )

    expected_total = sum(len(positions) for positions in expected_positions.values())
    return {
        "expected_tokens": expected_total,
        "actual_occurrences": len(occurrences),
        "mismatch_ayah_count": len(mismatches),
        "missing_token_total": missing_token_total,
        "sample_mismatches": mismatches[:10],
    }


def build_words_sql(words):
    """Generate INSERT for words table from canonical full-coverage word list."""
    lines = ["-- Words"]
    batch_size = 500
    batch = []

    for word in words:
        batch.append(
            f"({word['id']}, {escape_sql(word['text_uthmani'])}, {escape_sql(word['text_simple'])}, "
            f"{escape_sql(word.get('translation_bm') or None)}, {escape_sql(word.get('translation_en') or None)}, "
            f"{escape_sql(word.get('transliteration') or None)}, {escape_sql(word.get('root') or None)}, "
            f"NULL, {escape_sql(word.get('pos') or None)}, {safe_int(word.get('frequency'), 0)})"
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


def build_themes_sql(themes):
    """Generate INSERT for themes table."""
    lines = ["-- Themes"]
    lines.append(f"-- Total: {len(themes)}")
    if not themes:
        return "\n".join(lines)

    batch_size = 500
    batch = []

    for t in themes:
        parent = t.get("parent_id")
        batch.append(
            f"({t['id']}, {escape_sql(t.get('name_bm') or t.get('name_en') or '')}, "
            f"{escape_sql(t.get('name_en') or t.get('name_bm') or '')}, "
            f"{escape_sql(t['category'])}, "
            f"{escape_sql(t.get('description_bm'))}, {escape_sql(t.get('description_en'))}, "
            f"{parent if parent else 'NULL'})"
        )

        if len(batch) >= batch_size:
            lines.append(
                "INSERT INTO themes (id, name_bm, name_en, category, description_bm, description_en, parent_id) VALUES"
            )
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append(
            "INSERT INTO themes (id, name_bm, name_en, category, description_bm, description_en, parent_id) VALUES"
        )
        lines.append(",\n".join(batch) + ";")

    return "\n".join(lines)


def build_theme_ayat_sql(theme_ayat):
    """Generate INSERT for theme_ayat table."""
    lines = ["-- Theme Ayat Links"]

    deduped = []
    seen = set()
    for link in theme_ayat:
        key = (link.get("theme_id"), link.get("surah_id"), link.get("ayah_number"))
        if None in key or key in seen:
            continue
        seen.add(key)
        deduped.append(link)

    lines.append(f"-- Total: {len(deduped)}")
    if not deduped:
        return "\n".join(lines)

    batch_size = 1000
    batch = []

    for link in deduped:
        batch.append(
            f"({link['theme_id']}, "
            f"(SELECT id FROM ayat WHERE surah_id = {link['surah_id']} AND ayah_number = {link['ayah_number']}), "
            f"{escape_sql(link.get('relevance') or 'secondary')}, "
            f"{escape_sql(link.get('notes'))})"
        )

        if len(batch) >= batch_size:
            lines.append("INSERT INTO theme_ayat (theme_id, ayah_id, relevance, notes) VALUES")
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append("INSERT INTO theme_ayat (theme_id, ayah_id, relevance, notes) VALUES")
        lines.append(",\n".join(batch) + ";")

    return "\n".join(lines)


def build_mutashabihat_sql(mutashabihat):
    """Generate INSERT for mutashabihat table."""
    lines = ["-- Mutashabihat Patterns"]
    lines.append(f"-- Total: {len(mutashabihat)}")
    if not mutashabihat:
        return "\n".join(lines)

    batch_size = 500
    batch = []

    for m in mutashabihat:
        batch.append(
            f"({m['id']}, {escape_sql(m['pattern_text'])}, "
            f"{escape_sql(m.get('description_bm'))}, {escape_sql(m.get('description_en'))}, "
            f"{m.get('ayah_count', 0)}, {m.get('difficulty_rating') or 'NULL'})"
        )

        if len(batch) >= batch_size:
            lines.append(
                "INSERT INTO mutashabihat (id, pattern_text, description_bm, description_en, ayah_count, difficulty_rating) VALUES"
            )
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append(
            "INSERT INTO mutashabihat (id, pattern_text, description_bm, description_en, ayah_count, difficulty_rating) VALUES"
        )
        lines.append(",\n".join(batch) + ";")

    return "\n".join(lines)


def build_mutashabihat_ayat_sql(mutashabihat_ayat):
    """Generate INSERT for mutashabihat_ayat table."""
    lines = ["-- Mutashabihat Ayat Links"]

    deduped = []
    seen = set()
    for link in mutashabihat_ayat:
        key = (link.get("mutashabihat_id"), link.get("surah_id"), link.get("ayah_number"))
        if None in key or key in seen:
            continue
        seen.add(key)
        deduped.append(link)

    lines.append(f"-- Total: {len(deduped)}")
    if not deduped:
        return "\n".join(lines)

    batch_size = 1000
    batch = []

    for link in deduped:
        batch.append(
            f"({link['mutashabihat_id']}, "
            f"(SELECT id FROM ayat WHERE surah_id = {link['surah_id']} AND ayah_number = {link['ayah_number']}), "
            f"{int(link.get('word_start') or 1)}, {int(link.get('word_end') or 1)}, "
            f"{escape_sql(link.get('variation_note'))})"
        )

        if len(batch) >= batch_size:
            lines.append(
                "INSERT INTO mutashabihat_ayat (mutashabihat_id, ayah_id, word_start, word_end, variation_note) VALUES"
            )
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append(
            "INSERT INTO mutashabihat_ayat (mutashabihat_id, ayah_id, word_start, word_end, variation_note) VALUES"
        )
        lines.append(",\n".join(batch) + ";")

    return "\n".join(lines)


def build_ayah_theme_chunks_sql(chunks):
    """Generate INSERT for ayah_theme_chunks table."""
    lines = ["-- Ayah Theme Chunks"]

    deduped = []
    seen = set()
    for chunk in chunks:
        key = (
            chunk.get("surah_id"),
            chunk.get("ayah_from"),
            chunk.get("ayah_to"),
            (chunk.get("theme") or "").strip(),
        )
        if None in key[:3] or not key[3] or key in seen:
            continue
        seen.add(key)
        deduped.append(chunk)

    lines.append(f"-- Total: {len(deduped)}")
    if not deduped:
        return "\n".join(lines)

    batch_size = 1000
    batch = []

    for chunk in deduped:
        batch.append(
            f"({chunk.get('source_chunk_id') or 'NULL'}, "
            f"{chunk['surah_id']}, {chunk['ayah_from']}, {chunk['ayah_to']}, "
            f"(SELECT id FROM ayat WHERE surah_id = {chunk['surah_id']} AND ayah_number = {chunk['ayah_from']}), "
            f"(SELECT id FROM ayat WHERE surah_id = {chunk['surah_id']} AND ayah_number = {chunk['ayah_to']}), "
            f"{escape_sql(chunk.get('verse_key_from'))}, {escape_sql(chunk.get('verse_key_to'))}, "
            f"{chunk.get('verses_count') or (chunk['ayah_to'] - chunk['ayah_from'] + 1)}, "
            f"{escape_sql(chunk['theme'])}, {escape_sql(chunk.get('theme_bm'))}, "
            f"{to_sql_text_array(chunk.get('keywords') or [])}, "
            f"{chunk.get('book_id') or 'NULL'})"
        )

        if len(batch) >= batch_size:
            lines.append(
                "INSERT INTO ayah_theme_chunks "
                "(source_chunk_id, surah_id, ayah_from, ayah_to, ayah_id_from, ayah_id_to, "
                "verse_key_from, verse_key_to, verses_count, theme, theme_bm, keywords, book_id) VALUES"
            )
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append(
            "INSERT INTO ayah_theme_chunks "
            "(source_chunk_id, surah_id, ayah_from, ayah_to, ayah_id_from, ayah_id_to, "
            "verse_key_from, verse_key_to, verses_count, theme, theme_bm, keywords, book_id) VALUES"
        )
        lines.append(",\n".join(batch) + ";")

    return "\n".join(lines)


def build_tafsir_notes_sql(tafsir_notes):
    """Generate INSERT for tafsir_notes table."""
    lines = ["-- Tafsir Notes"]

    deduped = []
    seen = set()
    for note in tafsir_notes:
        key = (
            note.get("surah_id"),
            note.get("ayah_number"),
            (note.get("source") or "").strip(),
        )
        if None in key[:2] or not key[2] or key in seen:
            continue
        seen.add(key)
        deduped.append(note)

    lines.append(f"-- Total: {len(deduped)}")
    if not deduped:
        return "\n".join(lines)

    batch_size = 1000
    batch = []

    for note in deduped:
        batch.append(
            f"((SELECT id FROM ayat WHERE surah_id = {note['surah_id']} AND ayah_number = {note['ayah_number']}), "
            f"{escape_sql(note['source'])}, "
            f"{escape_sql(note.get('text_bm'))}, {escape_sql(note.get('text_en'))}, "
            f"{escape_sql(note.get('text_arabic'))})"
        )

        if len(batch) >= batch_size:
            lines.append("INSERT INTO tafsir_notes (ayah_id, source, text_bm, text_en, text_arabic) VALUES")
            lines.append(",\n".join(batch) + ";")
            batch = []

    if batch:
        lines.append("INSERT INTO tafsir_notes (ayah_id, source, text_bm, text_en, text_arabic) VALUES")
        lines.append(",\n".join(batch) + ";")

    return "\n".join(lines)


def main():
    print("=" * 60)
    print("Miftah — Build Supabase Seed SQL")
    print("=" * 60)

    # Load extracted QUL data
    surahs = load_json(SEED_DIR / "surahs.json")
    ayat = load_json(SEED_DIR / "ayat.json")
    legacy_words = load_json(SEED_DIR / "words.json")
    legacy_occurrences = load_json(SEED_DIR / "word_occurrences.json")
    themes = load_json_optional(SEED_DIR / "themes.json", [])
    theme_ayat = load_json_optional(SEED_DIR / "theme_ayat.json", [])
    ayah_theme_chunks = load_json_optional(SEED_DIR / "ayah_theme_chunks.json", [])
    mutashabihat = load_json_optional(SEED_DIR / "mutashabihat.json", [])
    mutashabihat_ayat = load_json_optional(SEED_DIR / "mutashabihat_ayat.json", [])
    tafsir_notes = load_json_optional(SEED_DIR / "tafsir_notes.json", [])

    # Load translations
    sahih = load_json(QUL_DIR / "en-sahih-international-simple.json")
    basmeih = load_json(QUL_DIR / "abdullah-basamia-simple.json")
    bm_wbw = load_json(DATA_DIR / "bm_wbw_complete.json")
    en_wbw = load_json(QUL_DIR / "english-wbw-translation.json")

    print(
        f"\nLoaded: {len(surahs)} surahs, {len(ayat)} ayat (QUL), "
        f"{len(legacy_words)} words (legacy), {len(legacy_occurrences)} occurrences (legacy)"
    )
    print(
        f"Thematic: themes={len(themes)}, theme_ayat={len(theme_ayat)} | "
        f"Mutashabihat: patterns={len(mutashabihat)}, links={len(mutashabihat_ayat)}"
    )
    print(f"Ayah theme chunks: {len(ayah_theme_chunks)}")
    print(f"Tafsir notes: {len(tafsir_notes)}")
    print(f"Translations: Sahih={len(sahih)}, Basmeih={len(basmeih)}, BM-WBW={len(bm_wbw)}, EN-WBW={len(en_wbw)}")

    # Build canonical ayah records + full-coverage words/occurrences
    ayah_records, surah_meta = build_full_ayah_records(ayat, sahih, basmeih)
    words, occurrences = build_complete_words_and_occurrences(
        ayah_records,
        legacy_words,
        bm_wbw,
        en_wbw,
    )
    wbw_coverage = audit_word_occurrence_coverage(ayah_records, occurrences)
    print(
        "WBW coverage audit: "
        f"expected_tokens={wbw_coverage['expected_tokens']}, "
        f"actual_occurrences={wbw_coverage['actual_occurrences']}, "
        f"mismatch_ayah={wbw_coverage['mismatch_ayah_count']}"
    )
    if wbw_coverage["mismatch_ayah_count"] > 0:
        sample = wbw_coverage["sample_mismatches"][:3]
        raise RuntimeError(
            "Word-occurrence coverage audit failed. "
            f"Mismatched ayat={wbw_coverage['mismatch_ayah_count']}, "
            f"missing_tokens={wbw_coverage['missing_token_total']}, sample={sample}"
        )

    # Build SQL
    print("\nBuilding SQL...")
    sql_parts = []

    sql_parts.append("-- Miftah Supabase Seed Data")
    sql_parts.append("-- Generated from QUL data + tanzil.net metadata + BM translations")
    sql_parts.append("-- Run AFTER latest schema migrations")
    sql_parts.append("BEGIN;\n")

    # Surahs
    sql_parts.append(build_surahs_sql(surahs, surah_meta))
    sql_parts.append("")

    # Ayat (with juz_start fix for surahs after ayat are inserted)
    ayat_sql, total_ayat, ayat_with_arabic = build_ayat_sql(ayah_records)
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
    sql_parts.append(build_words_sql(words))
    sql_parts.append("")

    # Word occurrences
    sql_parts.append(build_word_occurrences_sql(occurrences))
    sql_parts.append("")

    # Themes + links
    sql_parts.append(build_themes_sql(themes))
    sql_parts.append("")
    sql_parts.append(build_theme_ayat_sql(theme_ayat))
    sql_parts.append("")
    sql_parts.append(build_ayah_theme_chunks_sql(ayah_theme_chunks))
    sql_parts.append("")

    # Mutashabihat + links
    sql_parts.append(build_mutashabihat_sql(mutashabihat))
    sql_parts.append("")
    sql_parts.append(build_mutashabihat_ayat_sql(mutashabihat_ayat))
    sql_parts.append("")

    # Tafsir notes
    sql_parts.append(build_tafsir_notes_sql(tafsir_notes))
    sql_parts.append("")

    # Reset sequences
    sql_parts.append("-- Reset sequences")
    sql_parts.append("SELECT setval('ayat_id_seq', (SELECT MAX(id) FROM ayat));")
    sql_parts.append("SELECT setval('words_id_seq', (SELECT MAX(id) FROM words));")
    sql_parts.append("SELECT setval('word_occurrences_id_seq', (SELECT MAX(id) FROM word_occurrences));")
    sql_parts.append("SELECT setval('themes_id_seq', (SELECT MAX(id) FROM themes));")
    sql_parts.append("SELECT setval('theme_ayat_id_seq', (SELECT MAX(id) FROM theme_ayat));")
    sql_parts.append("SELECT setval('ayah_theme_chunks_id_seq', (SELECT MAX(id) FROM ayah_theme_chunks));")
    sql_parts.append("SELECT setval('mutashabihat_id_seq', (SELECT MAX(id) FROM mutashabihat));")
    sql_parts.append("SELECT setval('mutashabihat_ayat_id_seq', (SELECT MAX(id) FROM mutashabihat_ayat));")
    sql_parts.append("SELECT setval('tafsir_notes_id_seq', (SELECT MAX(id) FROM tafsir_notes));")
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
    missing_ayat = total_ayat - ayat_with_arabic
    if missing_ayat > 0:
        arabic_note = (
            f"NOTE: {missing_ayat} ayat still missing Arabic text after merge. "
            "Use full QUL dump and/or verify Tanzil source files."
        )
    else:
        arabic_note = (
            "NOTE: Arabic text coverage is complete via Tanzil + QUL merge."
        )

    stats = f"""Miftah — Seed Data Statistics
==============================
Surahs: {len(surahs)}
Ayat: {total_ayat} total ({ayat_with_arabic} with Arabic text from Tanzil/QUL)
  → {missing_ayat} ayat need Arabic text
Unique words: {len(words)}
Word occurrences: {len(occurrences)}
WBW expected token total: {wbw_coverage['expected_tokens']}
WBW mismatch ayat: {wbw_coverage['mismatch_ayah_count']}
WBW missing token positions: {wbw_coverage['missing_token_total']}
Themes: {len(themes)}
Theme-ayah links: {len(theme_ayat)}
Ayah theme chunks: {len(ayah_theme_chunks)}
Mutashabihat patterns: {len(mutashabihat)}
Mutashabihat links: {len(mutashabihat_ayat)}
Tafsir notes: {len(tafsir_notes)}

Translations loaded:
  Basmeih (BM ayah): {len(basmeih)} ayat
  Sahih (EN ayah): {len(sahih)} ayat
  BM WBW: {len(bm_wbw)} word positions
  EN WBW: {len(en_wbw)} word positions

{arabic_note}
"""
    stats_path = SEED_DIR / "seed_stats.txt"
    with open(stats_path, 'w') as f:
        f.write(stats)
    print(stats)


if __name__ == "__main__":
    main()
