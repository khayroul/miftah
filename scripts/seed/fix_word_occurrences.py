#!/usr/bin/env python3
"""
Miftah — Fix word_occurrences to 100% coverage.

1. Update words.text_uthmani to QPC orthography using existing occurrences as bridge
2. Build word_occurrences for all 6,236 ayat by matching QPC tokens to words table

Usage:
    python3 fix_word_occurrences.py

Requires: DATABASE_URL env var or .env.local file
"""

import os
import re
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("Installing psycopg2-binary...")
    os.system(f"{sys.executable} -m pip install psycopg2-binary -q")
    import psycopg2

# Load DATABASE_URL
env_path = Path(__file__).parent.parent.parent / ".env.local"
db_url = os.environ.get("DATABASE_URL")
if not db_url and env_path.exists():
    with open(env_path) as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                db_url = line.split("=", 1)[1].strip()
                break

if not db_url:
    print("ERROR: DATABASE_URL not found")
    sys.exit(1)


def strip_diacritics(text):
    """Strip Arabic diacritics for fuzzy matching, keeping base letters."""
    # Remove: fathah, dammah, kasra, sukun (both forms), shadda, tanween,
    # superscript alef, waqf marks, maddah, hamza marks, etc.
    # Keep: base letters, tatweel
    return re.sub(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0617-\u061A\u08D3-\u08E1\u08E3-\u08FF]', '', text)


def main():
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    print("=" * 60)
    print("Miftah — Fix word_occurrences (36% → 100%)")
    print("=" * 60)

    # Step 1: Load all ayat with QPC text
    print("\n1. Loading ayat...")
    cur.execute("SELECT id, surah_id, ayah_number, text_uthmani, page_number FROM ayat ORDER BY id")
    ayat = cur.fetchall()
    print(f"   {len(ayat)} ayat loaded")

    # Step 2: Load current words
    print("\n2. Loading words...")
    cur.execute("SELECT id, text_uthmani, text_simple FROM words ORDER BY id")
    words = cur.fetchall()
    word_by_text = {}  # text_uthmani -> word_id
    word_by_stripped = {}  # stripped form -> [(word_id, text_uthmani)]
    for wid, text_u, text_s in words:
        word_by_text[text_u] = wid
        stripped = strip_diacritics(text_u)
        if stripped not in word_by_stripped:
            word_by_stripped[stripped] = []
        word_by_stripped[stripped].append((wid, text_u))
    print(f"   {len(words)} words, {len(word_by_stripped)} unique stripped forms")

    # Step 3: Use existing occurrences to map old word forms to QPC forms
    print("\n3. Building QPC form mapping from existing occurrences...")
    cur.execute("""
        SELECT wo.word_id, wo.position, a.text_uthmani
        FROM word_occurrences wo
        JOIN ayat a ON a.id = wo.ayah_id
        ORDER BY wo.word_id, wo.id
    """)
    existing_occ = cur.fetchall()
    print(f"   {len(existing_occ)} existing occurrences")

    # Map word_id -> most common QPC token
    word_qpc_forms = {}  # word_id -> {qpc_form: count}
    for word_id, position, ayah_text in existing_occ:
        tokens = ayah_text.split()
        if position > 0 and position <= len(tokens):
            token = tokens[position - 1]  # 1-indexed
            # Strip waqf marks from token (they're part of text but not word)
            token_clean = re.sub(r'[\u06D6-\u06DC]', '', token)
            if token_clean:
                if word_id not in word_qpc_forms:
                    word_qpc_forms[word_id] = {}
                word_qpc_forms[word_id][token_clean] = word_qpc_forms[word_id].get(token_clean, 0) + 1

    # Step 4: Update words.text_uthmani to QPC forms
    print("\n4. Updating words to QPC orthography...")
    updates = 0
    qpc_word_map = {}  # old_text -> new_text
    for word_id, forms in word_qpc_forms.items():
        if not forms:
            continue
        best_form = max(forms, key=forms.get)
        # Get current text
        cur.execute("SELECT text_uthmani FROM words WHERE id = %s", (word_id,))
        row = cur.fetchone()
        if row and row[0] != best_form:
            qpc_word_map[row[0]] = best_form
            cur.execute("UPDATE words SET text_uthmani = %s WHERE id = %s", (best_form, word_id))
            updates += 1
    print(f"   Updated {updates} words to QPC forms")

    # Rebuild word lookup with updated forms
    cur.execute("SELECT id, text_uthmani FROM words ORDER BY id")
    words_updated = cur.fetchall()
    word_by_qpc_text = {}
    word_by_qpc_stripped = {}
    for wid, text_u in words_updated:
        word_by_qpc_text[text_u] = wid
        stripped = strip_diacritics(text_u)
        if stripped not in word_by_qpc_stripped:
            word_by_qpc_stripped[stripped] = []
        word_by_qpc_stripped[stripped].append((wid, text_u))

    # Step 5: Build complete word_occurrences for all 6,236 ayat
    print("\n5. Building word_occurrences for all ayat...")

    # Clear existing occurrences
    cur.execute("TRUNCATE word_occurrences")

    new_occ = []
    matched_tokens = 0
    unmatched_tokens = 0
    unmatched_examples = []

    for ayah_id, surah_id, ayah_num, text_uthmani, page_num in ayat:
        if not text_uthmani:
            continue
        tokens = text_uthmani.split()
        for pos_idx, token in enumerate(tokens):
            position = pos_idx + 1  # 1-indexed
            # Strip waqf marks for matching
            token_clean = re.sub(r'[\u06D6-\u06DC]', '', token)
            if not token_clean:
                continue

            # Try exact match first
            word_id = word_by_qpc_text.get(token_clean)

            if not word_id:
                # Try stripped match
                stripped = strip_diacritics(token_clean)
                candidates = word_by_qpc_stripped.get(stripped, [])
                if len(candidates) == 1:
                    word_id = candidates[0][0]
                elif len(candidates) > 1:
                    # Pick the one with most similar diacritics
                    word_id = candidates[0][0]  # fallback to first

            if word_id:
                new_occ.append((word_id, ayah_id, position, page_num or 0))
                matched_tokens += 1
            else:
                unmatched_tokens += 1
                if len(unmatched_examples) < 10:
                    unmatched_examples.append(f"  {surah_id}:{ayah_num} pos {position}: {token_clean}")

    print(f"   Matched: {matched_tokens}, Unmatched: {unmatched_tokens}")
    if unmatched_examples:
        print(f"   Sample unmatched:")
        for ex in unmatched_examples:
            print(ex)

    # Step 6: Batch insert
    print(f"\n6. Inserting {len(new_occ)} word_occurrences...")
    batch_size = 1000
    for i in range(0, len(new_occ), batch_size):
        batch = new_occ[i:i + batch_size]
        args = ",".join(
            cur.mogrify("(%s, %s, %s, %s)", row).decode() for row in batch
        )
        cur.execute(f"INSERT INTO word_occurrences (word_id, ayah_id, position, page_number) VALUES {args}")
        if (i // batch_size) % 20 == 0:
            print(f"   {i + len(batch)}/{len(new_occ)}...")

    # Reset sequence
    cur.execute("SELECT setval('word_occurrences_id_seq', (SELECT COALESCE(MAX(id), 0) FROM word_occurrences))")

    # Commit
    conn.commit()

    # Verify
    cur.execute("SELECT count(*), count(DISTINCT ayah_id) FROM word_occurrences")
    total_occ, ayat_covered = cur.fetchone()
    print(f"\n✅ Done! {total_occ} occurrences covering {ayat_covered}/{len(ayat)} ayat")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
