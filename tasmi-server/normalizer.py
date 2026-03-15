"""
Arabic text normalizer for tasmi' comparison.
MUST be identical to client-side arabic-normalizer.ts
"""

import re

# Tashkeel (diacritics) Unicode ranges
_TASHKEEL_RE = re.compile(
    '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]'
)

# Alef variants → plain alef
_ALEF_RE = re.compile('[إأآٱ]')

# Taa marbuta
_TAA_MARBUTA_RE = re.compile('ة')

# Tatweel (kashida)
_TATWEEL_RE = re.compile('ـ')

# Whitespace collapse
_WHITESPACE_RE = re.compile(r'\s+')


def normalize_arabic(text: str) -> str:
    text = _TASHKEEL_RE.sub('', text)       # 1. Strip tashkeel
    text = _ALEF_RE.sub('ا', text)           # 2. Normalize alef variants
    text = _TAA_MARBUTA_RE.sub('ه', text)    # 3. Taa marbuta → haa
    text = _TATWEEL_RE.sub('', text)         # 4. Remove tatweel
    text = _WHITESPACE_RE.sub(' ', text)     # 5. Collapse whitespace
    return text.strip()
