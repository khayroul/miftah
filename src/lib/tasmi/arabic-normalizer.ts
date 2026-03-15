/**
 * Arabic text normalizer for tasmi' comparison.
 * MUST be identical to server-side normalizer.py
 */

// Tashkeel (diacritics) Unicode ranges
const TASHKEEL_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;

// Alef variants
const ALEF_REGEX = /[إأآٱ]/g;

export function normalizeArabic(text: string): string {
  return text
    .replace(TASHKEEL_REGEX, '')     // 1. Strip tashkeel
    .replace(ALEF_REGEX, 'ا')        // 2. Normalize alef variants
    .replace(/ة/g, 'ه')             // 3. Taa marbuta → haa
    .replace(/ـ/g, '')              // 4. Remove tatweel
    .replace(/[.,;:!?،؛؟]/g, '')    // 5. Strip punctuation (Whisper adds these)
    .replace(/\s+/g, ' ')           // 6. Collapse whitespace
    .trim();
}

export function tokenizeWords(normalizedText: string): string[] {
  return normalizedText.split(' ').filter(w => w.length > 0);
}
