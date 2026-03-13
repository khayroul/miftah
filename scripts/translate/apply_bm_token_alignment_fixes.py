#!/usr/bin/env python3
"""
Miftah — Apply high-confidence BM WBW token-alignment fixes.

This script targets cases where the BM WBW gloss is still phrase-based instead of
token-faithful, but only for a small set of defensible rules.

Usage:
    python3 scripts/translate/apply_bm_token_alignment_fixes.py [--dry-run]
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable

PROJECT_ROOT = Path(__file__).parent.parent.parent
BM_WBW_PATH = PROJECT_ROOT / "data" / "bm_wbw_complete.json"
UTHMANI_PATH = PROJECT_ROOT / "data" / "qul" / "quran-uthmani.txt"
REPORT_PATH = PROJECT_ROOT / "data" / "bm_wbw_token_alignment_corrections.json"


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


def lacks_hand_lexeme(gloss: str) -> bool:
    lowered = gloss.lower()
    return "tangan" not in lowered


RULES: list[dict[str, object]] = [
    {
        "name": "in conditional particle",
        "token": "إِن",
        "predicate": lambda gloss: gloss == "dengan malaikat",
        "replacement": "jika",
        "reason": "`إِن` ialah partikel syarat `jika`; `malaikat` ialah token lain.",
    },
    {
        "name": "yadayi token-faithful gloss",
        "token": "يَدَيِ",
        "predicate": lacks_hand_lexeme,
        "replacement": "dua tangan",
        "reason": "Token ini merujuk `dua tangan`, bukan `hadapan` sebagai frasa idiomatik.",
    },
    {
        "name": "yaday token-faithful gloss",
        "token": "يَدَيۡ",
        "predicate": lacks_hand_lexeme,
        "replacement": "dua tangan",
        "reason": "Token ini merujuk `dua tangan`, bukan makna frasa `hadapan/sebelum`.",
    },
    {
        "name": "yadayhi token-faithful gloss",
        "token": "يَدَيۡهِ",
        "predicate": lacks_hand_lexeme,
        "replacement": "dua tangannya",
        "reason": "Token ini merujuk `dua tangannya`, bukan makna frasa `depannya/sebelumnya`.",
    },
    {
        "name": "yadayhi punctuated token-faithful gloss",
        "token": "يَدَيۡهِۗ",
        "predicate": lacks_hand_lexeme,
        "replacement": "dua tangannya",
        "reason": "Token ini merujuk `dua tangannya`, bukan makna frasa `depannya/sebelumnya`.",
    },
    {
        "name": "aydihim token-faithful gloss",
        "token": "أَيۡدِيهِمۡ",
        "predicate": lacks_hand_lexeme,
        "replacement": "tangan mereka",
        "reason": "Token ini merujuk `tangan mereka`, bukan makna frasa `hadapan mereka`.",
    },
    {
        "name": "aydihim punctuated token-faithful gloss",
        "token": "أَيۡدِيهِمۡۚ",
        "predicate": lacks_hand_lexeme,
        "replacement": "tangan mereka",
        "reason": "Token ini merujuk `tangan mereka`, bukan makna frasa `hadapan mereka`.",
    },
    {
        "name": "in negative particle cleanup",
        "token": "إِن",
        "predicate": lambda gloss: gloss == "kamu tidak",
        "replacement": "tidak",
        "reason": "Di sini `إِن` berfungsi sebagai partikel nafi, bukan frasa penuh `kamu tidak`.",
    },
    {
        "name": "kunta shifted gloss cleanup",
        "token": "كُنتَ",
        "predicate": lambda gloss: gloss == "jika",
        "replacement": "kamu adalah",
        "reason": "Makna syarat `jika` milik token sebelumnya; `كُنتَ` ialah `kamu adalah`.",
    },
    {
        "name": "kuntum shifted gloss cleanup",
        "token": "كُنتُمۡ",
        "predicate": lambda gloss: gloss == "kamu sembunyikan",
        "replacement": "kamu adalah",
        "reason": "Makna `menyembunyikan` milik token berikutnya, bukan `كُنتُمۡ`.",
    },
    {
        "name": "mina shifted gloss cleanup",
        "token": "مِنَ",
        "predicate": lambda gloss: gloss == "kamu adalah",
        "replacement": "dari",
        "reason": "`مِنَ` ialah preposisi `dari`, bukan salinan makna token sebelumnya.",
    },
    {
        "name": "min shifted gloss cleanup",
        "token": "مِن",
        "predicate": lambda gloss: gloss == "Allah",
        "replacement": "dari",
        "reason": "Nama `Allah` milik token sebelumnya; token ini perlu kekal sebagai preposisi.",
    },
    {
        "name": "inna shifted gloss cleanup",
        "token": "إِنَّ",
        "predicate": lambda gloss: gloss == "(mereka) mengubahnya",
        "replacement": "sesungguhnya",
        "reason": "Makna `mengubahnya` milik token sebelumnya; `إِنَّ` ialah penegas `sesungguhnya`.",
    },
    {
        "name": "wa-ilayhi shifted gloss cleanup",
        "token": "وَإِلَيۡهِ",
        "predicate": lambda gloss: gloss == "telah menciptakan aku",
        "replacement": "dan kepada-Nya",
        "reason": "Makna `menciptakan aku` milik token sebelumnya; token ini bermaksud `dan kepada-Nya`.",
    },
    {
        "name": "qawm typo cleanup",
        "token": "قَوۡمٞ",
        "predicate": lambda gloss: gloss == "suatu kamu",
        "replacement": "kaum",
        "reason": "Ini typo/alignment error; token ini merujuk `kaum`.",
    },
    {
        "name": "ya'maluna typo cleanup",
        "token": "يَعۡمَلُونَ",
        "predicate": lambda gloss: gloss in {"(mereka) mengajarkan", "(mereka) mengerjalan"},
        "replacement": "mereka kerjakan",
        "reason": "Ini bukan makna token yang tepat; bentuk dominan dan sesuai konteks ialah `mereka kerjakan`.",
    },
    {
        "name": "walladhina shifted gloss cleanup",
        "token": "وَٱلَّذِينَ",
        "predicate": lambda gloss: gloss == "dan berhala-berhala",
        "replacement": "dan orang-orang yang",
        "reason": "Makna `berhala-berhala` milik token lain; token ini ialah kata sambung relatif.",
    },
    {
        "name": "lahum shifted gloss cleanup",
        "token": "لَهُمۡ",
        "predicate": lambda gloss: gloss == "mereka mempunyai",
        "replacement": "bagi mereka",
        "reason": "Frasa `mereka mempunyai` terlalu luas; gloss tokenal yang lebih tepat ialah `bagi mereka`.",
    },
    {
        "name": "aymanukum phrase-compression cleanup",
        "token": "أَيۡمَٰنُكُمۡۚ",
        "predicate": lambda gloss: gloss == "tangan kananmu/budakmu",
        "replacement": "tangan kananmu",
        "reason": "Token ini ialah `tangan kananmu`; makna hamba/slave datang daripada keseluruhan frasa, bukan token ini sahaja.",
    },
    {
        "name": "aymanukum phrase-compression cleanup",
        "token": "أَيۡمَٰنُكُم",
        "predicate": lambda gloss: gloss == "tangan kananmu/budakmu",
        "replacement": "tangan kananmu",
        "reason": "Token ini ialah `tangan kananmu`; makna hamba/slave datang daripada keseluruhan frasa, bukan token ini sahaja.",
    },
    {
        "name": "amanu verb/noun cleanup",
        "token": "ءَامَنُواْ",
        "predicate": lambda gloss: gloss in {"(mereka) mu'min", "(mereka) mukmin"},
        "replacement": "beriman",
        "reason": "Token ini ialah fi'il `beriman`, bukan kata nama `mukmin`.",
    },
    {
        "name": "sahibah connotation cleanup",
        "token": "صَٰحِبَةٞۖ",
        "predicate": lambda gloss: gloss == "teman wanita (isteri)",
        "replacement": "pasangan (isteri)",
        "reason": "`teman wanita` membawa konotasi moden yang salah; konteks Quranic di sini lebih dekat kepada `pasangan/isteri`.",
    },
    {
        "name": "ghill connotation cleanup",
        "token": "غِلّٖ",
        "predicate": lambda gloss: gloss == "dendam/kedengkian",
        "replacement": "kedengkian",
        "reason": "Untuk `غِلّ`, `kedengkian` lebih tepat dan kurang berlebihan daripada `dendam` dalam konteks ayat ini.",
    },
]


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    with open(BM_WBW_PATH, encoding="utf-8") as file:
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
    print(f"{mode}: {len(changes)} BM WBW entries changed")
    for rule_name in sorted(counts):
        print(f"  {rule_name}: {counts[rule_name]}")

    print("\nSample changes:")
    for row in changes[:20]:
        print(f"{row['key']} | {row['token']} | {row['before']} -> {row['after']}")

    if dry_run:
        return

    with open(BM_WBW_PATH, "w", encoding="utf-8") as file:
        json.dump(updated, file, ensure_ascii=False, indent=2)
        file.write("\n")

    with open(REPORT_PATH, "w", encoding="utf-8") as file:
        json.dump(changes, file, ensure_ascii=False, indent=2)
        file.write("\n")

    print(f"\nWritten: {BM_WBW_PATH}")
    print(f"Written: {REPORT_PATH}")


if __name__ == "__main__":
    main()
