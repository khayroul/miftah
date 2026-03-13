#!/usr/bin/env python3
"""
Generate a tighter BM WBW review focused on:
1. Remaining interpretive/context-heavy glosses.
2. Connotation-sensitive lexical choices.
3. Double-meaning/function-word cases that still sit outside the policy.

Usage:
    python3 scripts/translate/generate_bm_wbw_focus_review.py
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
BM_WBW_PATH = DATA_DIR / "bm_wbw_complete.json"
EN_WBW_PATH = DATA_DIR / "qul" / "english-wbw-translation.json"
UTHMANI_PATH = DATA_DIR / "qul" / "quran-uthmani.txt"
OUTLIER_CSV_PATH = DATA_DIR / "bm_wbw_outlier_review.csv"
POLICY_CSV_PATH = DATA_DIR / "bm_wbw_sense_policy_top100.csv"
FOCUS_CSV_PATH = DATA_DIR / "bm_wbw_focus_review.csv"
FOCUS_MD_PATH = DATA_DIR / "bm_wbw_focus_review.md"

TOKEN_WHITELIST = {
    "فِي", "فِيٓ", "فِيهِ", "فِيهَا", "مَا", "مَّا", "مَآ", "وَمَا", "وَمَآ",
    "أَن", "أَنۡ", "إِن", "إِنۡ", "إِنَّ", "إِنَّهُۥ", "إِنَّهُمۡ",
    "عَلَىٰ", "عَلَى", "مِن", "مِنۡ", "مِنَ", "مِّن", "مِّنَ",
    "إِلَىٰ", "إِلَى", "إِلَّا", "لَا", "وَلَا", "كَانَ", "كَانُواْ",
    "هُوَ", "هِيَ", "مَن", "وَمَن", "ٱلَّذِي", "ٱلَّذِينَ", "وَٱلَّذِينَ",
    "لَهُۥ", "لَهُمۡ", "بِهِۦ", "بِهِ", "بِمَا",
}


def load_json(path: Path) -> dict[str, str]:
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def load_uthmani_tokens() -> dict[str, list[str]]:
    verses: dict[str, list[str]] = {}
    with open(UTHMANI_PATH, encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            surah, ayah, text = line.split("|", 2)
            verses[f"{int(surah)}:{int(ayah)}"] = text.split()
    return verses


def token_for_key(key: str, uthmani_map: dict[str, list[str]]) -> str:
    surah, ayah, position = key.split(":")
    verse_key = f"{int(surah)}:{int(ayah)}"
    tokens = uthmani_map.get(verse_key, [])
    index = int(position) - 1
    if index < 0 or index >= len(tokens):
        return ""
    return tokens[index]


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(path: Path, rows: list[dict[str, str]], summary: list[tuple[str, int]]) -> None:
    lines = [
        "# BM WBW Focus Review",
        "",
        "Review scope: remaining interpretive glosses, connotation-sensitive glosses, and double-meaning tokens that still fall outside the current policy.",
        "",
        "## Summary",
        "",
    ]
    for label, count in summary:
        lines.append(f"- {label}: {count}")

    lines.extend(
        [
            "",
            "## Top Review Rows",
            "",
            "| Category | Severity | Key | Token | Current BM | Suggested BM | English | Note |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )

    for row in rows[:80]:
        lines.append(
            "| {category} | {severity} | {key} | {token} | {current_bm} | {suggested_bm} | {english} | {note} |".format(
                category=row["category"].replace("|", ", "),
                severity=row["severity"],
                key=row["key"],
                token=row["token"].replace("|", ", "),
                current_bm=row["current_bm"].replace("|", ", "),
                suggested_bm=row["suggested_bm"].replace("|", ", "),
                english=row["english"].replace("|", ", "),
                note=row["note"].replace("|", ", "),
            )
        )

    with open(path, "w", encoding="utf-8") as file:
        file.write("\n".join(lines) + "\n")


def main() -> None:
    bm_map = load_json(BM_WBW_PATH)
    en_map = load_json(EN_WBW_PATH)
    uthmani_map = load_uthmani_tokens()

    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    def add_row(
        category: str,
        severity: str,
        key: str,
        current_bm: str,
        suggested_bm: str,
        english: str,
        note: str,
    ) -> None:
        token = token_for_key(key, uthmani_map)
        dedupe_key = (category, key, current_bm)
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        rows.append(
            {
                "category": category,
                "severity": severity,
                "key": key,
                "token": token,
                "current_bm": current_bm,
                "suggested_bm": suggested_bm,
                "english": english,
                "note": note,
            }
        )

    padahal_re = re.compile(r"\bpadahal\b", re.IGNORECASE)
    for key, gloss in bm_map.items():
        if padahal_re.search(gloss):
            add_row(
                category="interpretive_connector",
                severity="medium",
                key=key,
                current_bm=gloss,
                suggested_bm="review against token-faithful gloss",
                english=en_map.get(key, ""),
                note="`padahal` is readable BM prose, but it is often too interpretive for WBW and may import discourse meaning from the wider phrase.",
            )

    for key, gloss in bm_map.items():
        if "membalas dendam" in gloss.lower():
            add_row(
                category="connotation_review",
                severity="high",
                key=key,
                current_bm=gloss,
                suggested_bm="review: engkau membalas / menuntut balas",
                english=en_map.get(key, ""),
                note="`membalas dendam` is emotionally stronger than the likely Quranic intent here and should be reviewed in context.",
            )

    if OUTLIER_CSV_PATH.exists() and POLICY_CSV_PATH.exists():
        with open(POLICY_CSV_PATH, encoding="utf-8") as file:
            policy_rows = {row["token"]: row for row in csv.DictReader(file)}

        with open(OUTLIER_CSV_PATH, encoding="utf-8") as file:
            for row in csv.DictReader(file):
                token = row["token"]
                if token not in TOKEN_WHITELIST:
                    continue
                policy = policy_rows.get(token)
                if not policy:
                    continue
                flags = row["flags"]
                if "outside_policy" not in flags:
                    continue
                if "slash_gloss" not in flags and "parenthetical" not in flags:
                    continue
                sample_keys = [key.strip() for key in row["sample_keys"].split("|") if key.strip()]
                if not sample_keys:
                    continue
                sample_key = sample_keys[0]
                score = float(row["score"])
                severity = "high" if score >= 95 else "medium"
                add_row(
                    category="double_meaning_policy",
                    severity=severity,
                    key=sample_key,
                    current_bm=row["outlier_bm"],
                    suggested_bm=row["recommended_primary_bm"],
                    english=en_map.get(sample_key, ""),
                    note=policy["policy_note"],
                )

    rows.sort(key=lambda row: (row["severity"] != "high", row["category"], row["key"]))

    summary = []
    for category in sorted({row["category"] for row in rows}):
        summary.append((category, sum(1 for row in rows if row["category"] == category)))

    fieldnames = ["category", "severity", "key", "token", "current_bm", "suggested_bm", "english", "note"]
    write_csv(FOCUS_CSV_PATH, rows, fieldnames)
    write_markdown(FOCUS_MD_PATH, rows, summary)

    print(f"Wrote: {FOCUS_CSV_PATH} ({len(rows)} rows)")
    print(f"Wrote: {FOCUS_MD_PATH}")
    for label, count in summary:
        print(f"  {label}: {count}")


if __name__ == "__main__":
    main()
