#!/usr/bin/env python3
"""
Editorial rewrite for Quran themes in Bahasa Malaysia.

This script rewrites `data/seed/themes.json` so that:
- `name_bm` reads naturally in BM Malaysia.
- `description_bm` exists for every theme and reflects the theme's meaning.

It uses repo-local sources only:
- linked ayat per theme (`data/seed/theme_ayat.json`)
- full BM ayah translations (`data/qul/abdullah-basamia-simple.json`)
- BM word-by-word glosses (`data/bm_wbw_complete.json`)

Usage:
  python3 scripts/translate/editorialize_themes_bm.py --write
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
THEMES_PATH = PROJECT_ROOT / "data/seed/themes.json"
THEME_AYAT_PATH = PROJECT_ROOT / "data/seed/theme_ayat.json"
BM_AYAH_PATH = PROJECT_ROOT / "data/qul/abdullah-basamia-simple.json"
BM_WBW_PATH = PROJECT_ROOT / "data/bm_wbw_complete.json"
AUDIT_PATH = PROJECT_ROOT / "data/seed/themes_editorial_audit.json"

SMALL_WORDS = {
    "dan",
    "di",
    "ke",
    "dari",
    "yang",
    "pada",
    "bagi",
    "dengan",
    "untuk",
    "serta",
    "atau",
    "dalam",
    "terhadap",
    "kepada",
    "oleh",
    "atas",
    "sebagai",
    "antara",
}

STOPWORDS = {
    "dan",
    "yang",
    "di",
    "ke",
    "dari",
    "dengan",
    "pada",
    "kepada",
    "untuk",
    "oleh",
    "atas",
    "dalam",
    "serta",
    "atau",
    "bahawa",
    "sesungguhnya",
    "maka",
    "ia",
    "mereka",
    "kami",
    "kamu",
    "aku",
    "engkau",
    "itu",
    "ini",
    "juga",
    "lagi",
    "akan",
    "telah",
    "adalah",
    "ialah",
    "sebagai",
    "orang",
    "orang-orang",
    "sesiapa",
    "barangsiapa",
    "setelah",
    "kalau",
    "kerana",
    "supaya",
    "hanya",
    "sahaja",
    "semua",
    "setiap",
    "beberapa",
    "suatu",
    "pula",
    "tetaplah",
    "sedang",
    "apabila",
    "hingga",
    "tidak",
    "bukan",
    "dapat",
    "mereka",
    "kami",
    "kamu",
    "dia",
    "nya",
    "aku",
    "engkau",
    "wahai",
    "demi",
    "sungguh",
    "sedikit",
    "juapun",
    "mereka",
    "kepadanya",
    "daripadanya",
    "baginya",
    "mereka",
    "dunia",
    "akhirat",
    "jalan",
    "mendapat",
    "memberi",
    "berfirman",
    "berkata",
    "kami",
    "kamu",
    "allah",
    "ada",
    "lain",
    "katakanlah",
    "besar",
    "kepadamu",
    "maha",
    "tuhan",
    "apa",
    "kemudian",
    "lalu",
    "lebih",
    "sekali-kali",
    "terhadap",
    "manusia",
    "beriman",
    "masa",
    "musuh",
    "melihat",
    "mengetahui",
    "diturunkan",
    "diturunkan",
    "menjadi",
    "ketika",
    "sampai",
    "tempat",
    "pergi",
    "bapa",
    "ayah",
    "muda",
    "mereka",
    "tuhanmu",
    "tuhannya",
    "kita",
    "kamu",
    "kami",
    "aku",
    "engkau",
    "daripada",
    "melainkan",
    "sentiasa",
    "itulah",
    "merekalah",
    "antara",
    "baharu",
    "padahal",
    "hendak",
    "percaya",
    "sekalian",
    "mahu",
    "jangan",
    "sesuatu",
    "perempuan-perempuan",
    "lah",
    "kamilah",
    "adapun",
    "melayaninya",
    "mengapa",
    "bagimu",
    "sememangnya",
    "pengampun",
    "mengasihani",
    "hendakkan",
    "cepat",
    "dilimpahkannya",
    "didatangi",
    "hal",
    "menerangkan",
    "padanya",
    "iaitu",
    "kitab-kitab",
    "daripadamu",
}

PROPHET_TITLES = {
    "Adam",
    "Harun",
    "Hud",
    "Ibrahim",
    "Ilyas",
    "Isa",
    "Ishak",
    "Ismail",
    "Lut",
    "Luqman",
    "Muhammad",
    "Musa",
    "Nuh",
    "Salih",
    "Shu'aib",
    "Sulaiman",
    "Yahya",
    "Yaqub",
    "Yunus",
    "Yusuf",
    "Zakaria",
    "Daud",
}

AFTERLIFE_TITLES = {
    "Hari Kiamat",
    "Hari Pembalasan",
    "Syurga",
    "Firdaus",
    "Neraka",
}

WORSHIP_TITLES = {
    "Haji",
    "Solat",
    "Solat dan Zakat",
    "Zakat",
    "Doa",
    "Puasa",
    "Sedekah",
}

GENERIC_TITLE_TOKENS = {
    "Ahli",
    "Anak",
    "Awal",
    "Baik",
    "Bagi",
    "Belum",
    "Cara",
    "Hari",
    "Jika",
    "Kitab",
    "Kuasa",
    "Layak",
    "Masuk",
    "Nabi",
    "Patut",
    "Puak",
    "Sama",
    "Sebab",
    "Sedia",
    "Sifat",
    "Sisi",
    "Suci",
    "Sesuatu",
    "Tiada",
    "Tujuh",
    "Umat",
}

EXACT_TITLE_FIXES = {
    "Anak-anak Israil": "Bani Israil",
    "Sabian": "Kaum Sabi'in",
    "Waktu Fajar": "Fajar",
    "Bijian": "Biji-bijian",
    "Kilatan": "Kilat",
    "Alaq (Segumpal Darah)": "Alaq",
    "Burung Huppe": "Burung Hudhud",
    "Pengikut Kayu": "Ashabul Aikah",
    "Laiton": "Loyang",
    "Arak Anggur": "Arak",
    "Nabi Harun": "Harun",
    "Nabi Daud": "Daud",
    "Nabi Nuh": "Nuh",
    "Nabi Zakaria": "Zakaria",
    "Nabi Yahya": "Yahya",
    "Nabi Yusuf": "Yusuf",
    "Nabi Lut": "Lut",
    "Nabi Muhammad": "Muhammad",
    "Yang Terpinggir": "Golongan Terpinggir",
    "Yang Tidak Diketahui": "Perkara Ghaib",
}

MANUAL_TITLE_OVERRIDES = {
    503: "Solat dan Zakat",
    705: "Neraka",
    1008: "Bahtera Nabi Nuh",
    2046: "Wahyu kepada Nabi Muhammad",
    2051: "Wahyu kepada Nabi Muhammad",
    2312: "Yusuf dan Saudara-saudaranya",
}

TOKEN_TITLE_MAP = {
    "al-quran": "Al-Quran",
    "akhirat": "Akhirat",
    "adil": "Keadilan",
    "agama": "Agama",
    "ahli": "Ahli",
    "angin": "Angin",
    "bahtera": "Bahtera",
    "berhala": "Berhala",
    "bintang": "Bintang",
    "bulan": "Bulan",
    "firaun": "Fir'aun",
    "firdaus": "Firdaus",
    "ghaib": "Perkara Ghaib",
    "gua": "Gua",
    "iblis": "Iblis",
    "jibril": "Jibril",
    "jahanam": "Neraka",
    "jin": "Jin",
    "jihad": "Jihad",
    "keadilan": "Keadilan",
    "kejahatan": "Kejahatan",
    "kejadian": "Kejadian",
    "kiamat": "Hari Kiamat",
    "kubur": "Kubur",
    "lailatul-qadar": "Lailatul Qadar",
    "malam": "Malam",
    "mahar": "Mahar",
    "maryam": "Maryam",
    "matahari": "Matahari",
    "musa": "Musa",
    "muhammad": "Muhammad",
    "nabi": "Nabi",
    "neraka": "Neraka",
    "nuh": "Nuh",
    "pembalasan": "Hari Pembalasan",
    "quran": "Al-Quran",
    "ribut": "Ribut",
    "rom": "Rom",
    "serigala": "Serigala",
    "solat": "Solat",
    "syaitan": "Syaitan",
    "syurga": "Syurga",
    "tasbih": "Tasbih",
    "tentera": "Tentera",
    "wahyu": "Wahyu",
    "zuriat": "Zuriat",
    "yaakub": "Yaqub",
    "yaqub": "Yaqub",
    "yusuf": "Yusuf",
    "zakat": "Zakat",
}


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def dump_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def is_placeholder(theme: dict[str, Any]) -> bool:
    name_bm = str(theme.get("name_bm") or "")
    name_en = str(theme.get("name_en") or "")
    return bool(re.fullmatch(r"Tema \d+", name_bm) or re.fullmatch(r"Topic \d+", name_en))


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def strip_parenthetical(value: str) -> str:
    return normalize_space(re.sub(r"\([^)]*\)", "", value))


def title_case_bm(value: str) -> str:
    parts = re.split(r"(\s+)", value.strip())
    rendered: list[str] = []
    word_index = 0
    for part in parts:
        if not part or part.isspace():
            rendered.append(part)
            continue

        lower = part.lower()
        if word_index > 0 and lower in SMALL_WORDS:
            rendered.append(lower)
        elif lower in {"al-quran", "al-qur'an"}:
            rendered.append("Al-Quran")
        elif lower in {"fir'aun", "fir’aun"}:
            rendered.append("Fir'aun")
        elif lower == "sabi'in":
            rendered.append("Sabi'in")
        else:
            rendered.append(part[0].upper() + part[1:])
        word_index += 1
    return "".join(rendered)


def normalize_existing_title(theme: dict[str, Any]) -> str:
    if theme["id"] in MANUAL_TITLE_OVERRIDES:
        return MANUAL_TITLE_OVERRIDES[theme["id"]]

    title = str(theme.get("name_bm") or theme.get("name_en") or "").strip()
    title = EXACT_TITLE_FIXES.get(title, title)
    title = title.replace("  ", " ")
    title = title.replace("’", "'")

    if title.lower() == "allah":
        return "Allah"
    if title.lower() == "al-quran":
        return "Al-Quran"
    if title.lower() == "kaabah":
        return "Kaabah"
    if title.lower() == "injil":
        return "Injil"
    if title.lower() == "taurat":
        return "Taurat"
    if title.lower() == "firaun":
        return "Fir'aun"
    if title.lower() == "badr":
        return "Badr"
    if title.lower() == "ashabul kahfi":
        return "Ashabul Kahfi"
    if title.lower() == "ashabul aikah":
        return "Ashabul Aikah"

    return finalize_title(title_case_bm(title))


def finalize_title(value: str) -> str:
    title = normalize_space(value)

    while True:
        updated = re.sub(
            r"^(Dan|Dengan|Yang|Pada|Di|Ke|Dari|Untuk|Serta)\s+",
            "",
            title,
            count=1,
            flags=re.IGNORECASE,
        )
        if updated == title:
            break
        title = updated.strip()

    title = title.replace("Al 'uzza", "Al-'Uzza")
    title = title.replace("Al ’uzza", "Al-'Uzza")
    title = title.replace("Orang-orang", "Orang-orang")

    repeated = re.match(r"^(.+?)\s+dan\s+\1$", title, flags=re.IGNORECASE)
    if repeated:
        title = repeated.group(1)

    if title == "Terpinggir":
        return "Golongan Terpinggir"
    if title == "Tidak Diketahui":
        return "Perkara Ghaib"
    return title_case_bm(title)


def compress_positions(positions: list[int]) -> list[int]:
    if not positions:
        return positions
    if len(positions) % 2 == 0:
        half = len(positions) // 2
        if positions[:half] == positions[half:]:
            return positions[:half]
    compact: list[int] = []
    for pos in positions:
        if compact and compact[-1] == pos:
            continue
        compact.append(pos)
    return compact


def normalize_note_phrase(phrase: str) -> str:
    text = normalize_space(phrase).lower()
    text = text.replace("sembahyang", "solat")
    text = text.replace("hari pembalasan hari pembalasan", "hari pembalasan")
    text = text.replace("hari kiamat hari kiamat", "hari kiamat")
    text = text.replace("kaum'ad", "kaum 'ad")
    text = text.replace("kaum 'ad", "kaum 'ad")
    parts = text.split()
    if parts and len(set(parts)) == 1:
        text = parts[0]

    if "hari pembalasan" in text:
        return "Hari Pembalasan"
    if "hari kiamat" in text:
        return "Hari Kiamat"
    if "bahtera" in text and "nuh" in text:
        return "Bahtera Nabi Nuh"
    if "kaum 'ad" in text or text == "'ad":
        return "Kaum 'Ad"
    if text == "berhala":
        return "Berhala"
    if text == "solat":
        return "Solat"
    if text == "zakat":
        return "Zakat"
    return title_case_bm(text)


def extract_note_phrases(
    links: list[dict[str, Any]],
    bm_wbw: dict[str, str],
) -> Counter[str]:
    phrases: Counter[str] = Counter()
    for link in links:
        notes = link.get("notes")
        if not notes:
            continue
        try:
            positions = [int(v) for v in json.loads(notes)]
        except (ValueError, TypeError, json.JSONDecodeError):
            continue

        positions = compress_positions(positions)
        verse_key = f"{link['surah_id']}:{link['ayah_number']}"
        words = [bm_wbw.get(f"{verse_key}:{pos}", "").strip() for pos in positions]
        words = [word for word in words if word]
        if not words:
            continue

        phrase = normalize_note_phrase(" ".join(words))
        if phrase:
            phrases[phrase] += 1
    return phrases


def extract_named_candidates(translations: list[str]) -> Counter[str]:
    candidates: Counter[str] = Counter()
    patterns = {
        "Hari Kiamat": re.compile(r"hari kiamat", re.IGNORECASE),
        "Hari Pembalasan": re.compile(r"hari pembalasan", re.IGNORECASE),
        "Neraka": re.compile(r"neraka(?: jahan+am)?", re.IGNORECASE),
        "Bahtera Nabi Nuh": re.compile(r"bahtera(?: nabi)? nuh|bahtera", re.IGNORECASE),
        "Wahyu": re.compile(r"wahyu", re.IGNORECASE),
        "Bani Israil": re.compile(r"bani israil", re.IGNORECASE),
        "Kaum 'Ad": re.compile(r"kaum '?ad|'ad", re.IGNORECASE),
        "Kaum Thamud": re.compile(r"thamud", re.IGNORECASE),
        "Kaum Madyan": re.compile(r"madyan", re.IGNORECASE),
        "Fir'aun": re.compile(r"firaun", re.IGNORECASE),
        "Jibril": re.compile(r"jibril", re.IGNORECASE),
        "Yusuf": re.compile(r"yusuf", re.IGNORECASE),
        "Nuh": re.compile(r"nabi nuh|\bnuh\b", re.IGNORECASE),
        "Musa": re.compile(r"nabi musa|\bmusa\b", re.IGNORECASE),
        "Muhammad": re.compile(r"nabi muhammad|muhammad", re.IGNORECASE),
        "Maryam": re.compile(r"maryam", re.IGNORECASE),
        "Isa": re.compile(r"\bisa\b", re.IGNORECASE),
        "Ibrahim": re.compile(r"ibrahim", re.IGNORECASE),
        "Solat": re.compile(r"sembahyang|solat", re.IGNORECASE),
        "Zakat": re.compile(r"zakat", re.IGNORECASE),
        "Berhala": re.compile(r"berhala", re.IGNORECASE),
        "Al-Quran": re.compile(r"al-quran|quran", re.IGNORECASE),
        "Ashabul Kahfi": re.compile(r"ashaabul kahfi|ashabul kahfi", re.IGNORECASE),
        "Rom": re.compile(r"orang-orang rom|\brom\b", re.IGNORECASE),
        "Lailatul Qadar": re.compile(r"lailatul[ -]?qadar", re.IGNORECASE),
        "Ahzab": re.compile(r"al-ahzaab|ahzaab", re.IGNORECASE),
    }

    for translation in translations:
        for label, pattern in patterns.items():
            if pattern.search(translation):
                candidates[label] += 1
    return candidates


def extract_keyword_counts(translations: list[str]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for translation in translations:
        lowered = strip_parenthetical(translation).lower()
        lowered = lowered.replace("sembahyang", "solat")
        lowered = re.sub(r"[^a-zA-Z0-9' -]", " ", lowered)
        tokens = [token.strip("-'") for token in lowered.split()]
        seen: set[str] = set()
        for token in tokens:
            if not token or token in STOPWORDS or len(token) < 3:
                continue
            if token in seen:
                continue
            seen.add(token)
            counts[token] += 1
    return counts


def choose_title_from_keywords(
    keyword_counts: Counter[str],
    named_counts: Counter[str],
) -> str | None:
    if named_counts["Ashabul Kahfi"] >= 1 or keyword_counts["gua"] >= 3:
        return "Ashabul Kahfi"
    if named_counts["Lailatul Qadar"] >= 1 or keyword_counts["lailatul-qadar"] >= 1:
        return "Lailatul Qadar"
    if named_counts["Al-Quran"] >= 3 and keyword_counts["jin"] >= 2:
        return "Jin dan Al-Quran"
    if named_counts["Al-Quran"] >= 3 and keyword_counts["bacaannya"] >= 2:
        return "Bacaan Al-Quran"
    if named_counts["Al-Quran"] >= 5:
        return "Al-Quran"
    if named_counts["Neraka"] >= 3:
        return "Neraka"
    if named_counts["Hari Kiamat"] >= 2 or named_counts["Hari Pembalasan"] >= 2:
        return "Hari Kiamat" if named_counts["Hari Kiamat"] >= named_counts["Hari Pembalasan"] else "Hari Pembalasan"
    if named_counts["Bahtera Nabi Nuh"] >= 2 and named_counts["Nuh"] >= 2:
        return "Bahtera Nabi Nuh"
    if named_counts["Wahyu"] >= 2 and (named_counts["Muhammad"] >= 1 or named_counts["Jibril"] >= 1):
        return "Wahyu kepada Nabi Muhammad"
    if named_counts["Jibril"] >= 2 and named_counts["Muhammad"] >= 2:
        return "Jibril"
    if keyword_counts["solat"] >= 2 and named_counts["Zakat"] >= 2:
        return "Solat dan Zakat"
    if keyword_counts["berjihad"] >= 3:
        return "Jihad"
    if named_counts["Yusuf"] >= 2 and keyword_counts["saudara"] >= 2:
        return "Yusuf dan Saudara-saudaranya"
    if named_counts["Nuh"] >= 2 and keyword_counts["bahtera"] >= 2:
        return "Bahtera Nabi Nuh"
    if named_counts["Ahzab"] >= 1 and keyword_counts["tentera"] >= 2:
        return "Tentera Ahzab"
    if keyword_counts["angin"] >= 3 and keyword_counts["ribut"] >= 2:
        return "Angin Ribut"
    if keyword_counts["kejadian"] >= 3 and keyword_counts["semula"] >= 2:
        return "Kebangkitan Semula"
    if keyword_counts["berlindung"] >= 2 and keyword_counts["kejahatan"] >= 2:
        return "Perlindungan daripada Kejahatan"
    if keyword_counts["syaitan"] >= 3 and keyword_counts["iblis"] >= 2:
        return "Iblis dan Syaitan"
    if keyword_counts["tentera"] >= 3 and keyword_counts["musuh"] >= 2:
        return "Tentera Musuh"
    if keyword_counts["ghaib"] >= 2:
        return "Perkara Ghaib"
    if keyword_counts["bertaqwa"] >= 1 and keyword_counts["kitab"] >= 1:
        return "Orang Bertaqwa"
    if keyword_counts["bani"] >= 1 and keyword_counts["israil"] >= 1:
        return "Bani Israil"
    if keyword_counts["jihad"] >= 2:
        return "Jihad"
    if named_counts["Rom"] >= 2:
        return "Rom"
    if keyword_counts["keadilan"] >= 1 or keyword_counts["adil"] >= 1:
        return "Keadilan"
    if keyword_counts["tasbih"] >= 2:
        return "Tasbih"
    if keyword_counts["tasbih"] >= 1 and keyword_counts["langit"] >= 2:
        return "Tasbih"
    if keyword_counts["bintang-bintang"] >= 2 or keyword_counts["bintang"] >= 2:
        return "Bintang-bintang"
    if keyword_counts["matahari"] >= 2 and keyword_counts["bulan"] >= 2:
        return "Matahari dan Bulan"
    if keyword_counts["ugama"] >= 2 or keyword_counts["agama"] >= 2 or (
        keyword_counts["hasad"] >= 2 and keyword_counts["dengki"] >= 2 and keyword_counts["kitab"] >= 2
    ):
        return "Agama"
    if keyword_counts["berlumba-lumba"] >= 1 and keyword_counts["kubur"] >= 1:
        return "Leka dengan Dunia"
    if keyword_counts["maskahwinnya"] >= 2:
        return "Mahar dan Hak Isteri"
    if keyword_counts["angin"] >= 3:
        return "Angin"

    for token, _count in keyword_counts.most_common(12):
        mapped = TOKEN_TITLE_MAP.get(token)
        if mapped and mapped not in GENERIC_TITLE_TOKENS:
            return mapped
        if token in {"yusuf", "nuh", "musa", "maryam", "isa", "ibrahim", "muhammad"}:
            return title_case_bm(token)
        if token == "thamud":
            return "Kaum Thamud"
        if token == "madyan":
            return "Kaum Madyan"
        if token in {"ad", "'ad"}:
            return "Kaum 'Ad"
        if token == "jahanam":
            return "Neraka"
        if token not in STOPWORDS and len(token) >= 4:
            candidate = title_case_bm(token)
            if candidate not in GENERIC_TITLE_TOKENS:
                return candidate
    return None


def derive_placeholder_title(
    theme: dict[str, Any],
    links: list[dict[str, Any]],
    translations: list[str],
    bm_wbw: dict[str, str],
) -> tuple[str, str]:
    if theme["id"] in MANUAL_TITLE_OVERRIDES:
        return finalize_title(MANUAL_TITLE_OVERRIDES[theme["id"]]), "manual_override"

    note_phrases = extract_note_phrases(links, bm_wbw)
    if note_phrases:
        return finalize_title(note_phrases.most_common(1)[0][0]), "note_phrase"

    named_counts = extract_named_candidates(translations)
    keyword_counts = extract_keyword_counts(translations)
    title = choose_title_from_keywords(keyword_counts, named_counts)
    if title:
        return finalize_title(title), "keyword_inference"

    if translations:
        return "Tema Berkaitan Pengajaran Al-Quran", "fallback_generic"
    return f"Tema {theme['id']}", "fallback_id"


def synopsis_for_special_title(title: str, translations: list[str]) -> str | None:
    lowered = " ".join(translations).lower()
    if title == "Allah":
        return (
            "Tema ini menghimpunkan ayat yang menegaskan keesaan Allah, sifat-sifat-Nya, "
            "serta hubungan hamba dengan Tuhan yang Maha Esa."
        )
    if title in {"Hari Kiamat", "Hari Pembalasan"}:
        return (
            "Tema ini menghimpunkan ayat tentang kebangkitan, perhitungan amal, dan balasan "
            "yang menanti manusia pada hari akhir."
        )
    if title == "Neraka":
        return (
            "Tema ini menghimpunkan ayat tentang neraka sebagai tempat balasan bagi orang yang "
            "kufur dan derhaka, serta amaran tentang akibatnya di akhirat."
        )
    if title == "Bahtera Nabi Nuh":
        return (
            "Tema ini menghimpunkan ayat tentang dakwah Nabi Nuh, keselamatan orang beriman "
            "melalui bahtera, dan bahtera itu sebagai tanda kekuasaan Allah."
        )
    if title == "Jin dan Al-Quran":
        return (
            "Tema ini menghimpunkan ayat tentang golongan jin yang mendengar Al-Quran, lalu "
            "mengiktiraf kebenarannya dan menyeru kaumnya kepada iman."
        )
    if title == "Jibril":
        return (
            "Tema ini menghimpunkan ayat yang menyentuh peranan Jibril dalam penyampaian wahyu "
            "serta hubungannya dengan kerasulan Nabi Muhammad."
        )
    if title == "Bacaan Al-Quran":
        return (
            "Tema ini menghimpunkan ayat tentang pembacaan Al-Quran, penjagaan wahyu, dan "
            "bagaimana Nabi Muhammad menerimanya dengan bimbingan Allah."
        )
    if title == "Ashabul Kahfi":
        return (
            "Tema ini menghimpunkan ayat tentang Ashabul Kahfi, termasuk perlindungan Allah "
            "terhadap para pemuda beriman dan pengajaran daripada kisah mereka."
        )
    if title == "Tentera Ahzab":
        return (
            "Tema ini menghimpunkan ayat tentang tekanan yang dihadapi orang beriman ketika "
            "dikepung tentera Ahzab, serta pertolongan Allah dalam saat genting."
        )
    if title == "Angin Ribut":
        return (
            "Tema ini menghimpunkan ayat yang menyebut angin ribut sebagai tanda kekuasaan Allah, "
            "alat azab, atau unsur yang membawa pengajaran kepada manusia."
        )
    if title == "Kebangkitan Semula":
        return (
            "Tema ini menghimpunkan ayat tentang penciptaan semula manusia selepas mati, sebagai "
            "bukti kekuasaan Allah dan dasar kepercayaan kepada hari akhirat."
        )
    if title == "Perlindungan daripada Kejahatan":
        return (
            "Tema ini menghimpunkan ayat tentang memohon perlindungan kepada Allah daripada "
            "kejahatan makhluk dan segala bentuk keburukan yang tersembunyi."
        )
    if title == "Iblis dan Syaitan":
        return (
            "Tema ini menghimpunkan ayat tentang Iblis dan syaitan sebagai musuh manusia, "
            "termasuk tipu daya, kesombongan, dan bahaya mengikut langkah mereka."
        )
    if title == "Perkara Ghaib":
        return (
            "Tema ini menghimpunkan ayat tentang perkara ghaib yang hanya diketahui Allah, "
            "serta batas pengetahuan manusia terhadap apa yang tersembunyi."
        )
    if title == "Lailatul Qadar":
        return (
            "Tema ini menghimpunkan ayat tentang Lailatul Qadar sebagai malam yang penuh "
            "kemuliaan dan saat turunnya Al-Quran."
        )
    if title == "Jihad":
        return (
            "Tema ini menghimpunkan ayat tentang jihad pada jalan Allah, termasuk pengorbanan "
            "harta, jiwa, dan kesungguhan mempertahankan iman."
        )
    if title == "Orang Bertaqwa":
        return (
            "Tema ini menghimpunkan ayat tentang sifat orang bertaqwa, termasuk iman kepada "
            "yang ghaib, solat, dan keyakinan terhadap petunjuk Allah."
        )
    if title == "Bintang-bintang":
        return (
            "Tema ini menghimpunkan ayat yang menyebut bintang-bintang sebagai sebahagian "
            "daripada tanda kebesaran Allah di langit."
        )
    if title == "Agama":
        return (
            "Tema ini menghimpunkan ayat tentang agama yang benar di sisi Allah, termasuk "
            "perselisihan manusia terhadap petunjuk yang telah jelas."
        )
    if title == "Leka dengan Dunia":
        return (
            "Tema ini menghimpunkan ayat yang mengingatkan manusia agar tidak lalai kerana "
            "persaingan dunia hingga melupakan akhirat."
        )
    if title == "Mahar dan Hak Isteri":
        return (
            "Tema ini menghimpunkan ayat tentang mahar, hak isteri, dan adab mempergauli "
            "pasangan dengan cara yang baik."
        )
    if title == "Keadilan":
        return (
            "Tema ini menghimpunkan ayat yang menegaskan keadilan sebagai tuntutan iman, "
            "sekalipun ketika berdepan dengan kebencian atau perbezaan."
        )
    if title == "Tasbih":
        return (
            "Tema ini menghimpunkan ayat tentang tasbih sebagai pengagungan kepada Allah, "
            "sama ada oleh manusia mahupun seluruh makhluk."
        )
    if title == "Solat dan Zakat":
        return (
            "Tema ini menghimpunkan ayat yang menegaskan solat dan zakat sebagai tanda ketaatan, "
            "kesyukuran, dan ciri penting orang beriman."
        )
    if title == "Wahyu kepada Nabi Muhammad":
        return (
            "Tema ini menghimpunkan ayat tentang wahyu yang disampaikan kepada Nabi Muhammad, "
            "termasuk kedudukan kerasulan baginda dan penyampaian wahyu secara benar."
        )
    if title == "Yusuf dan Saudara-saudaranya":
        return (
            "Tema ini menghimpunkan ayat tentang kisah Nabi Yusuf bersama saudara-saudaranya, "
            "termasuk ujian, tipu daya, dan pengajaran yang lahir daripada kisah itu."
        )
    if title == "Berhala":
        return (
            "Tema ini menghimpunkan ayat yang membongkar kesesatan penyembahan berhala dan "
            "mengajak manusia mentauhidkan Allah semata-mata."
        )
    if title == "Kaum 'Ad":
        return (
            "Tema ini menghimpunkan ayat tentang kaum 'Ad, terutama sikap mereka terhadap "
            "seruan rasul dan akibat azab yang menimpa mereka."
        )
    if "syurga" in title.lower() or title == "Firdaus":
        return (
            "Tema ini menghimpunkan ayat tentang syurga sebagai balasan bagi orang beriman, "
            "serta gambaran nikmat yang dijanjikan Allah."
        )
    if "bahtera" in lowered and "nuh" in lowered:
        return (
            "Tema ini menghimpunkan ayat tentang Nabi Nuh, peringatan baginda kepada kaumnya, "
            "dan bahtera sebagai jalan keselamatan bagi orang beriman."
        )
    return None


def build_description(
    theme: dict[str, Any],
    title: str,
    translations: list[str],
) -> str:
    special = synopsis_for_special_title(title, translations)
    if special:
        return special

    if title in PROPHET_TITLES:
        return (
            f"Tema ini menghimpunkan ayat yang menyebut {title} serta pengajaran yang berkaitan "
            "dengan peranan, kisah, dan seruannya dalam Al-Quran."
        )
    if title.startswith("Kaum "):
        return (
            f"Tema ini menghimpunkan ayat tentang {title}, terutama sikap mereka terhadap seruan "
            "para rasul serta akibat yang menimpa mereka."
        )
    if title in AFTERLIFE_TITLES:
        return (
            f"Tema ini menghimpunkan ayat tentang {title}, termasuk peringatan, balasan, dan "
            "pengajaran yang dikaitkan dengannya dalam kehidupan akhirat."
        )
    if title in WORSHIP_TITLES or theme.get("category") == "ibadah":
        return (
            f"Tema ini menghimpunkan ayat yang menekankan {title} sebagai amalan ibadah, "
            "ketaatan, dan jalan mendekatkan diri kepada Allah."
        )
    if theme.get("category") == "kawniyyat":
        return (
            f"Tema ini menghimpunkan ayat yang menyebut {title} sebagai sebahagian daripada "
            "tanda kekuasaan Allah dalam penciptaan dan kehidupan."
        )
    if theme.get("category") == "aqidah":
        return (
            f"Tema ini menghimpunkan ayat yang menerangkan {title} dalam rangka akidah, "
            "petunjuk, dan penghayatan iman menurut Al-Quran."
        )
    return (
        f"Tema ini menghimpunkan ayat yang berkait dengan {title}, serta pengajaran yang boleh "
        "diambil daripada konteksnya dalam Al-Quran."
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Write changes to disk.")
    args = parser.parse_args()

    themes = load_json(THEMES_PATH)
    theme_ayat = load_json(THEME_AYAT_PATH)
    bm_ayah = load_json(BM_AYAH_PATH)
    bm_wbw = load_json(BM_WBW_PATH)

    links_by_theme: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for link in theme_ayat:
        links_by_theme[int(link["theme_id"])].append(link)

    rewritten: list[dict[str, Any]] = []
    audit_rows: list[dict[str, Any]] = []
    placeholders_rewritten = 0
    description_written = 0

    for theme in themes:
        theme_id = int(theme["id"])
        links = links_by_theme.get(theme_id, [])
        verse_keys = [f"{link['surah_id']}:{link['ayah_number']}" for link in links]
        translations = []
        for key in verse_keys:
            item = bm_ayah.get(key)
            text = item.get("t", "").strip() if isinstance(item, dict) else ""
            if text:
                translations.append(text)

        if is_placeholder(theme):
            title, reason = derive_placeholder_title(theme, links, translations, bm_wbw)
            placeholders_rewritten += 1
        else:
            title = normalize_existing_title(theme)
            reason = "normalize_existing"

        description = build_description(theme, title, translations)
        description_written += 1 if description else 0

        rewritten_theme = {
            **theme,
            "name_bm": title,
            "description_bm": description,
        }
        rewritten.append(rewritten_theme)

        audit_rows.append(
            {
                "id": theme_id,
                "old_name_bm": theme.get("name_bm"),
                "new_name_bm": title,
                "title_reason": reason,
                "links_count": len(links),
                "sample_verses": verse_keys[:5],
            }
        )

    if args.write:
        dump_json(THEMES_PATH, rewritten)
        dump_json(AUDIT_PATH, audit_rows)

    title_reason_counts = Counter(row["title_reason"] for row in audit_rows)
    print(f"themes={len(themes)}")
    print(f"placeholders_rewritten={placeholders_rewritten}")
    print(f"description_written={description_written}")
    for reason, count in sorted(title_reason_counts.items()):
        print(f"title_reason[{reason}]={count}")
    print(f"audit_path={AUDIT_PATH}")
    if args.write:
        print(f"wrote={THEMES_PATH}")


if __name__ == "__main__":
    main()
