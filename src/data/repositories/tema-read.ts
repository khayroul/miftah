import { unstable_cache } from "next/cache";
import { supabase } from "@/data/supabase/browser";
import type { Theme } from "@/shared/types/database";
import {
  buildAutoChunks,
  buildBaseThemeAppearanceAyat,
  buildChunksFromAyahThemeDataset,
  buildManualChunk,
  pickAyatRange,
  selectDominantTheme,
  withChunkIndex,
} from "./tema-chunks";
import { loadSurahThemeChunkOverrides } from "./tema-overrides";
import type {
  AyahThemeBaseRow,
  AyahThemeChunkDatasetRow,
  AyahThemeLinkRow,
  ThemeAppearanceAyah,
  ThemeAppearanceChunk,
  ThemeAppearanceChunkSeed,
} from "./tema-types";

async function getThemesByIds(themeIds: number[]): Promise<Map<number, Theme>> {
  if (themeIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("themes")
    .select(
      "id, name_bm, name_en, category, description_bm, description_en, parent_id",
    )
    .in("id", themeIds);

  if (error) throw error;

  const themeMap = new Map<number, Theme>();
  for (const theme of (data ?? []) as Theme[]) {
    themeMap.set(theme.id, theme);
  }
  return themeMap;
}

async function fetchThemeAppearanceChunksBySurah(
  surahId: number,
): Promise<ThemeAppearanceChunk[]> {
  const { data, error: ayatError } = await supabase
    .from("ayat")
    .select("id, surah_id, ayah_number, text_uthmani, display_bm, translation_en, page_number")
    .eq("surah_id", surahId)
    .order("ayah_number");

  if (ayatError) throw ayatError;
  const ayatRows = (data ?? []) as AyahThemeBaseRow[];
  if (ayatRows.length === 0) return [];

  const themedAyat = buildBaseThemeAppearanceAyat(ayatRows);
  const lastAyahNumber = ayatRows[ayatRows.length - 1].ayah_number;
  const overrides = await loadSurahThemeChunkOverrides(surahId, lastAyahNumber);

  const { data: datasetChunks, error: datasetError } = await supabase
    .from("ayah_theme_chunks")
    .select("id, surah_id, ayah_from, ayah_to, theme, theme_bm")
    .eq("surah_id", surahId)
    .order("ayah_from")
    .order("ayah_to");

  if (datasetError) {
    const message = String(datasetError.message ?? "").toLowerCase();
    if (!message.includes("does not exist")) {
      throw datasetError;
    }
  } else if ((datasetChunks ?? []).length > 0) {
    return buildChunksFromAyahThemeDataset(
      themedAyat,
      (datasetChunks ?? []) as AyahThemeChunkDatasetRow[],
      overrides,
    );
  }

  const ayahIds = ayatRows.map((row) => row.id);
  const { data: themeLinks, error: themeError } = await supabase
    .from("theme_ayat")
    .select("ayah_id, relevance, theme:themes(id, name_bm, name_en, category, description_bm, description_en, parent_id)")
    .in("ayah_id", ayahIds);

  if (themeError) throw themeError;

  const linksByAyah = new Map<number, AyahThemeLinkRow[]>();
  for (const rawLink of (themeLinks ?? []) as AyahThemeLinkRow[]) {
    const links = linksByAyah.get(rawLink.ayah_id) ?? [];
    links.push(rawLink);
    linksByAyah.set(rawLink.ayah_id, links);
  }

  const themedAyatWithFallbackThemes: ThemeAppearanceAyah[] = ayatRows.map((ayah) => {
    const selectedTheme = selectDominantTheme(linksByAyah.get(ayah.id) ?? []);
    return {
      id: ayah.id,
      surah_id: ayah.surah_id,
      ayah_number: ayah.ayah_number,
      text_uthmani: ayah.text_uthmani,
      display_bm: ayah.display_bm,
      translation_en: ayah.translation_en ?? null,
      page_number: ayah.page_number,
      theme: selectedTheme.theme,
      theme_relevance: selectedTheme.relevance,
    };
  });

  const firstAyah = themedAyatWithFallbackThemes[0];
  const lastAyah = themedAyatWithFallbackThemes[themedAyatWithFallbackThemes.length - 1];
  if (overrides.length === 0) {
    return withChunkIndex(buildAutoChunks(themedAyatWithFallbackThemes));
  }

  const manualThemeIds = Array.from(
    new Set(
      overrides
        .map((override) => override.theme_id)
        .filter((id): id is number => id !== null),
    ),
  );
  const manualThemeMap = await getThemesByIds(manualThemeIds);

  const chunks: ThemeAppearanceChunkSeed[] = [];
  let cursorAyah = firstAyah.ayah_number;
  for (const override of overrides) {
    if (cursorAyah < override.start_ayah) {
      const autoAyat = pickAyatRange(
        themedAyatWithFallbackThemes,
        cursorAyah,
        override.start_ayah - 1,
      );
      chunks.push(...buildAutoChunks(autoAyat));
    }

    const manualAyat = pickAyatRange(
      themedAyatWithFallbackThemes,
      override.start_ayah,
      override.end_ayah,
    );
    const manualChunk = buildManualChunk(override, manualAyat, manualThemeMap);
    if (manualChunk) chunks.push(manualChunk);
    cursorAyah = override.end_ayah + 1;
  }

  if (cursorAyah <= lastAyah.ayah_number) {
    const trailingAutoAyat = pickAyatRange(
      themedAyatWithFallbackThemes,
      cursorAyah,
      lastAyah.ayah_number,
    );
    chunks.push(...buildAutoChunks(trailingAutoAyat));
  }
  return withChunkIndex(chunks);
}

const getCachedThemeAppearanceChunksBySurah = unstable_cache(
  async (surahId: number) => fetchThemeAppearanceChunksBySurah(surahId),
  ["theme-appearance-chunks-by-surah"],
  {
    revalidate: 3600,
    tags: ["theme-appearance-chunks-by-surah"],
  },
);

export async function getThemeAppearanceChunksBySurah(
  surahId: number,
): Promise<ThemeAppearanceChunk[]> {
  return getCachedThemeAppearanceChunksBySurah(surahId);
}
