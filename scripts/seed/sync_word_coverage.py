#!/usr/bin/env python3
"""
Sync words + word_occurrences to full ayah token coverage.

This script:
1) Builds canonical full-coverage words/occurrences from Tanzil + metadata.
2) Reuses existing words.id for matching text_uthmani where possible.
3) Inserts missing words.
4) Rebuilds word_occurrences with complete position coverage.

Usage:
    python3 scripts/seed/sync_word_coverage.py

Requires:
    DATABASE_URL in environment or .env.local
"""

import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Installing psycopg2-binary...")
    os.system(f"{sys.executable} -m pip install psycopg2-binary -q")
    import psycopg2
    from psycopg2.extras import execute_values

from build_seed import (
    DATA_DIR,
    QUL_DIR,
    SEED_DIR,
    audit_word_occurrence_coverage,
    build_complete_words_and_occurrences,
    build_full_ayah_records,
    load_json,
    load_json_optional,
)


def load_database_url():
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return db_url

    env_path = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_path.exists():
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip()
    return None


def main():
    db_url = load_database_url()
    if not db_url:
        raise SystemExit("DATABASE_URL not found in env or .env.local")

    print("Loading local seed inputs...", flush=True)
    ayat = load_json(SEED_DIR / "ayat.json")
    legacy_words = load_json(SEED_DIR / "words.json")
    sahih = load_json(QUL_DIR / "en-sahih-international-simple.json")
    basmeih = load_json(QUL_DIR / "abdullah-basamia-simple.json")
    bm_wbw = load_json(DATA_DIR / "bm_wbw_complete.json")
    en_wbw = load_json_optional(QUL_DIR / "english-wbw-translation.json", {})

    ayah_records, _ = build_full_ayah_records(ayat, sahih, basmeih)
    words, occurrences = build_complete_words_and_occurrences(
        ayah_records,
        legacy_words,
        bm_wbw,
        en_wbw,
    )
    coverage = audit_word_occurrence_coverage(ayah_records, occurrences)
    if coverage["mismatch_ayah_count"] > 0:
        raise RuntimeError(
            "Local coverage generation failed before DB sync: "
            f"{coverage['mismatch_ayah_count']} mismatched ayat."
        )

    print(
        f"Prepared local dataset: words={len(words)}, occurrences={len(occurrences)}, "
        f"tokens={coverage['expected_tokens']}"
    , flush=True)

    print("Connecting database...", flush=True)
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Existing words by text_uthmani (keep lowest id if duplicates exist)
        cur.execute("SELECT id, text_uthmani FROM words ORDER BY id")
        existing_rows = cur.fetchall()
        existing_word_id_by_text = {}
        for word_id, text in existing_rows:
            if text and text not in existing_word_id_by_text:
                existing_word_id_by_text[text] = word_id

        desired_word_id_by_text = {}
        inserted = 0

        missing_word_rows = []
        for word in words:
            text_uthmani = word["text_uthmani"]
            existing_id = existing_word_id_by_text.get(text_uthmani)
            if existing_id is None:
                missing_word_rows.append(
                    (
                        word["text_uthmani"],
                        word["text_simple"],
                        word.get("translation_bm"),
                        word.get("translation_en"),
                        word.get("transliteration") or None,
                        word.get("root") or None,
                        None,
                        word.get("pos") or None,
                        int(word.get("frequency") or 0),
                    )
                )

        if missing_word_rows:
            print(f"Inserting missing words: {len(missing_word_rows)}", flush=True)
            execute_values(
                cur,
                """
                INSERT INTO words
                  (text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                missing_word_rows,
                page_size=1000,
            )
            inserted = len(missing_word_rows)

            cur.execute("SELECT id, text_uthmani FROM words ORDER BY id")
            existing_rows = cur.fetchall()
            existing_word_id_by_text = {}
            for word_id, text in existing_rows:
                if text and text not in existing_word_id_by_text:
                    existing_word_id_by_text[text] = word_id

        for word in words:
            desired_word_id_by_text[word["text_uthmani"]] = existing_word_id_by_text[word["text_uthmani"]]

        desired_word_rows = []
        for word in words:
            desired_word_rows.append(
                (
                    word["text_uthmani"],
                    word["text_simple"],
                    word.get("translation_bm"),
                    word.get("translation_en"),
                    word.get("transliteration") or None,
                    word.get("root") or None,
                    word.get("pos") or None,
                    int(word.get("frequency") or 0),
                )
            )

        # Map ayat IDs once so occurrence inserts are direct and fast.
        cur.execute("SELECT id, surah_id, ayah_number FROM ayat")
        ayah_id_by_key = {f"{surah}:{ayah}": ayah_id for ayah_id, surah, ayah in cur.fetchall()}

        occurrence_rows = []
        for occ in occurrences:
            word_text = words[occ["word_id"] - 1]["text_uthmani"]
            mapped_word_id = desired_word_id_by_text[word_text]
            ayah_id = ayah_id_by_key.get(occ["verse_key"])
            if ayah_id is None:
                continue
            occurrence_rows.append(
                (
                    mapped_word_id,
                    ayah_id,
                    int(occ["position"]),
                    int(occ.get("page_number") or 0),
                )
            )

        print(
            f"Applying DB updates: insert_words={inserted}, "
            f"replace_occurrences={len(occurrence_rows)}",
            flush=True,
        )

        cur.execute(
            """
            CREATE TEMP TABLE desired_word_updates (
              text_uthmani TEXT PRIMARY KEY,
              text_simple TEXT,
              translation_bm TEXT,
              translation_en TEXT,
              transliteration TEXT,
              root TEXT,
              pos TEXT,
              frequency INTEGER
            ) ON COMMIT DROP
            """
        )
        execute_values(
            cur,
            """
            INSERT INTO desired_word_updates
              (text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, pos, frequency)
            VALUES %s
            """,
            desired_word_rows,
            page_size=1000,
        )
        cur.execute(
            """
            UPDATE words
            SET
              text_simple = desired.text_simple,
              translation_bm = desired.translation_bm,
              translation_en = desired.translation_en,
              transliteration = desired.transliteration,
              root = desired.root,
              pos = desired.pos,
              frequency = desired.frequency
            FROM desired_word_updates desired
            WHERE words.text_uthmani = desired.text_uthmani
              AND (
                words.text_simple IS DISTINCT FROM desired.text_simple
                OR words.translation_bm IS DISTINCT FROM desired.translation_bm
                OR words.translation_en IS DISTINCT FROM desired.translation_en
                OR words.transliteration IS DISTINCT FROM desired.transliteration
                OR words.root IS DISTINCT FROM desired.root
                OR words.pos IS DISTINCT FROM desired.pos
                OR words.frequency IS DISTINCT FROM desired.frequency
              )
            """
        )
        updated_words = cur.rowcount

        cur.execute("TRUNCATE word_occurrences")
        execute_values(
            cur,
            """
            INSERT INTO word_occurrences (word_id, ayah_id, position, page_number)
            VALUES %s
            """,
            occurrence_rows,
            page_size=1000,
        )

        cur.execute(
            """
            UPDATE ayat
            SET word_count = sub.token_count
            FROM (
              SELECT
                wo.ayah_id,
                COUNT(*)::INT AS token_count
              FROM word_occurrences wo
              GROUP BY wo.ayah_id
            ) sub
            WHERE ayat.id = sub.ayah_id
            """
        )

        cur.execute(
            "SELECT setval('word_occurrences_id_seq', (SELECT COALESCE(MAX(id), 0) FROM word_occurrences))"
        )

        conn.commit()

        cur.execute("SELECT COUNT(*) FROM words")
        total_words = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*), COUNT(DISTINCT ayah_id) FROM word_occurrences")
        total_occ, covered_ayat = cur.fetchone()
        print(
            f"Sync complete: total_words={total_words}, updated_words={updated_words}, occurrences={total_occ}, "
            f"ayat_covered={covered_ayat}"
        , flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
