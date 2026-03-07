#!/usr/bin/env python3
"""
Miftah — Parse tanzil.net quran-data.xml into per-verse metadata JSON.
Fills page_number, juz_number, hizb_number, ruku_number for ALL 6,236 ayat.

Usage:
    python3 parse_tanzil_metadata.py

Input:  data/qul/quran-data.xml
Output: data/seed/verse_metadata.json
"""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
XML_PATH = DATA_DIR / "qul" / "quran-data.xml"
OUTPUT_PATH = DATA_DIR / "seed" / "verse_metadata.json"


def parse_boundaries(root, tag_path, child_tag):
    """Parse boundary markers (juz, hizb, ruku, page) into a sorted list.
    Each boundary = (surah, ayah, index).
    """
    boundaries = []
    parent = root.find(tag_path)
    if parent is None:
        return boundaries
    for elem in parent.findall(child_tag):
        boundaries.append((
            int(elem.get('sura')),
            int(elem.get('aya')),
            int(elem.get('index'))
        ))
    boundaries.sort()
    return boundaries


def parse_surahs(root):
    """Parse surah metadata: id -> {ayas, type, order, name, ...}"""
    surahs = {}
    for elem in root.find('suras').findall('sura'):
        idx = int(elem.get('index'))
        surahs[idx] = {
            'ayas': int(elem.get('ayas')),
            'name_arabic': elem.get('name'),
            'name_transliteration': elem.get('tname'),
            'name_en': elem.get('ename'),
            'type': elem.get('type'),  # Meccan/Medinan
            'order': int(elem.get('order')),
            'rukus': int(elem.get('rukus')),
        }
    return surahs


def parse_sajdas(root):
    """Parse sajda (prostration) markers."""
    sajdas = set()
    parent = root.find('sajdas')
    if parent is None:
        return sajdas
    for elem in parent.findall('sajda'):
        sajdas.add((int(elem.get('sura')), int(elem.get('aya'))))
    return sajdas


def assign_metadata(surahs, pages, juzs, hizbs, rukus, sajdas):
    """Assign page/juz/hizb/ruku to every verse using boundary markers."""
    # Convert boundaries to lookup: for each verse, find which boundary it falls in
    # Strategy: boundaries mark the FIRST verse of that section.
    # So verse (s,a) belongs to the highest boundary <= (s,a).

    def find_current(boundaries, surah, ayah):
        """Binary search for the boundary that applies to this verse."""
        result = 0
        for s, a, idx in boundaries:
            if (s, a) <= (surah, ayah):
                result = idx
            else:
                break
        return result

    metadata = {}
    for surah_id in range(1, 115):
        surah = surahs[surah_id]
        for ayah_num in range(1, surah['ayas'] + 1):
            key = f"{surah_id}:{ayah_num}"
            metadata[key] = {
                'page_number': find_current(pages, surah_id, ayah_num),
                'juz_number': find_current(juzs, surah_id, ayah_num),
                'hizb_number': find_current(hizbs, surah_id, ayah_num),
                'ruku_number': find_current(rukus, surah_id, ayah_num),
                'sajdah': (surah_id, ayah_num) in sajdas,
                'revelation_type': surah['type'].lower(),  # meccan/medinan
            }

    return metadata


def main():
    print("=" * 60)
    print("Miftah — Parse Tanzil Quran Metadata")
    print("=" * 60)

    if not XML_PATH.exists():
        print(f"ERROR: {XML_PATH} not found")
        return

    tree = ET.parse(XML_PATH)
    root = tree.getroot()

    # Parse all sections
    surahs = parse_surahs(root)
    pages = parse_boundaries(root, 'pages', 'page')
    juzs = parse_boundaries(root, 'juzs', 'juz')
    hizbs = parse_boundaries(root, 'hizbs', 'quarter')  # hizb quarters
    rukus = parse_boundaries(root, 'rukus', 'ruku')
    sajdas = parse_sajdas(root)

    print(f"\nParsed: {len(surahs)} surahs, {len(pages)} pages, "
          f"{len(juzs)} juzs, {len(hizbs)} hizb quarters, "
          f"{len(rukus)} rukus, {len(sajdas)} sajdas")

    # Assign to all verses
    metadata = assign_metadata(surahs, pages, juzs, hizbs, rukus, sajdas)

    # Verify
    total = len(metadata)
    pages_covered = len(set(m['page_number'] for m in metadata.values()))
    juzs_covered = len(set(m['juz_number'] for m in metadata.values()))

    print(f"\nMetadata generated: {total} verses")
    print(f"  Pages covered: {pages_covered} (expect 604)")
    print(f"  Juzs covered: {juzs_covered} (expect 30)")
    print(f"  Sajdah verses: {sum(1 for m in metadata.values() if m['sajdah'])}")

    # Spot check
    print(f"\n  1:1 → page {metadata['1:1']['page_number']}, juz {metadata['1:1']['juz_number']}")
    print(f"  2:142 → page {metadata['2:142']['page_number']}, juz {metadata['2:142']['juz_number']}")
    print(f"  36:1 → page {metadata['36:1']['page_number']}, juz {metadata['36:1']['juz_number']}")
    print(f"  114:6 → page {metadata['114:6']['page_number']}, juz {metadata['114:6']['juz_number']}")

    # Also output surah metadata with revelation_type
    surah_meta = {}
    for sid, s in surahs.items():
        surah_meta[str(sid)] = {
            'revelation_type': s['type'].lower(),
            'order_revealed': s['order'],
        }

    output = {
        'verses': metadata,
        'surahs': surah_meta,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"\nWritten: {OUTPUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
