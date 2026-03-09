#!/usr/bin/env python3
"""
Miftah — Extract QUL data from mini_quran_dev.sql into clean JSON files.
Parses PostgreSQL COPY statements and exports seed-ready artifacts.

Usage:
    python3 extract_qul_data.py

Input:  data/qul/mini_quran_dev.sql
Output: data/seed/surahs.json
        data/seed/ayat.json
        data/seed/words.json
        data/seed/word_occurrences.json
        data/seed/roots.json
        data/seed/themes.json
        data/seed/theme_ayat.json
        data/seed/ayah_theme_chunks.json
        data/seed/mutashabihat.json
        data/seed/mutashabihat_ayat.json
        data/seed/tafsir_notes.json
"""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
QUL_SQL = DATA_DIR / "qul" / "mini_quran_dev.sql"
FULL_AYAH_THEME_PATH = DATA_DIR / "qul" / "ayah_theme_chunks.full.json"
SEED_DIR = DATA_DIR / "seed"

HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"\s+")
PUNCT_RE = re.compile(r"[^\u0600-\u06FF0-9A-Za-z]+")

ARABIC_STOPWORDS = {
    "من", "في", "على", "إلى", "عن", "ما", "لا", "و", "يا", "أو", "ثم", "إن",
    "أن", "إلا", "كل", "هو", "هي", "هذا", "هذه", "ذلك", "تلك", "كان", "كانت",
    "قد", "لم", "لن", "إذ", "إذا", "وما", "ولا", "بل", "بما", "لما", "له", "لهذا",
    "فإن", "فما", "إنه", "إنا",
}

# Curated tafsir resources from QUL dump:
# 14  = Tafsir Ibn Kathir (Arabic)
# 171 = English Al-Mukhtasar
DEFAULT_TAFSIR_RESOURCE_IDS = {14, 171}
TAFSIR_RESOURCE_NAMES = {
    14: "Tafsir Ibn Kathir",
    171: "English Al-Mukhtasar",
}


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


def to_int(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def clean_text(value):
    if value is None:
        return ""
    s = HTML_TAG_RE.sub(" ", str(value))
    s = s.replace("&nbsp;", " ").replace("&amp;", "&")
    s = MULTI_SPACE_RE.sub(" ", s).strip()
    return s


def parse_json_array_strings(value):
    if value in (None, "", "[]"):
        return []
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    items = []
    for item in parsed:
        if item is None:
            continue
        txt = clean_text(item)
        if txt:
            items.append(txt)
    return items


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


def tokenize_simple(text):
    tokens = []
    for raw in str(text or "").split():
        token = PUNCT_RE.sub("", raw).strip()
        if token:
            tokens.append(token)
    return tokens


def classify_theme_category(name_en, name_ar, name_fr, description):
    text = " ".join(
        x.lower()
        for x in [name_en or "", name_ar or "", name_fr or "", description or ""]
    )

    aqidah_keys = [
        "allah", "god", "faith", "islam", "iman", "kufr", "jahannam", "hell",
        "paradise", "jannah", "angel", "devil", "iblis", "quran", "resurrection",
        "akhirah", "heaven", "mercy",
    ]
    ibadah_keys = [
        "prayer", "salah", "salat", "zakat", "fast", "hajj", "dua", "worship",
        "ramadan", "qibla", "mosque", "purification", "wudu", "ablution",
    ]
    muamalat_keys = [
        "marriage", "divorce", "trade", "loan", "inherit", "contract", "law",
        "riba", "business", "justice", "penalty", "witness", "debt",
    ]
    akhlak_keys = [
        "patience", "gratitude", "forgive", "kindness", "character", "ethic",
        "hypocrite", "sincer", "arrogance", "humility", "truth", "honesty",
    ]
    kawniyyat_keys = [
        "sun", "moon", "earth", "sky", "star", "sea", "mountain", "wind", "rain",
        "camel", "animal", "tree", "plant", "astronomy", "day", "night", "dust",
    ]

    if any(k in text for k in ibadah_keys):
        return "ibadah"
    if any(k in text for k in muamalat_keys):
        return "muamalat"
    if any(k in text for k in akhlak_keys):
        return "akhlak"
    if any(k in text for k in kawniyyat_keys):
        return "kawniyyat"
    if any(k in text for k in aqidah_keys):
        return "aqidah"
    return "qasas"


def build_topic_index(topics_rows, translated_names_rows):
    topic_index = {}

    for row in topics_rows:
        tid = to_int(row.get("id"))
        if not tid:
            continue
        topic_index[tid] = {
            "id": tid,
            "name_en": (row.get("name") or "").strip() or None,
            "name_ar": (row.get("arabic_name") or "").strip() or None,
            "name_fr": None,
            "description": clean_text(row.get("description")),
            "parent_id": to_int(row.get("parent_id")),
            "thematic_parent_id": to_int(row.get("thematic_parent_id")),
            "ontology_parent_id": to_int(row.get("ontology_parent_id")),
        }

    for row in translated_names_rows:
        if row.get("resource_type") != "Topic":
            continue
        tid = to_int(row.get("resource_id"))
        if not tid:
            continue
        if tid not in topic_index:
            topic_index[tid] = {
                "id": tid,
                "name_en": None,
                "name_ar": None,
                "name_fr": None,
                "description": "",
                "parent_id": None,
                "thematic_parent_id": None,
                "ontology_parent_id": None,
            }

        lang = (row.get("language_name") or "").lower()
        name = (row.get("name") or "").strip() or None
        if not name:
            continue

        if lang == "english" and not topic_index[tid]["name_en"]:
            topic_index[tid]["name_en"] = name
        elif lang == "arabic" and not topic_index[tid]["name_ar"]:
            topic_index[tid]["name_ar"] = name
        elif lang == "french" and not topic_index[tid]["name_fr"]:
            topic_index[tid]["name_fr"] = name

    return topic_index


def extract_thematic_data(ayat, topics_rows, translated_names_rows, verse_topics_rows):
    topic_index = build_topic_index(topics_rows, translated_names_rows)
    ayah_by_qul_id = {a["qul_verse_id"]: a for a in ayat if a.get("qul_verse_id")}

    valid_rows = []
    for row in verse_topics_rows:
        topic_id = to_int(row.get("topic_id"))
        verse_id = to_int(row.get("verse_id"))
        if not topic_id or not verse_id:
            continue
        if verse_id not in ayah_by_qul_id:
            continue
        valid_rows.append(row)

    used_topic_ids = sorted({to_int(r["topic_id"]) for r in valid_rows if to_int(r["topic_id"])})
    used_topic_set = set(used_topic_ids)

    themes = []
    for tid in used_topic_ids:
        topic = topic_index.get(
            tid,
            {
                "name_en": None,
                "name_ar": None,
                "name_fr": None,
                "description": "",
                "parent_id": None,
                "thematic_parent_id": None,
                "ontology_parent_id": None,
            },
        )

        name_en = topic.get("name_en") or topic.get("name_fr") or f"Topic {tid}"
        name_bm = name_en
        parent_candidate = (
            topic.get("thematic_parent_id")
            or topic.get("parent_id")
            or topic.get("ontology_parent_id")
        )
        parent_id = parent_candidate if parent_candidate in used_topic_set else None

        category = classify_theme_category(
            name_en,
            topic.get("name_ar"),
            topic.get("name_fr"),
            topic.get("description"),
        )

        themes.append(
            {
                "id": tid,
                "name_bm": name_bm,
                "name_en": name_en,
                "category": category,
                "description_bm": None,
                "description_en": topic.get("description") or None,
                "parent_id": parent_id,
            }
        )

    theme_id_set = {t["id"] for t in themes}
    theme_ayat = []
    link_id = 1
    for row in valid_rows:
        topic_id = to_int(row.get("topic_id"))
        verse_id = to_int(row.get("verse_id"))
        if not topic_id or topic_id not in theme_id_set or not verse_id:
            continue
        ay = ayah_by_qul_id[verse_id]
        thematic = (row.get("thematic") or "").lower() == "t"
        ontology = (row.get("ontology") or "").lower() == "t"
        relevance = "primary" if thematic else ("secondary" if ontology else "secondary")
        notes = row.get("topic_words")
        if notes in (None, "", "[]", "{}"):
            notes = None

        theme_ayat.append(
            {
                "id": link_id,
                "theme_id": topic_id,
                "surah_id": ay["surah_id"],
                "ayah_number": ay["ayah_number"],
                "relevance": relevance,
                "notes": notes,
            }
        )
        link_id += 1

    return themes, theme_ayat


def extract_ayah_theme_chunks(ayah_theme_rows):
    """
    Extract sequential ayah theme chunks from QUL ayah_themes table.
    Expected format: surah + ayah range + theme label.
    """
    chunks = []
    seen = set()

    for row in ayah_theme_rows:
        source_chunk_id = to_int(row.get("id"))
        surah_id = to_int(row.get("chapter_id"))
        ayah_from = to_int(row.get("verse_number_from"))
        ayah_to = to_int(row.get("verse_number_to"))
        verse_key_from = (row.get("verse_key_from") or "").strip() or None
        verse_key_to = (row.get("verse_key_to") or "").strip() or None
        theme = clean_text(row.get("theme")) or None

        # Fallback parse from verse keys when numeric fields are missing
        if (not surah_id or not ayah_from) and verse_key_from and ":" in verse_key_from:
            s, a = verse_key_from.split(":", 1)
            surah_id = surah_id or to_int(s)
            ayah_from = ayah_from or to_int(a)
        if not ayah_to and verse_key_to and ":" in verse_key_to:
            _, a = verse_key_to.split(":", 1)
            ayah_to = to_int(a)

        if not surah_id or not ayah_from or not ayah_to or ayah_to < ayah_from or not theme:
            continue

        dedupe_key = (surah_id, ayah_from, ayah_to, theme)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        keywords = parse_json_array_strings(row.get("keywords"))
        verses_count = to_int(row.get("verses_count")) or (ayah_to - ayah_from + 1)
        book_id = to_int(row.get("book_id"))

        chunks.append(
            {
                "id": len(chunks) + 1,
                "source_chunk_id": source_chunk_id,
                "surah_id": surah_id,
                "ayah_from": ayah_from,
                "ayah_to": ayah_to,
                "verse_key_from": verse_key_from or f"{surah_id}:{ayah_from}",
                "verse_key_to": verse_key_to or f"{surah_id}:{ayah_to}",
                "verses_count": verses_count,
                "theme": theme,
                "theme_bm": clean_text(row.get("theme_bm")) or None,
                "keywords": keywords,
                "book_id": book_id,
            }
        )

    chunks.sort(key=lambda x: (x["surah_id"], x["ayah_from"], x["ayah_to"], x["id"]))
    for idx, chunk in enumerate(chunks, 1):
        chunk["id"] = idx
    return chunks


def load_prefetched_ayah_theme_chunks(path):
    if not path.exists():
        return []
    try:
        raw = json.load(open(path, encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"  WARN: failed to load {path}: {exc}")
        return []

    if not isinstance(raw, list):
        print(f"  WARN: {path} is not a list, ignored")
        return []

    chunks = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue

        surah_id = to_int(item.get("surah_id"))
        ayah_from = to_int(item.get("ayah_from"))
        ayah_to = to_int(item.get("ayah_to"))
        theme = clean_text(item.get("theme")) or None
        if not surah_id or not ayah_from or not ayah_to or ayah_to < ayah_from or not theme:
            continue

        key = (surah_id, ayah_from, ayah_to, theme)
        if key in seen:
            continue
        seen.add(key)

        keywords = item.get("keywords")
        if isinstance(keywords, list):
            keywords = [clean_text(v) for v in keywords if clean_text(v)]
        else:
            keywords = []

        source_chunk_id = to_int(item.get("source_chunk_id"))
        verses_count = to_int(item.get("verses_count")) or (ayah_to - ayah_from + 1)

        chunks.append(
            {
                "id": len(chunks) + 1,
                "source_chunk_id": source_chunk_id,
                "surah_id": surah_id,
                "ayah_from": ayah_from,
                "ayah_to": ayah_to,
                "verse_key_from": item.get("verse_key_from") or f"{surah_id}:{ayah_from}",
                "verse_key_to": item.get("verse_key_to") or f"{surah_id}:{ayah_to}",
                "verses_count": verses_count,
                "theme": theme,
                "theme_bm": clean_text(item.get("theme_bm")) or None,
                "keywords": keywords,
                "book_id": to_int(item.get("book_id")),
            }
        )

    chunks.sort(key=lambda x: (x["surah_id"], x["ayah_from"], x["ayah_to"], x["id"]))
    for idx, chunk in enumerate(chunks, 1):
        chunk["id"] = idx
    return chunks


def extract_mutashabihat_data(ayat):
    """
    QUL mini dump does not include a structured mutashabihat mapping table.
    Build a deterministic fallback from repeated 3/4-token Arabic phrases in
    available QUL verse text.
    """

    ngram_occurrences = defaultdict(list)

    for ay in ayat:
        tokens = tokenize_simple(ay.get("text_simple") or ay.get("text_uthmani") or "")
        if len(tokens) < 3:
            continue

        seen_in_ayah = set()
        for n in (4, 3):
            if len(tokens) < n:
                continue
            for start in range(0, len(tokens) - n + 1):
                gram_tokens = tokens[start:start + n]
                non_stop = [t for t in gram_tokens if t not in ARABIC_STOPWORDS]
                if len(non_stop) < 2:
                    continue
                phrase = " ".join(gram_tokens).strip()
                if len(phrase) < 8:
                    continue
                key = (phrase, start, start + n - 1)
                if key in seen_in_ayah:
                    continue
                seen_in_ayah.add(key)
                ngram_occurrences[phrase].append(
                    {
                        "surah_id": ay["surah_id"],
                        "ayah_number": ay["ayah_number"],
                        "word_start": start + 1,
                        "word_end": start + n,
                    }
                )

    candidates = []
    for phrase, occ in ngram_occurrences.items():
        uniq = {(x["surah_id"], x["ayah_number"], x["word_start"], x["word_end"]) for x in occ}
        by_ayah = {(x[0], x[1]) for x in uniq}
        ayah_count = len(by_ayah)
        if ayah_count < 2 or ayah_count > 12:
            continue
        token_count = len(phrase.split())
        score = (token_count * 2) + ayah_count
        candidates.append(
            {
                "phrase": phrase,
                "token_count": token_count,
                "ayah_count": ayah_count,
                "score": score,
                "occurrences": sorted(
                    [
                        {
                            "surah_id": s,
                            "ayah_number": a,
                            "word_start": ws,
                            "word_end": we,
                        }
                        for (s, a, ws, we) in uniq
                    ],
                    key=lambda x: (x["surah_id"], x["ayah_number"], x["word_start"]),
                ),
            }
        )

    candidates.sort(
        key=lambda x: (
            -x["token_count"],
            -x["ayah_count"],
            -x["score"],
            x["phrase"],
        )
    )

    # Avoid near-duplicates: keep one phrase per exact occurrence-set
    selected = []
    seen_occ_sets = set()
    for cand in candidates:
        occ_key = tuple(
            (o["surah_id"], o["ayah_number"], o["word_start"], o["word_end"])
            for o in cand["occurrences"]
        )
        if occ_key in seen_occ_sets:
            continue
        seen_occ_sets.add(occ_key)
        selected.append(cand)
        if len(selected) >= 300:
            break

    mutashabihat = []
    mutashabihat_ayat = []
    link_id = 1
    for idx, cand in enumerate(selected, 1):
        ayah_count = cand["ayah_count"]
        if ayah_count <= 2:
            difficulty = 5
        elif ayah_count <= 3:
            difficulty = 4
        elif ayah_count <= 5:
            difficulty = 3
        elif ayah_count <= 8:
            difficulty = 2
        else:
            difficulty = 1

        mutashabihat.append(
            {
                "id": idx,
                "pattern_text": cand["phrase"],
                "description_bm": "Diekstrak automatik daripada frasa berulang dalam data QUL.",
                "description_en": "Auto-extracted from repeated phrases in QUL verse text.",
                "ayah_count": ayah_count,
                "difficulty_rating": difficulty,
            }
        )

        for occ in cand["occurrences"]:
            mutashabihat_ayat.append(
                {
                    "id": link_id,
                    "mutashabihat_id": idx,
                    "surah_id": occ["surah_id"],
                    "ayah_number": occ["ayah_number"],
                    "word_start": occ["word_start"],
                    "word_end": occ["word_end"],
                    "variation_note": None,
                }
            )
            link_id += 1

    return mutashabihat, mutashabihat_ayat


def extract_tafsir_notes_from_sql(filepath, ayat, allowed_resource_ids=None):
    """
    Stream tafsir rows directly from SQL dump and emit seed-ready tafsir notes.
    We stream this table because tafsirs in QUL are large and text-heavy.
    """
    allowed = set(allowed_resource_ids or DEFAULT_TAFSIR_RESOURCE_IDS)
    ayah_by_qul_id = {a["qul_verse_id"]: a for a in ayat if a.get("qul_verse_id")}

    notes = []
    seen = set()
    source_counter = Counter()
    in_block = False
    columns = []
    idx = {}
    copy_prefix = "COPY quran.tafsirs ("

    def v(values, key):
        i = idx.get(key)
        if i is None or i >= len(values):
            return None
        val = values[i]
        return None if val == "\\N" else val

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            if not in_block:
                if line.startswith(copy_prefix):
                    col_str = line[len(copy_prefix):line.index(") FROM stdin")]
                    columns = [c.strip().strip('"') for c in col_str.split(",")]
                    idx = {c: i for i, c in enumerate(columns)}
                    in_block = True
                continue

            if line.strip() == "\\.":
                break

            values = line.rstrip("\n").split("\t")
            resource_id = to_int(v(values, "resource_content_id"))
            if resource_id not in allowed:
                continue

            verse_id = to_int(v(values, "verse_id"))
            if not verse_id or verse_id not in ayah_by_qul_id:
                continue

            text = clean_text(v(values, "text"))
            if not text:
                continue

            key = (resource_id, verse_id)
            if key in seen:
                continue
            seen.add(key)

            source = (
                TAFSIR_RESOURCE_NAMES.get(resource_id)
                or clean_text(v(values, "resource_name"))
                or f"QUL Tafsir {resource_id}"
            )
            language = (v(values, "language_name") or "").strip().lower()
            ay = ayah_by_qul_id[verse_id]

            text_bm = None
            text_en = None
            text_arabic = None
            if language == "english":
                text_en = text
            elif language == "arabic":
                text_arabic = text
            elif language in {"malay", "bahasa melayu", "indonesian"}:
                text_bm = text
            else:
                continue

            notes.append(
                {
                    "id": len(notes) + 1,
                    "surah_id": ay["surah_id"],
                    "ayah_number": ay["ayah_number"],
                    "source": source,
                    "text_bm": text_bm,
                    "text_en": text_en,
                    "text_arabic": text_arabic,
                }
            )
            source_counter[source] += 1

    if notes:
        top_sources = ", ".join(f"{k}={v}" for k, v in source_counter.most_common(5))
        print(
            f"  tafsirs: streamed {len(notes)} notes "
            f"from {len(source_counter)} source(s) [{top_sources}]"
        )
    else:
        print("  tafsirs: streamed 0 notes from selected resource IDs")

    return notes


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
    topics_rows, _ = parse_copy_block(QUL_SQL, 'topics')
    translated_names_rows, _ = parse_copy_block(QUL_SQL, 'translated_names')
    verse_topics_rows, _ = parse_copy_block(QUL_SQL, 'verse_topics')
    ayah_theme_rows, _ = parse_copy_block(QUL_SQL, 'ayah_themes')

    # Transform
    print("\nTransforming data...")
    roots_map = extract_roots(root_rows)
    surahs = extract_chapters(chapter_rows)
    ayat = extract_verses(verse_rows)
    words, occurrences = extract_words(word_rows, roots_map)
    themes, theme_ayat = extract_thematic_data(
        ayat,
        topics_rows,
        translated_names_rows,
        verse_topics_rows,
    )
    prefetched_chunks = load_prefetched_ayah_theme_chunks(FULL_AYAH_THEME_PATH)
    if prefetched_chunks:
        ayah_theme_chunks = prefetched_chunks
        print(
            f"  ayah_themes: using prefetched full dataset "
            f"from {FULL_AYAH_THEME_PATH} ({len(ayah_theme_chunks)} chunks)"
        )
    else:
        ayah_theme_chunks = extract_ayah_theme_chunks(ayah_theme_rows)
    mutashabihat, mutashabihat_ayat = extract_mutashabihat_data(ayat)
    tafsir_notes = extract_tafsir_notes_from_sql(QUL_SQL, ayat)

    print(f"\n  Surahs: {len(surahs)}")
    print(f"  Ayat: {len(ayat)}")
    print(f"  Unique words: {len(words)}")
    print(f"  Word occurrences: {len(occurrences)}")
    print(f"  Roots: {len(roots_map)}")
    print(f"  Themes: {len(themes)}")
    print(f"  Theme-ayah links: {len(theme_ayat)}")
    print(f"  Ayah theme chunks: {len(ayah_theme_chunks)}")
    print(f"  Mutashabihat patterns: {len(mutashabihat)}")
    print(f"  Mutashabihat links: {len(mutashabihat_ayat)}")
    print(f"  Tafsir notes: {len(tafsir_notes)}")

    # Write outputs
    for name, data in [
        ("surahs.json", surahs),
        ("ayat.json", ayat),
        ("words.json", words),
        ("word_occurrences.json", occurrences),
        ("roots.json", list(roots_map.values())),
        ("themes.json", themes),
        ("theme_ayat.json", theme_ayat),
        ("ayah_theme_chunks.json", ayah_theme_chunks),
        ("mutashabihat.json", mutashabihat),
        ("mutashabihat_ayat.json", mutashabihat_ayat),
        ("tafsir_notes.json", tafsir_notes),
    ]:
        path = SEED_DIR / name
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  Written: {path} ({len(data)} entries)")

    print("\nExtraction complete.")


if __name__ == "__main__":
    main()
