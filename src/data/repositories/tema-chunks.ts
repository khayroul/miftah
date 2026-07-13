import type { Theme } from "@/shared/types/database";
import type {
  AyahThemeBaseRow,
  AyahThemeChunkDatasetRow,
  AyahThemeLinkRow,
  ThemeAppearanceAyah,
  ThemeAppearanceChunk,
  ThemeAppearanceChunkSeed,
  ThemeChunkContentKey,
  ThemeChunkOverride,
} from "./tema-types";

function normalizeTheme(themeValue: Theme | Theme[] | null): Theme | null {
  if (!themeValue) {
    return null;
  }
  if (Array.isArray(themeValue)) {
    return themeValue[0] ?? null;
  }
  return themeValue;
}

function relevanceScore(
  relevance: "primary" | "secondary" | null,
): number {
  if (relevance === "primary") return 0;
  if (relevance === "secondary") return 1;
  return 2;
}

export function selectDominantTheme(links: AyahThemeLinkRow[]): {
  theme: Theme | null;
  relevance: "primary" | "secondary" | null;
} {
  const normalized = links
    .map((link) => ({
      theme: normalizeTheme(link.theme),
      relevance: link.relevance,
    }))
    .filter(
      (
        item,
      ): item is { theme: Theme; relevance: "primary" | "secondary" | null } =>
        item.theme !== null,
    )
    .sort((a, b) => {
      const relevanceDiff = relevanceScore(a.relevance) - relevanceScore(b.relevance);
      if (relevanceDiff !== 0) {
        return relevanceDiff;
      }
      return a.theme.id - b.theme.id;
    });

  const first = normalized[0];
  if (!first) {
    return { theme: null, relevance: null };
  }
  return { theme: first.theme, relevance: first.relevance };
}

export function buildAutoChunks(
  ayat: ThemeAppearanceAyah[],
): ThemeAppearanceChunkSeed[] {
  const chunks: ThemeAppearanceChunkSeed[] = [];

  for (const ayah of ayat) {
    const currentChunk = chunks[chunks.length - 1];
    const ayahThemeId = ayah.theme?.id ?? null;
    const currentThemeId = currentChunk?.theme?.id ?? null;

    if (!currentChunk || ayahThemeId !== currentThemeId) {
      chunks.push({
        surah_id: ayah.surah_id,
        start_ayah: ayah.ayah_number,
        end_ayah: ayah.ayah_number,
        ayah_count: 1,
        theme: ayah.theme,
        label_bm: null,
        label_en: null,
        synopsis_bm: null,
        source: "auto",
        ayat: [ayah],
      });
      continue;
    }

    currentChunk.end_ayah = ayah.ayah_number;
    currentChunk.ayah_count += 1;
    currentChunk.ayat.push(ayah);
  }

  return chunks;
}

export function buildBaseThemeAppearanceAyat(
  ayatRows: AyahThemeBaseRow[],
): ThemeAppearanceAyah[] {
  return ayatRows.map((ayah) => ({
    id: ayah.id,
    surah_id: ayah.surah_id,
    ayah_number: ayah.ayah_number,
    text_uthmani: ayah.text_uthmani,
    display_bm: ayah.display_bm,
    page_number: ayah.page_number,
    theme: null,
    theme_relevance: null,
  }));
}

export function pickAyatRange(
  allAyat: ThemeAppearanceAyah[],
  startAyah: number,
  endAyah: number,
): ThemeAppearanceAyah[] {
  return allAyat.filter(
    (ayah) => ayah.ayah_number >= startAyah && ayah.ayah_number <= endAyah,
  );
}

export function buildChunksFromAyahThemeDataset(
  themedAyat: ThemeAppearanceAyah[],
  datasetRows: AyahThemeChunkDatasetRow[],
  overrides: ThemeChunkOverride[],
): ThemeAppearanceChunk[] {
  if (themedAyat.length === 0) return [];

  const chunks: ThemeAppearanceChunkSeed[] = [];
  const overrideMap = new Map(
    overrides.map((override) => [
      `${override.start_ayah}:${override.end_ayah}`,
      override,
    ]),
  );
  const firstAyah = themedAyat[0].ayah_number;
  const lastAyah = themedAyat[themedAyat.length - 1].ayah_number;
  let cursorAyah = firstAyah;

  const pushUnthemedGapChunk = (startAyah: number, endAyah: number): void => {
    const ayat = pickAyatRange(themedAyat, startAyah, endAyah);
    if (ayat.length === 0) return;
    chunks.push({
      surah_id: ayat[0].surah_id,
      start_ayah: ayat[0].ayah_number,
      end_ayah: ayat[ayat.length - 1].ayah_number,
      ayah_count: ayat.length,
      theme: null,
      label_bm: null,
      label_en: null,
      synopsis_bm: null,
      source: "auto",
      ayat,
    });
  };

  for (const row of datasetRows) {
    const boundedStartAyah = Math.max(row.ayah_from, firstAyah);
    const boundedEndAyah = Math.min(row.ayah_to, lastAyah);
    if (boundedStartAyah > boundedEndAyah) continue;

    const startAyah = Math.max(boundedStartAyah, cursorAyah);
    if (startAyah > boundedEndAyah) continue;
    if (cursorAyah < startAyah) {
      pushUnthemedGapChunk(cursorAyah, startAyah - 1);
    }

    const ayat = pickAyatRange(themedAyat, startAyah, boundedEndAyah);
    if (ayat.length === 0) continue;
    const override = overrideMap.get(`${row.ayah_from}:${row.ayah_to}`) ?? null;
    chunks.push({
      surah_id: ayat[0].surah_id,
      start_ayah: ayat[0].ayah_number,
      end_ayah: ayat[ayat.length - 1].ayah_number,
      ayah_count: ayat.length,
      theme: null,
      label_bm: override?.label_bm ?? row.theme_bm ?? null,
      label_en: override?.label_en ?? row.theme,
      synopsis_bm: override?.synopsis_bm ?? null,
      source: "auto",
      ayat,
    });

    cursorAyah = boundedEndAyah + 1;
    if (cursorAyah > lastAyah) break;
  }

  if (cursorAyah <= lastAyah) {
    pushUnthemedGapChunk(cursorAyah, lastAyah);
  }
  return withChunkIndex(chunks);
}

export function buildManualChunk(
  override: ThemeChunkOverride,
  ayat: ThemeAppearanceAyah[],
  themeMap: Map<number, Theme>,
): ThemeAppearanceChunkSeed | null {
  if (ayat.length === 0) return null;

  const theme = override.theme_id ? themeMap.get(override.theme_id) ?? null : null;
  return {
    surah_id: ayat[0].surah_id,
    start_ayah: ayat[0].ayah_number,
    end_ayah: ayat[ayat.length - 1].ayah_number,
    ayah_count: ayat.length,
    theme,
    label_bm: override.label_bm ?? (theme ? null : "Tema manual"),
    label_en: override.label_en ?? null,
    synopsis_bm: override.synopsis_bm,
    source: "manual",
    ayat,
  };
}

export function withChunkIndex(
  chunks: ThemeAppearanceChunkSeed[],
): ThemeAppearanceChunk[] {
  return chunks.map((chunk, index) => ({
    chunk_index: index + 1,
    surah_id: chunk.surah_id,
    start_ayah: chunk.start_ayah,
    end_ayah: chunk.end_ayah,
    ayah_count: chunk.ayah_count,
    theme: chunk.theme,
    label_bm: chunk.label_bm,
    label_en: chunk.label_en,
    synopsis_bm: chunk.synopsis_bm,
    source: chunk.source,
    ayat: chunk.ayat,
  }));
}

export function themeChunkContentKeyFromChunks(
  chunks: readonly Pick<
    ThemeAppearanceChunk,
    "chunk_index" | "surah_id" | "start_ayah" | "end_ayah"
  >[],
  chunkIndex: number,
): ThemeChunkContentKey | null {
  const chunk = chunks.find((entry) => entry.chunk_index === chunkIndex);
  if (!chunk) return null;
  return {
    surahId: chunk.surah_id,
    startAyah: chunk.start_ayah,
    endAyah: chunk.end_ayah,
  };
}
