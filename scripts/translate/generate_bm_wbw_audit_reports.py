#!/usr/bin/env python3
"""
Generate BM WBW audit artifacts:
1. Ranked suspicious outlier CSV for manual review.
2. Sense-policy table for the top 100 ambiguous Quranic tokens.

Usage:
    python3 scripts/translate/generate_bm_wbw_audit_reports.py
"""

from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
BM_WBW_PATH = DATA_DIR / "bm_wbw_complete.json"
EN_WBW_PATH = DATA_DIR / "qul" / "english-wbw-translation.json"
UTHMANI_PATH = DATA_DIR / "qul" / "quran-uthmani.txt"

OUTLIER_CSV_PATH = DATA_DIR / "bm_wbw_outlier_review.csv"
POLICY_CSV_PATH = DATA_DIR / "bm_wbw_sense_policy_top100.csv"
POLICY_MD_PATH = DATA_DIR / "bm_wbw_sense_policy_top100.md"


@dataclass(frozen=True)
class PolicyOverride:
    primary: str
    alternates: tuple[str, ...]
    note: str
    category: str


POLICY_OVERRIDES: dict[str, PolicyOverride] = {
    "فِي": PolicyOverride(
        primary="dalam",
        alternates=("di", "pada", "tentang"),
        note="Gunakan `dalam` sebagai default. Tukar kepada `pada` atau `tentang` hanya jika binaan jelas menuntut bacaan tempat atau topik.",
        category="preposition",
    ),
    "فِيٓ": PolicyOverride(
        primary="dalam",
        alternates=("pada", "di", "tentang"),
        note="Variasi hamzah/waqaf. Kekalkan gloss dasar `dalam` kecuali konteks memaksa bacaan topikal.",
        category="preposition",
    ),
    "فِيهِ": PolicyOverride(
        primary="di dalamnya",
        alternates=("padanya", "tentang itu"),
        note="Defaultkan kepada lokasi `di dalamnya`; gunakan `padanya` atau `tentang itu` hanya dalam binaan yang jelas.",
        category="prepositional-pronoun",
    ),
    "فِيهَا": PolicyOverride(
        primary="di dalamnya",
        alternates=("padanya", "ke dalamnya"),
        note="Kekalkan gloss lokatif sebagai default.",
        category="prepositional-pronoun",
    ),
    "مَا": PolicyOverride(
        primary="apa",
        alternates=("apa yang", "tidak", "tidak ada"),
        note="Defaultkan kepada `apa`. Tukar hanya bila sintaks jelas menunjukkan partikel nafi atau kata hubung relatif.",
        category="function-word",
    ),
    "مَّا": PolicyOverride(
        primary="apa",
        alternates=("tidak", "apa yang", "tidak ada"),
        note="Sama seperti `مَا`; pilih gloss nafi hanya jika konteks sintaks memaksa.",
        category="function-word",
    ),
    "مَآ": PolicyOverride(
        primary="apa",
        alternates=("tidak", "apa yang"),
        note="Defaultkan kepada makna leksikal yang stabil, bukan perluasan frasa.",
        category="function-word",
    ),
    "وَمَا": PolicyOverride(
        primary="dan apa",
        alternates=("dan tidak", "dan apa yang", "dan tidak ada"),
        note="Pisahkan antara sambungan `dan apa` dan bentuk nafi `dan tidak` mengikut binaan.",
        category="function-word",
    ),
    "وَمَآ": PolicyOverride(
        primary="dan apa",
        alternates=("dan tidak", "dan apa yang"),
        note="Defaultkan kepada token-faithful gloss; jangan serap makna frasa jiran.",
        category="function-word",
    ),
    "أَن": PolicyOverride(
        primary="bahawa",
        alternates=("untuk", "supaya", "agar"),
        note="Gunakan `bahawa` sebagai lalai. Bentuk infinitif/tujuan sahaja patut menggeser kepada `untuk/supaya/agar`.",
        category="subordinator",
    ),
    "أَنۡ": PolicyOverride(
        primary="bahawa",
        alternates=("untuk", "agar", "supaya"),
        note="Jangan terlalu cepat tukar kepada gloss tujuan; kekalkan bentuk dasar kecuali konteks jelas.",
        category="subordinator",
    ),
    "إِن": PolicyOverride(
        primary="jika",
        alternates=("tidak", "tidaklah", "sesungguhnya"),
        note="Untuk `إِنْ`, defaultkan kepada syarat `jika`. Gunakan nafi hanya bila binaan Arab memang partikel nafi.",
        category="conditional-particle",
    ),
    "إِنۡ": PolicyOverride(
        primary="jika",
        alternates=("tidak lain", "tidaklah", "tidak"),
        note="Bezakan bentuk syarat dan nafi berdasarkan konteks, tetapi kekalkan gloss stabil apabila ragu.",
        category="conditional-particle",
    ),
    "إِنَّ": PolicyOverride(
        primary="sesungguhnya",
        alternates=("sungguh",),
        note="Ini partikel penegas. Jangan biarkan ia menyerap makna predikat selepasnya.",
        category="emphasis-particle",
    ),
    "إِنَّهُۥ": PolicyOverride(
        primary="sesungguhnya Dia",
        alternates=("sesungguhnya dia", "sesungguhnya ia"),
        note="Pilih rujukan pronomina mengikut antecedent, tetapi kekalkan penegas `sesungguhnya`.",
        category="emphasis-pronoun",
    ),
    "إِنَّهُمۡ": PolicyOverride(
        primary="sesungguhnya mereka",
        alternates=("bahawasanya mereka",),
        note="Bentuk dominan Quranic ialah penegas + pronomina, bukan frasa bebas.",
        category="emphasis-pronoun",
    ),
    "عَلَىٰ": PolicyOverride(
        primary="atas",
        alternates=("di atas", "terhadap", "kepada"),
        note="Gunakan `atas` sebagai default. Bacaan `terhadap/kepada` hanya bila hubungan abstrak memang jelas.",
        category="preposition",
    ),
    "عَلَى": PolicyOverride(
        primary="atas",
        alternates=("terhadap", "di atas", "kepada"),
        note="Sama seperti `عَلَىٰ`; kekalkan preposisi dasar.",
        category="preposition",
    ),
    "مِن": PolicyOverride(
        primary="dari",
        alternates=("daripada", "dari/termasuk", "dari/sebagian"),
        note="Defaultkan kepada `dari`. Jangan pindahkan makna token jiran ke atas `مِن`.",
        category="preposition",
    ),
    "مِنۡ": PolicyOverride(
        primary="dari",
        alternates=("daripada", "dari/termasuk", "dari/sebagian"),
        note="Bentuk waqaf/rasm variasi. Kekalkan preposisi dasar.",
        category="preposition",
    ),
    "مِنَ": PolicyOverride(
        primary="dari",
        alternates=("daripada", "dari/termasuk", "dari/di antara"),
        note="Jangan gantikan dengan makna token jiran atau predikat lain.",
        category="preposition",
    ),
    "مِّن": PolicyOverride(
        primary="dari",
        alternates=("daripada",),
        note="Defaultkan kepada `dari`.",
        category="preposition",
    ),
    "مِّنَ": PolicyOverride(
        primary="dari",
        alternates=("daripada", "dari/termasuk"),
        note="Defaultkan kepada `dari`.",
        category="preposition",
    ),
    "إِلَىٰ": PolicyOverride(
        primary="kepada",
        alternates=("sampai", "ke"),
        note="Gunakan `kepada` sebagai lalai. Hanya guna `sampai` bila sempadan/tujuan akhir jelas.",
        category="preposition",
    ),
    "إِلَى": PolicyOverride(
        primary="kepada",
        alternates=("ke", "sampai"),
        note="Defaultkan kepada `kepada`.",
        category="preposition",
    ),
    "إِلَّا": PolicyOverride(
        primary="kecuali",
        alternates=("melainkan", "selain", "hanyalah"),
        note="Kekalkan pengecualian sebagai sense utama.",
        category="exception-particle",
    ),
    "لَا": PolicyOverride(
        primary="tidak",
        alternates=("jangan", "tidak ada", "janganlah"),
        note="Bezakan nafi dan larangan dari binaan fi'il; `tidak` kekal default.",
        category="negation",
    ),
    "وَلَا": PolicyOverride(
        primary="dan tidak",
        alternates=("dan jangan", "dan janganlah", "dan tidak ada"),
        note="Gunakan bentuk larangan hanya apabila fi'il selepasnya jelas larangan.",
        category="negation",
    ),
    "كَانَ": PolicyOverride(
        primary="adalah",
        alternates=("ada", "menjadi"),
        note="Untuk WBW, `adalah` lebih stabil daripada variasi gaya bebas.",
        category="copula",
    ),
    "كَانُواْ": PolicyOverride(
        primary="adalah mereka",
        alternates=("mereka adalah",),
        note="Kekalkan struktur tokenal dan elakkan perluasan gaya naratif.",
        category="copula",
    ),
    "هُوَ": PolicyOverride(
        primary="Dia",
        alternates=("dia", "ia", "Dialah"),
        note="Pilih `Dia` bila rujukan kepada Allah jelas; selain itu `dia/ia` mengikut antecedent.",
        category="pronoun",
    ),
    "هِيَ": PolicyOverride(
        primary="ia",
        alternates=("dia", "itulah"),
        note="Pronomina feminin; jangan tambah frasa penjelas kecuali perlu.",
        category="pronoun",
    ),
    "مَن": PolicyOverride(
        primary="siapa",
        alternates=("orang", "barang siapa", "orang yang"),
        note="Pilih `siapa` untuk fungsi soal/syarat; `orang/ orang yang` untuk fungsi relatif.",
        category="relative-pronoun",
    ),
    "وَمَن": PolicyOverride(
        primary="dan barang siapa",
        alternates=("dan siapa", "dan orang"),
        note="Defaultkan kepada bentuk syarat yang stabil bila konteks memberi maksud umum.",
        category="relative-pronoun",
    ),
    "ٱلَّذِي": PolicyOverride(
        primary="yang",
        alternates=("orang yang", "orang-orang yang"),
        note="Jangan isi rujukan leksikal tambahan ke dalam token relatif ini.",
        category="relative-pronoun",
    ),
    "ٱلَّذِينَ": PolicyOverride(
        primary="orang-orang yang",
        alternates=("yang",),
        note="Bentuk plural relatif. Jangan pindahkan makna entiti kepada token ini.",
        category="relative-pronoun",
    ),
    "وَٱلَّذِينَ": PolicyOverride(
        primary="dan orang-orang yang",
        alternates=("dan orang-orang",),
        note="Sama seperti `ٱلَّذِينَ`, dengan penghubung `dan`.",
        category="relative-pronoun",
    ),
    "لَهُۥ": PolicyOverride(
        primary="baginya",
        alternates=("kepadanya", "bagi-Nya", "kepada-Nya"),
        note="Pilih `baginya` sebagai default; guna `kepadanya` hanya jika struktur menuntut arah/penerima.",
        category="prepositional-pronoun",
    ),
    "لَهُمۡ": PolicyOverride(
        primary="bagi mereka",
        alternates=("kepada mereka", "untuk mereka"),
        note="Elakkan perluasan seperti `mereka mempunyai`; itu milik frasa, bukan token.",
        category="prepositional-pronoun",
    ),
    "بِهِۦ": PolicyOverride(
        primary="dengannya",
        alternates=("padanya", "kepadanya", "dengan-Nya"),
        note="Defaultkan kepada `dengannya`; jangan serap keseluruhan klausa ke dalam token ini.",
        category="prepositional-pronoun",
    ),
    "بِهِ": PolicyOverride(
        primary="dengannya",
        alternates=("padanya", "kepadanya"),
        note="Sama seperti `بِهِۦ`, dengan rasm tanpa tanda panjang.",
        category="prepositional-pronoun",
    ),
    "بِمَا": PolicyOverride(
        primary="dengan apa",
        alternates=("terhadap apa", "dengan sebab", "disebabkan"),
        note="Pilih makna instrumental `dengan apa` sebagai default; sebab/kausal hanya bila konteks jelas.",
        category="compound-particle",
    ),
}

FUNCTION_WORDS = {
    "فِي", "فِيٓ", "فِيهِ", "فِيهَا", "مَا", "مَّا", "مَآ", "وَمَا", "وَمَآ", "أَن", "أَنۡ", "إِن", "إِنۡ",
    "إِنَّ", "إِنَّهُۥ", "إِنَّهُمۡ", "عَلَىٰ", "عَلَى", "مِن", "مِنۡ", "مِنَ", "مِّن", "مِّنَ",
    "إِلَىٰ", "إِلَى", "إِلَّا", "لَا", "وَلَا", "كَانَ", "كَانُواْ", "هُوَ", "هِيَ", "مَن", "وَمَن",
    "ٱلَّذِي", "ٱلَّذِينَ", "وَٱلَّذِينَ", "لَهُۥ", "لَهُمۡ", "بِهِۦ", "بِهِ", "بِمَا",
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
            verses[f"{surah}:{ayah}"] = text.split()
    return verses


def shannon_entropy(counter: Counter[str]) -> float:
    total = sum(counter.values())
    if total == 0:
        return 0.0
    entropy = 0.0
    for count in counter.values():
        probability = count / total
        entropy -= probability * math.log2(probability)
    return entropy


def normalize_gloss(gloss: str) -> str:
    return " ".join(gloss.strip().split())


def infer_category(token: str, dominant_gloss: str) -> str:
    if token in POLICY_OVERRIDES:
        return POLICY_OVERRIDES[token].category
    if token in FUNCTION_WORDS:
        return "function-word"
    lowered = dominant_gloss.lower()
    if lowered.startswith("dan "):
        return "connector"
    if any(word in lowered for word in ("mereka", "dia", "ia", "kami", "kamu", "engkau")):
        return "pronoun-or-clitic"
    if "orang" in lowered or "siapa" in lowered:
        return "relative-pronoun"
    return "lexical"


def generic_note(token: str, dominant_gloss: str) -> str:
    if token in FUNCTION_WORDS:
        return "Gunakan gloss dominan Quranic sebagai default. Override hanya bila struktur sintaks jelas memaksa makna lain."
    if "orang" in dominant_gloss or "siapa" in dominant_gloss:
        return "Kekalkan gloss relatif yang stabil; jangan tambah rujukan entiti pada token ini."
    return "Kekalkan sense dominan Quranic sebagai gloss lalai. Alternate hanya jika konteks memaksa."


def build_token_counters(
    bm_map: dict[str, str],
    en_map: dict[str, str],
    uthmani_map: dict[str, list[str]],
) -> tuple[dict[str, Counter[str]], dict[str, Counter[str]], dict[tuple[str, str], list[str]]]:
    bm_by_token: dict[str, Counter[str]] = defaultdict(Counter)
    en_by_token: dict[str, Counter[str]] = defaultdict(Counter)
    examples: dict[tuple[str, str], list[str]] = defaultdict(list)

    for key, bm_gloss in bm_map.items():
        verse_key = ":".join(key.split(":")[:2])
        position = int(key.split(":")[2]) - 1
        tokens = uthmani_map.get(verse_key, [])
        if position < 0 or position >= len(tokens):
            continue
        token = tokens[position]
        normalized_bm = normalize_gloss(bm_gloss)
        bm_by_token[token][normalized_bm] += 1
        examples[(token, normalized_bm)].append(key)

        en_gloss = normalize_gloss(en_map.get(key, ""))
        if en_gloss:
            en_by_token[token][en_gloss] += 1

    return bm_by_token, en_by_token, examples


def build_policy_rows(
    bm_by_token: dict[str, Counter[str]],
    en_by_token: dict[str, Counter[str]],
) -> list[dict[str, str]]:
    scored_tokens = []
    for token, counter in bm_by_token.items():
        total = sum(counter.values())
        if total < 10 or len(counter) < 2:
            continue
        entropy = shannon_entropy(counter)
        ambiguity_score = entropy * math.log2(total + 1)
        scored_tokens.append((ambiguity_score, total, token, counter))

    scored_tokens.sort(key=lambda row: (-row[0], -row[1], row[2]))
    top_tokens = scored_tokens[:100]

    rows: list[dict[str, str]] = []
    for rank, (score, total, token, counter) in enumerate(top_tokens, start=1):
        dominant_gloss, dominant_count = counter.most_common(1)[0]
        override = POLICY_OVERRIDES.get(token)
        recommended_primary = override.primary if override else dominant_gloss

        alternate_candidates = []
        threshold = max(3, math.ceil(total * 0.08))
        for gloss, count in counter.most_common():
            if gloss == recommended_primary:
                continue
            if override and gloss in override.alternates:
                alternate_candidates.append(gloss)
                continue
            if count >= threshold:
                alternate_candidates.append(gloss)

        if override:
            ordered = list(override.alternates) + alternate_candidates
            seen = set()
            alternates = [gloss for gloss in ordered if not (gloss in seen or seen.add(gloss))]
            note = override.note
        else:
            alternates = alternate_candidates[:5]
            note = generic_note(token, dominant_gloss)

        en_counter = en_by_token.get(token, Counter())
        en_reference = ", ".join(gloss for gloss, _ in en_counter.most_common(3))
        rows.append(
            {
                "rank": str(rank),
                "token": token,
                "occurrences": str(total),
                "distinct_bm_glosses": str(len(counter)),
                "ambiguity_score": f"{score:.3f}",
                "category": infer_category(token, dominant_gloss),
                "current_dominant_bm": dominant_gloss,
                "current_dominant_count": str(dominant_count),
                "recommended_primary_bm": recommended_primary,
                "allowed_alternates_bm": " | ".join(alternates[:6]),
                "top_english_refs": en_reference,
                "policy_note": note,
            }
        )

    return rows


def classify_outlier(gloss: str, recommended_primary: str, allowed_alternates: set[str]) -> list[str]:
    flags = []
    if gloss == recommended_primary:
        return flags
    if gloss not in allowed_alternates:
        flags.append("outside_policy")
    if "/" in gloss:
        flags.append("slash_gloss")
    if "(" in gloss or ")" in gloss:
        flags.append("parenthetical")
    if len(gloss.split()) >= 3:
        flags.append("long_gloss")
    lowered = gloss.lower()
    if any(word in lowered for word in ["allah", "kami", "kamu", "mereka", "malaikat", "nabi", "musa", "yusuf", "iblis"]):
        flags.append("entity_or_pronoun_shift")
    return flags


def is_annotative_expansion(gloss: str, base_gloss: str) -> bool:
    normalized_gloss = " ".join(gloss.lower().split())
    normalized_base = " ".join(base_gloss.lower().split())
    if normalized_gloss == normalized_base:
        return False
    if normalized_base in normalized_gloss:
        return True
    compact_gloss = "".join(ch for ch in normalized_gloss if ch.isalnum())
    compact_base = "".join(ch for ch in normalized_base if ch.isalnum())
    return compact_base in compact_gloss and compact_base != compact_gloss


def build_outlier_rows(
    bm_by_token: dict[str, Counter[str]],
    examples: dict[tuple[str, str], list[str]],
    policy_rows: list[dict[str, str]],
    bm_map: dict[str, str],
    en_map: dict[str, str],
) -> list[dict[str, str]]:
    policy_map = {
        row["token"]: {
            "recommended_primary": row["recommended_primary_bm"],
            "allowed_alternates": set(filter(None, row["allowed_alternates_bm"].split(" | "))),
            "category": row["category"],
            "note": row["policy_note"],
        }
        for row in policy_rows
    }

    rows = []
    for token, counter in bm_by_token.items():
        total = sum(counter.values())
        if total < 15:
            continue
        dominant_gloss, dominant_count = counter.most_common(1)[0]
        policy = policy_map.get(
            token,
            {
                "recommended_primary": dominant_gloss,
                "allowed_alternates": set(),
                "category": infer_category(token, dominant_gloss),
                "note": generic_note(token, dominant_gloss),
            },
        )

        for gloss, count in counter.items():
            if gloss == dominant_gloss:
                continue
            flags = classify_outlier(gloss, policy["recommended_primary"], policy["allowed_alternates"])
            if not flags:
                continue
            if count > max(2, math.ceil(total * 0.05)) and "outside_policy" not in flags:
                continue

            score = 0.0
            score += (dominant_count / total) * 30
            score += (1 / count) * 25
            score += len(flags) * 8
            if "outside_policy" in flags:
                score += 20
            if is_annotative_expansion(gloss, dominant_gloss):
                score -= 25
                flags.append("annotative_expansion")

            sample_keys = examples[(token, gloss)][:5]
            sample_en = [en_map.get(key, "") for key in sample_keys]
            rows.append(
                {
                    "token": token,
                    "occurrences": str(total),
                    "dominant_bm": dominant_gloss,
                    "dominant_count": str(dominant_count),
                    "outlier_bm": gloss,
                    "outlier_count": str(count),
                    "recommended_primary_bm": policy["recommended_primary"],
                    "allowed_alternates_bm": " | ".join(sorted(policy["allowed_alternates"])),
                    "flags": " | ".join(flags),
                    "score": f"{score:.2f}",
                    "sample_keys": " | ".join(sample_keys),
                    "sample_english": " | ".join(sample_en),
                    "policy_note": policy["note"],
                }
            )

    rows.sort(key=lambda row: (-float(row["score"]), row["token"], row["outlier_bm"]))
    for index, row in enumerate(rows, start=1):
        row["rank"] = str(index)
    return rows


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_policy_markdown(path: Path, rows: list[dict[str, str]]) -> None:
    def cell(value: str) -> str:
        return value.replace("|", ", ").replace("\n", " ").strip() or "-"

    lines = [
        "# BM WBW Sense Policy — Top 100 Ambiguous Tokens",
        "",
        "Principle: use the Quranic default sense as the primary WBW gloss. Override only when syntax or collocation clearly forces another sense.",
        "",
        "| Rank | Token | Occ | Current dominant | Recommended primary | Allowed alternates | Category | Note |",
        "| --- | --- | ---: | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {cell(row['rank'])} | {cell(row['token'])} | {cell(row['occurrences'])} | {cell(row['current_dominant_bm'])} | "
            f"{cell(row['recommended_primary_bm'])} | {cell(row['allowed_alternates_bm'])} | {cell(row['category'])} | {cell(row['policy_note'])} |"
        )

    with open(path, "w", encoding="utf-8") as file:
        file.write("\n".join(lines) + "\n")


def main() -> None:
    bm_map = load_json(BM_WBW_PATH)
    en_map = load_json(EN_WBW_PATH)
    uthmani_map = load_uthmani_tokens()

    bm_by_token, en_by_token, examples = build_token_counters(bm_map, en_map, uthmani_map)
    policy_rows = build_policy_rows(bm_by_token, en_by_token)
    outlier_rows = build_outlier_rows(bm_by_token, examples, policy_rows, bm_map, en_map)

    write_csv(
        OUTLIER_CSV_PATH,
        outlier_rows,
        [
            "rank",
            "token",
            "occurrences",
            "dominant_bm",
            "dominant_count",
            "outlier_bm",
            "outlier_count",
            "recommended_primary_bm",
            "allowed_alternates_bm",
            "flags",
            "score",
            "sample_keys",
            "sample_english",
            "policy_note",
        ],
    )
    write_csv(
        POLICY_CSV_PATH,
        policy_rows,
        [
            "rank",
            "token",
            "occurrences",
            "distinct_bm_glosses",
            "ambiguity_score",
            "category",
            "current_dominant_bm",
            "current_dominant_count",
            "recommended_primary_bm",
            "allowed_alternates_bm",
            "top_english_refs",
            "policy_note",
        ],
    )
    write_policy_markdown(POLICY_MD_PATH, policy_rows)

    print(f"Wrote: {OUTLIER_CSV_PATH} ({len(outlier_rows)} rows)")
    print(f"Wrote: {POLICY_CSV_PATH} ({len(policy_rows)} rows)")
    print(f"Wrote: {POLICY_MD_PATH}")


if __name__ == "__main__":
    main()
