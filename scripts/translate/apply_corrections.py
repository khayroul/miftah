#!/usr/bin/env python3
"""
Miftah — Apply Claude Review Corrections to BM WBW
Applies manual corrections from Claude's review of 66 flagged entries.

Usage:
    python3 apply_corrections.py

Input:  data/bm_wbw_complete.json (from id_to_bm_wbw.py)
        data/bm_wbw_flagged.json
Output: data/bm_wbw_complete.json (updated in-place)
        data/bm_wbw_corrections.json (audit trail)
        data/bm_wbw_review.csv (updated)
"""

import json
import csv
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
QUL_DIR = DATA_DIR / "qul"

# Claude Review Corrections
# Format: indonesian_text -> { bm_corrected, reason }
CORRECTIONS = {
    # === "mengerti" → "memahami" (Malaysian register) ===
    # "mengerti" is understood in BM but sounds distinctly Indonesian.
    # Malaysian BM uses "memahami" or "faham" in formal/Quranic register.
    "berakal/mengerti": {
        "bm": "berakal/memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "mereka mengerti": {
        "bm": "mereka memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "Maha Mengerti": {
        "bm": "Maha Mengetahui",
        "reason": "Al-Khabir = Maha Mengetahui in standard BM Quranic usage"
    },
    "kamu mengetahui/mengerti": {
        "bm": "kamu mengetahui/memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "mengerti": {
        "bm": "memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "mereka mau mengerti": {
        "bm": "mereka mahu memahami",
        "reason": "mengerti → memahami; mau → mahu (BM register)"
    },
    "kami mengerti": {
        "bm": "kami memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "mereka merasa/mengerti": {
        "bm": "mereka merasa/memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "kamu ingat/mengerti": {
        "bm": "kamu ingat/memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "terang/mengerti": {
        "bm": "terang/memahami",
        "reason": "mengerti → memahami (BM register)"
    },
    "menyadari/mengerti": {
        "bm": "menyedari/memahami",
        "reason": "menyadari → menyedari (BM spelling); mengerti → memahami"
    },
    "mereka memahami/mengerti": {
        "bm": "mereka memahami",
        "reason": "Remove redundant mengerti, keep memahami"
    },

    # === "budak" → context-appropriate BM ===
    # In Indonesian Quran: "budak" = slave/servant
    # In Malaysian BM: "budak" = child (colloquial). For slave, BM uses "hamba".
    # Quranic context is always about slavery/bondage, so → "hamba"
    "dan sungguh budak wanita": {
        "bm": "dan sungguh hamba wanita",
        "reason": "budak (ID:slave) → hamba (BM:slave). BM 'budak' means child."
    },
    "dan sungguh budak": {
        "bm": "dan sungguh hamba",
        "reason": "budak (ID:slave) → hamba (BM:slave)"
    },
    "tangan kananmu/budak-budakmu": {
        "bm": "tangan kananmu/hamba-hambamu",
        "reason": "budak (ID:slave) → hamba (BM:slave). 'ma malakat aimanukum'"
    },
    "budak-budakmu": {
        "bm": "hamba-hambamu",
        "reason": "budak (ID:slave) → hamba (BM:slave)"
    },
    "seorang budak": {
        "bm": "seorang hamba",
        "reason": "budak (ID:slave) → hamba (BM:slave). Context: freeing a slave"
    },
    "memerdekakan budak": {
        "bm": "memerdekakan hamba",
        "reason": "budak (ID:slave) → hamba (BM:slave). Context: freeing slaves (riqab)"
    },
    "apa (budak)": {
        "bm": "apa (hamba)",
        "reason": "budak (ID:slave) → hamba (BM:slave). Context: 'ma malakat aimanuhum'"
    },
    "budak/tidak": {
        "bm": "hamba/tidak",
        "reason": "budak (ID:slave) → hamba (BM:slave)"
    },
    "budak-budak mereka": {
        "bm": "hamba-hamba mereka",
        "reason": "budak (ID:slave) → hamba (BM:slave). Context: those whom their right hands possess"
    },
    "budak-budak lelakimu": {
        "bm": "hamba-hamba lelakimu",
        "reason": "budak (ID:slave) → hamba (BM:slave). EN: your male slaves"
    },
    "dan budak-budak perempuan": {
        "bm": "dan hamba-hamba perempuan",
        "reason": "budak (ID:slave) → hamba (BM:slave). EN: your female slaves"
    },
    "budak-budak kamu": {
        "bm": "hamba-hamba kamu",
        "reason": "budak (ID:slave) → hamba (BM:slave)"
    },
    "budak-budak perempuan": {
        "bm": "hamba-hamba perempuan",
        "reason": "budak (ID:slave) → hamba (BM:slave). EN: your slave girls"
    },
    "budak": {
        "bm": "hamba",
        "reason": "budak (ID:slave) → hamba (BM:slave). EN: a neck (90:13, freeing slaves)"
    },

    # === "punya" → "mempunyai" (formal BM) ===
    "tidak punya ibu-bapak dan anak": {
        "bm": "tidak mempunyai ibu-bapak dan anak",
        "reason": "punya (informal) → mempunyai (formal BM)"
    },

    # === "mengerjakan" — KEEP AS-IS ===
    # "Mengerjakan" is valid in Malaysian BM Quranic register.
    # Basmeih translation uses "mengerjakan" extensively.
    # No corrections needed for any mengerjakan entries.

    # === "bisa jadi" → "boleh jadi" — already correct from auto-conversion ===
    # Already handled by substitution rules, just confirming it's correct.
}


def apply():
    print("=" * 60)
    print("Miftah — Applying Claude Review Corrections")
    print("=" * 60)

    # Load current complete WBW
    with open(DATA_DIR / "bm_wbw_complete.json") as f:
        bm_complete = json.load(f)

    # Load Indonesian source for reverse lookup
    with open(QUL_DIR / "indonesian-word-by-word-translation.json") as f:
        id_wbw = json.load(f)

    # Load English WBW
    en_wbw_path = QUL_DIR / "english-wbw-translation.json"
    en_wbw = {}
    if en_wbw_path.exists():
        with open(en_wbw_path) as f:
            en_wbw = json.load(f)

    # Build reverse map: id_text -> [keys]
    id_to_keys = {}
    for key, text in id_wbw.items():
        if text not in id_to_keys:
            id_to_keys[text] = []
        id_to_keys[text].append(key)

    # Apply corrections
    corrections_applied = []
    total_positions_corrected = 0

    for id_text, correction in CORRECTIONS.items():
        keys = id_to_keys.get(id_text, [])
        if not keys:
            print(f"  WARNING: No keys found for '{id_text}'")
            continue

        bm_new = correction["bm"]
        old_bm = bm_complete.get(keys[0], "")

        if old_bm == bm_new:
            continue  # Already correct (e.g. bisa jadi → boleh jadi)

        for key in keys:
            bm_complete[key] = bm_new

        corrections_applied.append({
            "id_text": id_text,
            "bm_old": old_bm,
            "bm_new": bm_new,
            "reason": correction["reason"],
            "positions_affected": len(keys),
            "sample_keys": keys[:3],
        })
        total_positions_corrected += len(keys)
        print(f"  [{len(keys):>3} pos] {id_text[:40]:<40} → {bm_new[:40]}")

    print(f"\nCorrections: {len(corrections_applied)} unique translations")
    print(f"Positions corrected: {total_positions_corrected}")

    # Write updated complete BM WBW
    with open(DATA_DIR / "bm_wbw_complete.json", 'w', encoding='utf-8') as f:
        json.dump(bm_complete, f, ensure_ascii=False, indent=2)
    print(f"Updated: bm_wbw_complete.json ({len(bm_complete)} entries)")

    # Write corrections audit trail
    with open(DATA_DIR / "bm_wbw_corrections.json", 'w', encoding='utf-8') as f:
        json.dump(corrections_applied, f, ensure_ascii=False, indent=2)
    print(f"Written: bm_wbw_corrections.json ({len(corrections_applied)} corrections)")

    # Rebuild review CSV with all changed entries
    changed_entries = []
    for id_text, keys in id_to_keys.items():
        bm_text = bm_complete[keys[0]]
        if bm_text != id_text:
            en_text = en_wbw.get(keys[0], "")
            # Determine method
            correction = CORRECTIONS.get(id_text)
            method = "claude_reviewed" if correction else "substituted"
            reason = correction["reason"] if correction else ""
            changed_entries.append({
                "indonesian": id_text,
                "bm_final": bm_text,
                "english": en_text,
                "method": method,
                "reason": reason,
                "occurrences": len(keys),
                "sample_key": keys[0],
            })

    with open(DATA_DIR / "bm_wbw_review.csv", 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            "indonesian", "bm_final", "english", "method", "reason", "occurrences", "sample_key"
        ])
        writer.writeheader()
        writer.writerows(sorted(changed_entries, key=lambda x: x["method"], reverse=True))
    print(f"Updated: bm_wbw_review.csv ({len(changed_entries)} entries)")

    # Final stats
    print(f"\n{'=' * 60}")
    print("Final BM WBW Statistics")
    print(f"{'=' * 60}")
    print(f"Total word positions: {len(bm_complete)}")

    identical = sum(1 for id_text, keys in id_to_keys.items() if bm_complete[keys[0]] == id_text)
    changed = len(id_to_keys) - identical
    print(f"Unique translations: {len(id_to_keys)}")
    print(f"  Identical to Indonesian: {identical}")
    print(f"  Changed for BM: {changed}")
    print(f"  Review CSV entries: {len(changed_entries)}")


if __name__ == "__main__":
    apply()
