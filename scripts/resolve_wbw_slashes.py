"""Resolve WBW slash patterns using terjemahan (full verse translations).

For each WBW entry containing a "/" slash, cross-reference with the
full Malay terjemahan to determine which side of the slash matches
the contextual translation. Pick the matching side.
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class SlashResolution:
    key: str
    original: str
    left: str
    right: str
    resolved: str
    method: str  # "terjemahan_left", "terjemahan_right", "unresolved"


@dataclass
class Stats:
    total_slashes: int = 0
    resolved_left: int = 0
    resolved_right: int = 0
    unresolved: int = 0
    skipped_complex: int = 0
    resolutions: list[SlashResolution] = field(default_factory=list)


def parse_terjemahan(sql_path: Path) -> dict[str, str]:
    """Parse display_bm from seed SQL into {surah_id:ayah_number: text} dict."""
    terjemahan: dict[str, str] = {}
    content = sql_path.read_text(encoding="utf-8")

    # Find all INSERT INTO ayat blocks
    # Each row: (surah_id, ayah_number, text_uthmani, text_simple, translation_id,
    #            translation_en, display_bm, ...)
    # We need surah_id (col 0), ayah_number (col 1), display_bm (col 6)

    # Match individual row tuples within INSERT statements
    # Rows start with (number, number, 'text', ...
    row_pattern = re.compile(
        r"\((\d+),\s*(\d+),\s*"  # surah_id, ayah_number
        r"'(?:[^']*(?:''[^']*)*)',\s*"  # text_uthmani (skip, handle escaped quotes)
        r"'(?:[^']*(?:''[^']*)*)',\s*"  # text_simple (skip)
        r"(?:NULL|'[^']*'),\s*"  # translation_id (skip)
        r"'(?:[^']*(?:''[^']*)*)',\s*"  # translation_en (skip)
        r"'([^']*(?:''[^']*)*)'",  # display_bm (capture)
    )

    for match in row_pattern.finditer(content):
        surah_id = match.group(1)
        ayah_number = match.group(2)
        display_bm = match.group(3).replace("''", "'")
        key = f"{surah_id}:{ayah_number}"
        terjemahan[key] = display_bm

    return terjemahan


def normalize_for_matching(text: str) -> str:
    """Normalize text for fuzzy matching — lowercase, remove punctuation."""
    text = text.lower()
    # Remove common punctuation and diacritics
    text = re.sub(r'[",;:.!?\-\(\)\[\]{}\'`]', " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def find_match_in_terjemahan(
    word: str, terjemahan_text: str
) -> bool:
    """Check if a word/phrase appears in the terjemahan text."""
    norm_word = normalize_for_matching(word)
    norm_terj = normalize_for_matching(terjemahan_text)

    if not norm_word or len(norm_word) < 2:
        return False

    return norm_word in norm_terj


def resolve_slash(
    key: str,
    value: str,
    terjemahan: dict[str, str],
) -> SlashResolution | None:
    """Try to resolve a slash in a WBW entry using terjemahan."""
    # Extract surah:ayah from surah:ayah:word key
    parts = key.split(":")
    if len(parts) != 3:
        return None

    ayah_key = f"{parts[0]}:{parts[1]}"
    terj = terjemahan.get(ayah_key)
    if not terj:
        return SlashResolution(
            key=key, original=value, left="", right="",
            resolved=value, method="no_terjemahan",
        )

    # Split on slash — only handle single slash
    slash_parts = value.split("/")
    if len(slash_parts) != 2:
        return None  # Complex multi-slash, skip

    left = slash_parts[0].strip()
    right = slash_parts[1].strip()

    # Skip if either side is empty or too short
    if len(left) < 2 or len(right) < 2:
        return None

    # Skip if both sides are identical
    if left == right:
        return SlashResolution(
            key=key, original=value, left=left, right=right,
            resolved=left, method="identical",
        )

    left_match = find_match_in_terjemahan(left, terj)
    right_match = find_match_in_terjemahan(right, terj)

    if left_match and not right_match:
        return SlashResolution(
            key=key, original=value, left=left, right=right,
            resolved=left, method="terjemahan_left",
        )
    elif right_match and not left_match:
        return SlashResolution(
            key=key, original=value, left=left, right=right,
            resolved=right, method="terjemahan_right",
        )
    elif left_match and right_match:
        # Both match — prefer the longer match (more specific)
        if len(left) > len(right):
            return SlashResolution(
                key=key, original=value, left=left, right=right,
                resolved=left, method="both_match_prefer_left",
            )
        elif len(right) > len(left):
            return SlashResolution(
                key=key, original=value, left=left, right=right,
                resolved=right, method="both_match_prefer_right",
            )
        else:
            # Same length, both match — keep left (first option)
            return SlashResolution(
                key=key, original=value, left=left, right=right,
                resolved=left, method="both_match_same_length",
            )
    else:
        return SlashResolution(
            key=key, original=value, left=left, right=right,
            resolved=value, method="unresolved",
        )


def main() -> None:
    data_dir = Path(__file__).parent.parent / "data"
    wbw_path = data_dir / "bm_wbw_complete.json"
    sql_path = data_dir / "seed" / "seed_part1_surahs_ayat.sql"

    dry_run = "--dry-run" in sys.argv
    report_only = "--report" in sys.argv

    print("Loading terjemahan from SQL seed...")
    terjemahan = parse_terjemahan(sql_path)
    print(f"  Loaded {len(terjemahan)} verse translations")

    print("Loading WBW data...")
    with open(wbw_path, encoding="utf-8") as f:
        wbw = json.load(f)
    print(f"  Loaded {len(wbw)} WBW entries")

    # Find all slash entries
    slash_entries = {k: v for k, v in wbw.items() if "/" in v}
    print(f"  Found {len(slash_entries)} entries with slashes")

    stats = Stats(total_slashes=len(slash_entries))
    changes: dict[str, str] = {}

    for key, value in sorted(slash_entries.items(), key=lambda x: _sort_key(x[0])):
        resolution = resolve_slash(key, value, terjemahan)
        if resolution is None:
            stats.skipped_complex += 1
            continue

        stats.resolutions.append(resolution)

        if resolution.method.startswith("terjemahan_left") or resolution.method == "both_match_prefer_left" or resolution.method == "both_match_same_length":
            stats.resolved_left += 1
            changes[key] = resolution.resolved
        elif resolution.method.startswith("terjemahan_right") or resolution.method == "both_match_prefer_right":
            stats.resolved_right += 1
            changes[key] = resolution.resolved
        elif resolution.method == "identical":
            stats.resolved_left += 1
            changes[key] = resolution.resolved
        else:
            stats.unresolved += 1

    # Print report
    print("\n" + "=" * 60)
    print("SLASH RESOLUTION REPORT")
    print("=" * 60)
    print(f"Total slash entries:     {stats.total_slashes}")
    print(f"Resolved (left wins):    {stats.resolved_left}")
    print(f"Resolved (right wins):   {stats.resolved_right}")
    print(f"Total resolved:          {stats.resolved_left + stats.resolved_right}")
    print(f"Unresolved:              {stats.unresolved}")
    print(f"Skipped (complex/multi): {stats.skipped_complex}")

    if report_only:
        # Print detailed unresolved entries
        print("\n--- UNRESOLVED ENTRIES ---")
        for r in stats.resolutions:
            if r.method == "unresolved" or r.method == "no_terjemahan":
                print(f"  {r.key}: \"{r.original}\" [{r.method}]")

        # Print sample resolved entries
        print("\n--- SAMPLE RESOLVED (first 30) ---")
        resolved = [r for r in stats.resolutions if r.method not in ("unresolved", "no_terjemahan")]
        for r in resolved[:30]:
            print(f"  {r.key}: \"{r.original}\" => \"{r.resolved}\" [{r.method}]")
        return

    if dry_run:
        print(f"\n[DRY RUN] Would apply {len(changes)} changes.")
        # Show first 20 changes
        for i, (key, new_val) in enumerate(sorted(changes.items(), key=lambda x: _sort_key(x[0]))):
            if i >= 20:
                print(f"  ... and {len(changes) - 20} more")
                break
            print(f"  {key}: \"{wbw[key]}\" => \"{new_val}\"")
        return

    # Apply changes
    if changes:
        print(f"\nApplying {len(changes)} changes...")
        for key, new_val in changes.items():
            wbw[key] = new_val

        with open(wbw_path, "w", encoding="utf-8") as f:
            json.dump(wbw, f, ensure_ascii=False, indent=2)
        print("Done! Changes written to bm_wbw_complete.json")
    else:
        print("\nNo changes to apply.")

    # Write unresolved to a review file
    unresolved = [r for r in stats.resolutions if r.method in ("unresolved", "no_terjemahan")]
    if unresolved:
        review_path = data_dir / "wbw_unresolved_slashes.json"
        review_data = {
            r.key: {"original": r.original, "left": r.left, "right": r.right}
            for r in unresolved
        }
        with open(review_path, "w", encoding="utf-8") as f:
            json.dump(review_data, f, ensure_ascii=False, indent=2)
        print(f"Unresolved entries written to {review_path}")


def _sort_key(key: str) -> tuple[int, int, int]:
    """Sort surah:ayah:word keys numerically."""
    parts = key.split(":")
    try:
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    except (ValueError, IndexError):
        return (999, 999, 999)


if __name__ == "__main__":
    main()
