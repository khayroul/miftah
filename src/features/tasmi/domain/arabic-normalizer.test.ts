import { describe, it, expect } from 'vitest';
import { normalizeArabic, tokenizeWords } from './arabic-normalizer';

describe('normalizeArabic', () => {
  it('strips tashkeel (diacritics)', () => {
    expect(normalizeArabic('بِسْمِ اللَّهِ')).toBe('بسم الله');
  });

  it('normalizes alef variants', () => {
    expect(normalizeArabic('إِيَّاكَ')).toBe('اياك');
    expect(normalizeArabic('أَنْعَمْتَ')).toBe('انعمت');
    expect(normalizeArabic('آمَنُوا')).toBe('امنوا');
    expect(normalizeArabic('ٱلْحَمْدُ')).toBe('الحمد');
  });

  it('normalizes taa marbuta to haa', () => {
    expect(normalizeArabic('الْفَاتِحَة')).toBe('الفاتحه');
  });

  it('removes tatweel (kashida)', () => {
    expect(normalizeArabic('الرَّحمـــن')).toBe('الرحمن');
  });

  it('collapses whitespace', () => {
    expect(normalizeArabic('بسم   الله   الرحمن')).toBe('بسم الله الرحمن');
  });

  it('handles full Basmala', () => {
    expect(normalizeArabic('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'))
      .toBe('بسم الله الرحمن الرحيم');
  });

  it('handles Al-Fatihah ayah 7', () => {
    expect(normalizeArabic('صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ'))
      .toBe('صراط الذين انعمت عليهم غير المغضوب عليهم ولا الضالين');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic('   ')).toBe('');
  });
});

describe('tokenizeWords', () => {
  it('splits normalized text into words', () => {
    expect(tokenizeWords('بسم الله الرحمن الرحيم'))
      .toEqual(['بسم', 'الله', 'الرحمن', 'الرحيم']);
  });

  it('handles single word', () => {
    expect(tokenizeWords('بسم')).toEqual(['بسم']);
  });

  it('handles empty string', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
});
