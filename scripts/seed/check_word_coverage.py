#!/usr/bin/env python3
"""
Check WBW coverage for canonical ayah tokenization.

Fails with non-zero exit if generated word occurrences do not fully cover
all token positions across all ayat.

Usage:
    python3 scripts/seed/check_word_coverage.py
"""

import sys

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


def main():
    ayat = load_json(SEED_DIR / "ayat.json")
    legacy_words = load_json(SEED_DIR / "words.json")
    sahih = load_json(QUL_DIR / "en-sahih-international-simple.json")
    basmeih = load_json(QUL_DIR / "abdullah-basamia-simple.json")
    bm_wbw = load_json(DATA_DIR / "bm_wbw_complete.json")
    en_wbw = load_json_optional(QUL_DIR / "english-wbw-translation.json", {})

    ayah_records, _ = build_full_ayah_records(ayat, sahih, basmeih)
    _, occurrences = build_complete_words_and_occurrences(
        ayah_records,
        legacy_words,
        bm_wbw,
        en_wbw,
    )
    coverage = audit_word_occurrence_coverage(ayah_records, occurrences)

    print(
        "WBW coverage check: "
        f"expected_tokens={coverage['expected_tokens']}, "
        f"actual_occurrences={coverage['actual_occurrences']}, "
        f"mismatch_ayah={coverage['mismatch_ayah_count']}, "
        f"missing_positions={coverage['missing_token_total']}"
    )

    if coverage["mismatch_ayah_count"] > 0:
        sample = coverage["sample_mismatches"][:5]
        print(f"Coverage failure sample: {sample}")
        sys.exit(1)


if __name__ == "__main__":
    main()
