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

# Alef maqsura → yaa (Whisper may differ from text_simple)
_ALEF_MAQSURA_RE = re.compile('ى')

# Tatweel (kashida)
_TATWEEL_RE = re.compile('ـ')

# Punctuation (Whisper adds periods, commas, etc.)
_PUNCTUATION_RE = re.compile(r'[.,;:!?،؛؟]')

# Whitespace collapse
_WHITESPACE_RE = re.compile(r'\s+')


def normalize_arabic(text: str) -> str:
    text = _TASHKEEL_RE.sub('', text)       # 1. Strip tashkeel
    text = _ALEF_RE.sub('ا', text)           # 2. Normalize alef variants
    text = _TAA_MARBUTA_RE.sub('ه', text)    # 3. Taa marbuta → haa
    text = _ALEF_MAQSURA_RE.sub('ي', text)  # 4. Alef maqsura → yaa
    text = _TATWEEL_RE.sub('', text)         # 5. Remove tatweel
    text = _PUNCTUATION_RE.sub('', text)     # 6. Strip punctuation
    text = _WHITESPACE_RE.sub(' ', text)     # 7. Collapse whitespace
    return text.strip()
