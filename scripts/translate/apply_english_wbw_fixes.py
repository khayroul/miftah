#!/usr/bin/env python3
"""
Miftah — Apply high-confidence English WBW token fixes.

This script only touches entries where the current gloss is clearly wrong at the
token level, usually because a phrase-level gloss was assigned to a single token.

Usage:
    python3 scripts/translate/apply_english_wbw_fixes.py [--dry-run]
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable

PROJECT_ROOT = Path(__file__).parent.parent.parent
EN_WBW_PATH = PROJECT_ROOT / "data" / "qul" / "english-wbw-translation.json"
UTHMANI_PATH = PROJECT_ROOT / "data" / "qul" / "quran-uthmani.txt"
REPORT_PATH = PROJECT_ROOT / "data" / "english_wbw_corrections.json"


def load_uthmani_tokens() -> dict[str, list[str]]:
    verses: dict[str, list[str]] = {}
    with open(UTHMANI_PATH, encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            surah, ayah, text = line.split("|", 2)
            verses[f"{surah}:{ayah}"] = text.split()
    return verses


Predicate = Callable[[str], bool]


RULES: list[dict[str, object]] = [
    {
        "name": "min-baad phrase compression",
        "token": "مِنۢ",
        "predicate": lambda gloss: gloss in {
            "after",
            "after them",
            "after him",
            "after it",
            "after that",
            "thereafter",
            "(were) after them",
            "afterwards",
            "after [what]",
            "after (this)",
            "after you",
        },
        "replacement": "from",
        "reason": "`مِنۢ` should keep its own prepositional sense; `after` belongs to `بَعۡدِ`.",
    },
    {
        "name": "bayna-yaday phrase compression",
        "token": "بَيۡنَ",
        "predicate": lambda gloss: "before" in gloss,
        "replacement": "between",
        "reason": "`بَيۡنَ` means `between/among`; `before` is the idiomatic phrase meaning.",
    },
    {
        "name": "inda contextual overreach",
        "token": "عِندَ",
        "predicate": lambda gloss: gloss == "from",
        "replacement": "with",
        "reason": "`عِندَ` means `with/near/in the presence of`, not `from`.",
    },
    {
        "name": "in conditional particle",
        "token": "إِن",
        "predicate": lambda gloss: gloss == "the Angels",
        "replacement": "if",
        "reason": "`إِن` is the conditional particle `if`; `the angels` is a different token.",
    },
    {
        "name": "bihi clause compression",
        "token": "بِهِ",
        "predicate": lambda gloss: gloss == "Allah has given permission of it",
        "replacement": "for it",
        "reason": "The current gloss is an entire clause, not a token gloss.",
    },
    {
        "name": "dhu lexical correction",
        "token": "ذُو",
        "predicate": lambda gloss: gloss == "All-Able",
        "replacement": "Owner (of)",
        "reason": "`ذُو` means `owner/possessor of`, not `All-Able`.",
    },
]


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    with open(EN_WBW_PATH, encoding="utf-8") as file:
        data = json.load(file)

    uthmani = load_uthmani_tokens()

    updated = dict(data)
    changes: list[dict[str, str]] = []
    counts: dict[str, int] = defaultdict(int)

    for key, value in data.items():
        if not isinstance(value, str):
            continue

        surah, ayah, position = key.split(":")
        verse_tokens = uthmani.get(f"{surah}:{ayah}", [])
        token_index = int(position) - 1
        if token_index < 0 or token_index >= len(verse_tokens):
            continue

        token = verse_tokens[token_index]
        for rule in RULES:
            if token != rule["token"]:
                continue
            predicate = rule["predicate"]
            if not predicate(value):
                continue
            replacement = rule["replacement"]
            if replacement == value:
                continue
            updated[key] = replacement
            counts[rule["name"]] += 1
            changes.append(
                {
                    "key": key,
                    "token": token,
                    "before": value,
                    "after": replacement,
                    "rule": rule["name"],
                    "reason": rule["reason"],
                }
            )
            break

    mode = "DRY RUN" if dry_run else "UPDATED"
    print(f"{mode}: {len(changes)} English WBW entries changed")
    for rule_name in sorted(counts):
        print(f"  {rule_name}: {counts[rule_name]}")

    print("\nSample changes:")
    for row in changes[:20]:
        print(f"{row['key']} | {row['token']} | {row['before']} -> {row['after']}")

    if dry_run:
        return

    with open(EN_WBW_PATH, "w", encoding="utf-8") as file:
        json.dump(updated, file, ensure_ascii=False, indent=2)
        file.write("\n")

    with open(REPORT_PATH, "w", encoding="utf-8") as file:
        json.dump(changes, file, ensure_ascii=False, indent=2)
        file.write("\n")

    print(f"\nWritten: {EN_WBW_PATH}")
    print(f"Written: {REPORT_PATH}")


if __name__ == "__main__":
    main()
