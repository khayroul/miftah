import type { AyahRange } from "@/features/tasmi";

interface TasmiTextAyah {
  ayahNumber: number;
  id: number;
  surahId: number;
  textSimple: string;
}

interface TasmiTextResponse {
  ayahs?: TasmiTextAyah[];
}

export interface HifzTasmiText {
  ayahRanges: AyahRange[];
  endAyah: number;
  expectedText: string;
  startAyah: number;
  surahNumber: number;
}

export async function loadHifzTasmiText(
  ayahIds: number[],
): Promise<HifzTasmiText | null> {
  const response = await fetch("/api/hifz/tasmi-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ayahIds }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as TasmiTextResponse;
  const ayahs = payload.ayahs ?? [];
  if (ayahs.length === 0) return null;

  let wordOffset = 0;
  const ayahRanges = ayahs.map((ayah) => {
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
  const last = ayahs[ayahs.length - 1] ?? first;
  return {
    ayahRanges,
    endAyah: last.ayahNumber,
    expectedText: ayahs.map((ayah) => ayah.textSimple).join(" "),
    startAyah: first.ayahNumber,
    surahNumber: first.surahId,
  };
}
