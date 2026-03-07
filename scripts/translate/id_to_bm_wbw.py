#!/usr/bin/env python3
"""
Miftah — Indonesian → BM Word-by-Word Conversion Script
Converts QUL Indonesian WBW translations to Malaysian BM.

Usage:
    python3 id_to_bm_wbw.py

Input:  data/qul/indonesian-word-by-word-translation.json
        data/qul/english-word-by-word-translation.json (optional, for disambiguation)
Output: data/bm_wbw_complete.json        — full BM WBW (production)
        data/bm_wbw_flagged.json          — entries needing Claude/human review
        data/bm_wbw_stats.txt             — conversion statistics
"""

import json
import re
import os
import csv
from pathlib import Path
from collections import Counter

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
QUL_DIR = DATA_DIR / "qul"

ID_WBW_PATH = QUL_DIR / "indonesian-word-by-word-translation.json"
EN_WBW_PATH = QUL_DIR / "english-wbw-translation.json"
NORM_MAP_PATH = SCRIPT_DIR / "normalization_map.json"

OUTPUT_COMPLETE = DATA_DIR / "bm_wbw_complete.json"
OUTPUT_FLAGGED = DATA_DIR / "bm_wbw_flagged.json"
OUTPUT_REVIEW_CSV = DATA_DIR / "bm_wbw_review.csv"
OUTPUT_STATS = DATA_DIR / "bm_wbw_stats.txt"


def load_normalization_map():
    with open(NORM_MAP_PATH) as f:
        return json.load(f)


def load_id_wbw():
    with open(ID_WBW_PATH) as f:
        return json.load(f)


def load_en_wbw():
    if EN_WBW_PATH.exists():
        with open(EN_WBW_PATH) as f:
            return json.load(f)
    return {}


def is_passthrough(text, norm_map):
    """Check if text matches passthrough patterns (no conversion needed)."""
    patterns = norm_map.get("passthrough_patterns", {})
    for key, pattern in patterns.items():
        if key.startswith("_"):
            continue
        if re.match(pattern, text.strip()):
            return True
    return False


def apply_substitutions(text, norm_map):
    """Apply mechanical ID→BM substitutions. Returns (new_text, list_of_changes)."""
    subs = norm_map.get("substitutions", {})
    changes = []
    result = text

    for category, mappings in subs.items():
        if category.startswith("_"):
            continue
        for id_word, bm_word in mappings.items():
            if id_word.startswith("_"):
                continue
            # Word boundary match (case-insensitive for the check, preserve original case)
            pattern = re.compile(r'\b' + re.escape(id_word) + r'\b', re.IGNORECASE)
            if pattern.search(result):
                new_result = pattern.sub(bm_word, result)
                if new_result != result:
                    changes.append({
                        "type": "substitution",
                        "category": category,
                        "from": id_word,
                        "to": bm_word
                    })
                    result = new_result

    return result, changes


def should_flag(text, norm_map):
    """Check if text contains words that need human/AI review."""
    flags = norm_map.get("flag_for_review", {})
    reasons = []

    for category, words in flags.items():
        if category.startswith("_"):
            continue
        if isinstance(words, list):
            for word in words:
                if re.search(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE):
                    reasons.append({"category": category, "word": word})

    return reasons


def convert():
    print("=" * 60)
    print("Miftah — Indonesian → BM WBW Conversion")
    print("=" * 60)

    # Load data
    norm_map = load_normalization_map()
    id_wbw = load_id_wbw()
    en_wbw = load_en_wbw()

    print(f"Indonesian WBW entries: {len(id_wbw)}")
    print(f"English WBW entries: {len(en_wbw)}")
    print()

    # Deduplicate: build unique translation map
    unique_id_texts = {}
    for key, text in id_wbw.items():
        if text not in unique_id_texts:
            unique_id_texts[text] = []
        unique_id_texts[text].append(key)

    print(f"Unique Indonesian translations: {len(unique_id_texts)}")

    # Process each unique translation
    bm_map = {}  # id_text -> bm_text
    flagged = []
    stats = {
        "total_entries": len(id_wbw),
        "unique_translations": len(unique_id_texts),
        "passthrough": 0,
        "substituted": 0,
        "flagged_for_review": 0,
        "unchanged": 0,
    }

    for id_text, keys in unique_id_texts.items():
        # Step 1: Check passthrough
        if is_passthrough(id_text, norm_map):
            bm_map[id_text] = {"bm": id_text, "method": "passthrough", "changes": []}
            stats["passthrough"] += 1
            continue

        # Step 2: Apply mechanical substitutions
        bm_text, changes = apply_substitutions(id_text, norm_map)

        # Step 3: Check if flagging needed
        flag_reasons = should_flag(id_text, norm_map)

        if flag_reasons:
            # Get English equivalent for disambiguation
            en_text = en_wbw.get(keys[0], "") if en_wbw else ""
            flagged.append({
                "id_text": id_text,
                "bm_text_auto": bm_text,
                "en_text": en_text,
                "flag_reasons": flag_reasons,
                "changes_applied": changes,
                "occurrences": len(keys),
                "sample_keys": keys[:3],
            })
            # Still store the auto-converted version (can be overridden later)
            bm_map[id_text] = {
                "bm": bm_text,
                "method": "flagged",
                "changes": changes,
                "flag_reasons": flag_reasons
            }
            stats["flagged_for_review"] += 1
        elif changes:
            bm_map[id_text] = {"bm": bm_text, "method": "substituted", "changes": changes}
            stats["substituted"] += 1
        else:
            bm_map[id_text] = {"bm": bm_text, "method": "identical", "changes": []}
            stats["unchanged"] += 1

    # Build complete output: key -> bm_text
    bm_wbw_complete = {}
    for key, id_text in id_wbw.items():
        bm_entry = bm_map[id_text]
        bm_wbw_complete[key] = bm_entry["bm"]

    # Ensure output directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Write complete BM WBW
    with open(OUTPUT_COMPLETE, 'w', encoding='utf-8') as f:
        json.dump(bm_wbw_complete, f, ensure_ascii=False, indent=2)
    print(f"Written: {OUTPUT_COMPLETE} ({len(bm_wbw_complete)} entries)")

    # Write flagged entries
    with open(OUTPUT_FLAGGED, 'w', encoding='utf-8') as f:
        json.dump(flagged, f, ensure_ascii=False, indent=2)
    print(f"Written: {OUTPUT_FLAGGED} ({len(flagged)} entries)")

    # Write review CSV (only entries that changed from Indonesian)
    changed_entries = []
    for id_text, entry in bm_map.items():
        if entry["method"] in ("substituted", "flagged"):
            en_text = ""
            keys = unique_id_texts[id_text]
            if en_wbw:
                en_text = en_wbw.get(keys[0], "")
            changed_entries.append({
                "indonesian": id_text,
                "bm_auto": entry["bm"],
                "english": en_text,
                "method": entry["method"],
                "changes": json.dumps(entry["changes"], ensure_ascii=False),
                "occurrences": len(keys),
                "sample_key": keys[0],
            })

    with open(OUTPUT_REVIEW_CSV, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            "indonesian", "bm_auto", "english", "method", "changes", "occurrences", "sample_key"
        ])
        writer.writeheader()
        writer.writerows(changed_entries)
    print(f"Written: {OUTPUT_REVIEW_CSV} ({len(changed_entries)} entries)")

    # Write stats
    stats_text = f"""Miftah — BM WBW Conversion Statistics
======================================
Total word positions: {stats['total_entries']}
Unique translations:  {stats['unique_translations']}

Conversion breakdown:
  Passthrough (ayah numbers, names, particles): {stats['passthrough']}
  Substituted (mechanical ID→BM):              {stats['substituted']}
  Flagged for review:                          {stats['flagged_for_review']}
  Unchanged (ID = BM):                         {stats['unchanged']}

Changed entries for review: {len(changed_entries)}
"""
    with open(OUTPUT_STATS, 'w') as f:
        f.write(stats_text)
    print(f"\n{stats_text}")


if __name__ == "__main__":
    convert()
