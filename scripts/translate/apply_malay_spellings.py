#!/usr/bin/env python3
"""
Miftah — Fix Indonesian spellings in WBW translations to proper Malay (BM).
Applies regex-based replacements to:
  1. data/bm_wbw_complete.json (intermediate pipeline file)
  2. data/seed/seed_part3_words.sql (seed SQL)
  3. Supabase `words` table (live DB)

Usage:
    python3 apply_malay_spellings.py [--dry-run] [--db]
"""

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent

# ── Indonesian → Malay spelling replacements ──
# Each tuple: (regex_pattern, replacement)
# Patterns use \b for word boundaries and re.IGNORECASE
REPLACEMENTS = [
    # --- User-flagged ---
    (r"\bbahwasannya\b",  "bahawasanya"),
    (r"\bbahwasanya\b",   "bahawasanya"),
    (r"\bbahwa\b",        "bahawa"),
    (r"\bkerusakan\b",    "kerosakan"),
    (r"\bmerusak\b",      "merosakkan"),
    (r"\bperusak\b",      "perosak"),
    (r"\brezki\b",        "rezeki"),
    (r"\brizki\b",        "rezeki"),
    (r"\bristri\b",       "isteri"),  # with typo prefix
    (r"\bistri-istri\b",  "isteri-isteri"),
    (r"\bistri\b",        "isteri"),

    # --- Common Indonesian vs Malay ---
    (r"\bkarena\b",       "kerana"),
    (r"\bsurga\b",        "syurga"),
    (r"\bcobaan\b",       "cubaan"),
    (r"\bsholat\b",       "solat"),
    (r"\bshalat\b",       "solat"),
    (r"\bdzalim\b",       "zalim"),
    (r"\bzhalim\b",       "zalim"),
    (r"\bdhalim\b",       "zalim"),
    (r"\bridho\b",        "redha"),
    (r"\bridha\b",        "redha"),
    (r"\bwudhu\b",        "wuduk"),
    (r"\bnikmat\b",       "nikmat"),    # same, skip

    # ruh → roh (careful: don't match "ruhani" etc.)
    (r"\bruh\b",          "roh"),
]

def apply_replacements(text: str) -> str:
    """Apply all Indonesian→Malay spelling fixes to a string."""
    result = text
    for pattern, replacement in REPLACEMENTS:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


def fix_bm_wbw_json(dry_run=False):
    """Fix data/bm_wbw_complete.json and return a change report."""
    fpath = PROJECT_ROOT / "data" / "bm_wbw_complete.json"
    if not fpath.exists():
        print(f"  SKIP: {fpath} not found")
        return {}

    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)

    changes = {}  # old_value -> new_value
    changed_keys = 0
    for key, text in list(data.items()):
        new_text = apply_replacements(text)
        if new_text != text:
            if text not in changes:
                changes[text] = new_text
            data[key] = new_text
            changed_keys += 1

    if not dry_run and changed_keys > 0:
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  bm_wbw_complete.json: {changed_keys} entries updated ({len(changes)} unique strings)")
    return changes


def fix_seed_sql(dry_run=False):
    """Fix data/seed/seed_part3_words.sql in-place."""
    fpath = PROJECT_ROOT / "data" / "seed" / "seed_part3_words.sql"
    if not fpath.exists():
        print(f"  SKIP: {fpath} not found")
        return 0

    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = apply_replacements(content)
    diff_count = sum(1 for a, b in zip(content, new_content) if a != b)

    if not dry_run and new_content != content:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(new_content)

    print(f"  seed_part3_words.sql: ~{diff_count} character changes")
    return diff_count


def generate_report(changes: dict):
    """Print a clear before/after table for the user."""
    print("\n" + "=" * 70)
    print("REPLACEMENT REPORT — Indonesian → Malay Spelling Fixes")
    print("=" * 70)

    # Group by which replacement rule was triggered
    rule_hits = {}
    for old, new in sorted(changes.items(), key=lambda x: x[0].lower()):
        # Find which rule matched
        for pattern, replacement in REPLACEMENTS:
            if re.search(pattern, old, flags=re.IGNORECASE):
                rule_key = f"{pattern} → {replacement}"
                if rule_key not in rule_hits:
                    rule_hits[rule_key] = []
                rule_hits[rule_key].append((old, new))
                break

    for rule, examples in sorted(rule_hits.items()):
        print(f"\n── {rule} ({len(examples)} unique strings) ──")
        for old_val, new_val in examples[:5]:  # show up to 5 examples
            print(f"  ✗ {old_val}")
            print(f"  ✓ {new_val}")
        if len(examples) > 5:
            print(f"  ... and {len(examples) - 5} more")

    print(f"\nTotal unique strings changed: {len(changes)}")


def main():
    dry_run = "--dry-run" in sys.argv
    do_db = "--db" in sys.argv

    if dry_run:
        print("DRY RUN — no files will be modified\n")

    print("Step 1: Fix bm_wbw_complete.json")
    changes = fix_bm_wbw_json(dry_run)

    print("\nStep 2: Fix seed_part3_words.sql")
    fix_seed_sql(dry_run)

    generate_report(changes)

    if do_db:
        print("\nStep 3: Update Supabase DB")
        fix_supabase_db(changes, dry_run)


if __name__ == "__main__":
    main()
