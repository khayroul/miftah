#!/usr/bin/env python3
"""
Miftah — Audit and fix obvious BM WBW spelling/grammar issues.

This script updates `data/bm_wbw_complete.json` in-place using only high-confidence
Malay orthography fixes:
  - `di` / `ke` preposition spacing (`didalam` -> `di dalam`)
  - divine suffix hyphenation (`kepadaNya` -> `kepada-Nya`)
  - Indonesian spellings/typos that are still present (`kabar` -> `khabar`)

Usage:
    python3 scripts/translate/apply_malay_spellings.py [--dry-run] [--db]
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
BM_WBW_PATH = PROJECT_ROOT / "data" / "bm_wbw_complete.json"

PREPOSITIONAL_BASES = {
    "di": [
        "antara",
        "atas",
        "akhirat",
        "bawah",
        "belakang",
        "dalam",
        "dunia",
        "hadapan",
        "mana",
        "muka",
        "samping",
        "sebelah",
        "sekitar",
        "sisi",
        "tengah",
        "tempat",
        "waktu",
    ],
    "ke": [
        "atas",
        "bawah",
        "dalam",
        "hadapan",
        "tengah",
        "tempat",
        "tepi",
    ],
}

PREPOSITIONAL_SUFFIXES = ["", "kah", "ku", "lah", "mu", "nya"]

SIMPLE_RULES = [
    ("Typo", r"\bbertkawa(lah)?\b", lambda m: f"bertakwa{m.group(1) or ''}"),
    ("Typo", r"\bata/", "atas/"),
    ("Typo", r"\bmembei\b", "memberi"),
    ("Spacing", r"\bdi\s+beri\b", "diberi"),
    ("Spacing", r"\bdari\s+padanya\b", "daripadanya"),
    ("Spacing", r"\bdari\s+padaku\b", "daripadaku"),
    ("Spacing", r"\bdari\s+padamu\b", "daripadamu"),
    ("Spacing", r"\bdari\s+pada\b", "daripada"),
    ("Lexicon", r"\bmenasehatkan\b", "menasihatkan"),
    ("Lexicon", r"\bmenasehati\b", "menasihati"),
    ("Lexicon", r"\bnasehatkan\b", "nasihatkan"),
    ("Lexicon", r"\bnasehati\b", "nasihati"),
    ("Lexicon", r"\bnasehat(ku|mu|nya)?\b", lambda m: f"nasihat{m.group(1) or ''}"),
    ("Lexicon", r"\bnasehat\b", "nasihat"),
    ("Lexicon", r"\bberdzikir(lah)?\b", lambda m: f"berzikir{m.group(1) or ''}"),
    ("Lexicon", r"\bdzikir\b", "zikir"),
    ("Lexicon", r"\bdzhuhur\b", "zuhur"),
    ("Lexicon", r"\bbersholat\b", "bersolat"),
    ("Lexicon", r"\bsholat(lah)?\b", lambda m: f"solat{m.group(1) or ''}"),
    ("Lexicon", r"\bsholat(ku|mu|nya)?\b", lambda m: f"solat{m.group(1) or ''}"),
    ("Lexicon", r"\bsholat\b", "solat"),
    ("Lexicon", r"\brizkikan\b", "rezekikan"),
    ("Lexicon", r"\brizkinya\b", "rezekinya"),
    ("Lexicon", r"\brizki\b", "rezeki"),
    ("Lexicon", r"\bmerusakkan\b", "merosakkan"),
    ("Lexicon", r"\bmerusaknya\b", "merosakkannya"),
    ("Lexicon", r"\bmerusak\b", "merosakkan"),
    ("Lexicon", r"\bkabarkanlah\b", "khabarkanlah"),
    ("Lexicon", r"\bkabarkan\b", "khabarkan"),
    ("Lexicon", r"\bkabar\b", "khabar"),
    ("Lexicon", r"\bmu['’]?minat\b", "mukminat"),
    ("Lexicon", r"\bmu['’]?min\b", "mukmin"),
    ("Lexicon", r"\brisholat-Nya\b", "risalah-Nya"),
    ("Lexicon", r"\bsesungguh-Nya\b", "sesungguhnya"),
]

DIVINE_SUFFIX_RE = re.compile(
    r"\b([A-Za-z]+(?:-[A-Za-z]+)*)-?(Nya|NYa|NYA|Ku|KU|Mu|MU)(lah)?\b"
)
PARENTHETICAL_SPACE_RE = re.compile(r"\)(?=[A-Za-z]{4,}\b)")
MULTISPACE_RE = re.compile(r"[ \t]{2,}")


def build_prepositional_rules() -> list[tuple[str, re.Pattern[str], str]]:
    rules: list[tuple[str, re.Pattern[str], str]] = []
    for prefix, bases in PREPOSITIONAL_BASES.items():
        for base in bases:
            for suffix in PREPOSITIONAL_SUFFIXES:
                original = f"{prefix}{base}{suffix}"
                replacement = f"{prefix} {base}{suffix}"
                rules.append(
                    (
                        "Spacing",
                        re.compile(rf"\b{original}\b", flags=re.IGNORECASE),
                        replacement,
                    )
                )
    return rules


PREPOSITIONAL_RULES = build_prepositional_rules()


def normalize_divine_suffixes(text: str) -> tuple[str, int]:
    change_count = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal change_count
        base = match.group(1)
        suffix = match.group(2).upper()
        tail = match.group(3) or ""

        normalized_suffix = {
            "NYA": "Nya",
            "KU": "Ku",
            "MU": "Mu",
        }[suffix]
        replacement = f"{base}-{normalized_suffix}{tail}"
        if replacement != match.group(0):
            change_count += 1
        return replacement

    return DIVINE_SUFFIX_RE.sub(replace, text), change_count


def normalize_parenthetical_spacing(text: str) -> tuple[str, int]:
    updated, count = PARENTHETICAL_SPACE_RE.subn(") ", text)
    return updated, count


def normalize_whitespace(text: str) -> tuple[str, int]:
    updated, count = MULTISPACE_RE.subn(" ", text.strip())
    return updated, count


def apply_rules(text: str) -> tuple[str, dict[str, int]]:
    result = text
    hits: dict[str, int] = defaultdict(int)

    for category, pattern, replacement in PREPOSITIONAL_RULES:
        updated, count = pattern.subn(replacement, result)
        if count:
            result = updated
            hits[category] += count

    for category, pattern, replacement in SIMPLE_RULES:
        updated, count = re.subn(pattern, replacement, result, flags=re.IGNORECASE)
        if count:
            result = updated
            hits[category] += count

    result, divine_count = normalize_divine_suffixes(result)
    if divine_count:
        hits["Hyphenation"] += divine_count

    result, parenthetical_count = normalize_parenthetical_spacing(result)
    if parenthetical_count:
        hits["Spacing"] += parenthetical_count

    result, whitespace_count = normalize_whitespace(result)
    if whitespace_count:
        hits["Spacing"] += whitespace_count

    return result, hits


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    update_db = "--db" in sys.argv

    if not BM_WBW_PATH.exists():
        raise SystemExit(f"Missing file: {BM_WBW_PATH}")

    with open(BM_WBW_PATH, "r", encoding="utf-8") as file:
        data = json.load(file)

    updated = dict(data)
    changed_entries = 0
    unique_changes: dict[tuple[str, str], int] = defaultdict(int)
    category_hits: dict[str, int] = defaultdict(int)

    for key, value in data.items():
        if not isinstance(value, str):
            continue

        new_value, hits = apply_rules(value)
        if new_value == value:
            continue

        updated[key] = new_value
        changed_entries += 1
        unique_changes[(value, new_value)] += 1

        for category, count in hits.items():
            category_hits[category] += count

    if not dry_run and changed_entries:
        with open(BM_WBW_PATH, "w", encoding="utf-8") as file:
            json.dump(updated, file, ensure_ascii=False, indent=2)
            file.write("\n")

    mode = "DRY RUN" if dry_run else "UPDATED"
    print(f"{mode}: {changed_entries} WBW entries changed")
    print(f"Unique before/after pairs: {len(unique_changes)}")
    for category in sorted(category_hits):
        print(f"  {category}: {category_hits[category]} replacements")

    print("\nSample changes:")
    for index, ((before, after), hit_count) in enumerate(
        sorted(unique_changes.items(), key=lambda item: (-item[1], item[0][0]))[:20],
        start=1,
    ):
        print(f"{index:02d}. [{hit_count}] {before} -> {after}")

    if update_db:
        sync_words_table(dry_run)


def load_database_url() -> str | None:
    env_path = PROJECT_ROOT / ".env.local"
    if not env_path.exists():
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            value = line.split("=", 1)[1].strip()
            return value or None

    return None


def sync_words_table(dry_run: bool) -> None:
    database_url = load_database_url()
    if not database_url:
        print("\nDB sync skipped: DATABASE_URL not found in .env.local")
        return

    try:
        import psycopg2
        from psycopg2.extras import execute_values
    except ImportError:
        print("\nInstalling psycopg2-binary for DB sync...")
        raise SystemExit("psycopg2-binary is required for --db")

    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute("SELECT id, translation_bm FROM words WHERE translation_bm IS NOT NULL")
        updates = []
        for word_id, translation_bm in cur.fetchall():
            if not isinstance(translation_bm, str):
                continue
            new_value, _ = apply_rules(translation_bm)
            if new_value != translation_bm:
                updates.append((word_id, new_value))

        print(f"\nDB candidates: {len(updates)} word rows")
        if dry_run or not updates:
            conn.rollback()
            return

        cur.execute(
            """
            CREATE TEMP TABLE word_translation_bm_updates (
              id INTEGER PRIMARY KEY,
              translation_bm TEXT NOT NULL
            ) ON COMMIT DROP
            """
        )
        execute_values(
            cur,
            "INSERT INTO word_translation_bm_updates (id, translation_bm) VALUES %s",
            updates,
            page_size=1000,
        )
        cur.execute(
            """
            UPDATE words
            SET translation_bm = updates.translation_bm
            FROM word_translation_bm_updates updates
            WHERE words.id = updates.id
            """
        )
        conn.commit()
        print(f"DB updated: {cur.rowcount} word rows")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
