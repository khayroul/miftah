/**
 * Mode B (juzuk exam) domain: build the recitation contract for one exam round
 * from the ayah span returned by /api/tasmi/juzuk-round.
 *
 * Same word-offset algorithm as the hifz tasmi-text builder: ranges index into
 * the whitespace-token space of the concatenated expectedText, which is the
 * index space the matcher and TasmiTextFollow share.
 */

import type { AyahRange } from "../components/TasmiSessionUI";

export interface JuzukExamAyahInput {
  id: number;
  surahId: number;
  ayahNumber: number;
  textSimple: string;
}

export interface JuzukExamRoundContract {
  expectedText: string;
  ayahRanges: AyahRange[];
  surahNumber: number;
  startAyah: number;
  endAyah: number;
}

export function buildExamRound(
  ayahs: JuzukExamAyahInput[],
): JuzukExamRoundContract | null {
  if (ayahs.length === 0) return null;

  let wordOffset = 0;
  const ayahRanges: AyahRange[] = ayahs.map(ayah => {
    const wordCount = ayah.textSimple.split(/\s+/).filter(Boolean).length;
    const range: AyahRange = {
      surah: ayah.surahId,
      ayah: ayah.ayahNumber,
      startWordIndex: wordOffset,
      endWordIndex: wordOffset + wordCount - 1,
    };
    wordOffset += wordCount;
    return range;
  });

  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  return {
    expectedText: ayahs.map(ayah => ayah.textSimple).join(" "),
    ayahRanges,
    surahNumber: first.surahId,
    startAyah: first.ayahNumber,
    endAyah: last.ayahNumber,
  };
}
