import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabase } from "./supabase";
import type { Surah, Ayah, Theme } from "@/types/database";

/**
 * Fetch all 114 surahs ordered by id.
 */
export async function getSurahs(): Promise<Surah[]> {
  const { data, error } = await supabase
    .from("surahs")
    .select("*")
    .order("id");
  if (error) throw error;
  return data;
}

/**
 * Fetch a single surah by id.
 */
export async function getSurah(id: number): Promise<Surah> {
  const { data, error } = await supabase
    .from("surahs")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch all ayat for a surah.
 */
export async function getAyatBySurah(surahId: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("surah_id", surahId)
    .order("ayah_number");
  if (error) throw error;
  return data;
}

/**
 * Fetch all ayat for a given page number.
 */
export async function getAyatByPage(pageNumber: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("page_number", pageNumber)
    .order("surah_id")
    .order("ayah_number");
  if (error) throw error;
  return data;
}

/**
 * Fetch a single ayah by surah and ayah number.
 */
export async function getAyah(
  surahId: number,
  ayahNumber: number,
): Promise<Ayah> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("surah_id", surahId)
    .eq("ayah_number", ayahNumber)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch word occurrences for an ayah with word details.
 */
export async function getWordsForAyah(ayahId: number) {
  const { data, error } = await supabase
    .from("word_occurrences")
    .select("*, words(*)")
    .eq("ayah_id", ayahId)
    .order("position");
  if (error) throw error;
  return data;
}

export interface ThemeAppearanceAyah {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  display_bm: string | null;
  page_number: number;
  theme: Theme | null;
  theme_relevance: "primary" | "secondary" | null;
}

export interface ThemeAppearanceChunk {
  chunk_index: number;
  surah_id: number;
  start_ayah: number;
  end_ayah: number;
  ayah_count: number;
  theme: Theme | null;
  label_bm: string | null;
  label_en: string | null;
  source: "auto" | "manual";
  ayat: ThemeAppearanceAyah[];
}

interface ThemeAppearanceChunkSeed {
  surah_id: number;
  start_ayah: number;
  end_ayah: number;
  ayah_count: number;
  theme: Theme | null;
  label_bm: string | null;
  label_en: string | null;
  source: "auto" | "manual";
  ayat: ThemeAppearanceAyah[];
}

interface ThemeChunkOverride {
  start_ayah: number;
  end_ayah: number;
  theme_id: number | null;
  label_bm: string | null;
  label_en: string | null;
}

interface AyahThemeLinkRow {
  ayah_id: number;
  relevance: "primary" | "secondary" | null;
  theme: Theme | Theme[] | null;
}

interface AyahThemeBaseRow {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  display_bm: string | null;
  page_number: number;
}

interface AyahThemeChunkDatasetRow {
  id: number;
  surah_id: number;
  ayah_from: number;
  ayah_to: number;
  theme: string;
  theme_bm: string | null;
}

const THEME_CHUNK_OVERRIDES_PATH = path.resolve(
  "data/theme_chunk_overrides.json",
);

let themeChunkOverridesCachePromise: Promise<Record<string, unknown[]>> | null =
  null;

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
  if (relevance === "primary") {
    return 0;
  }
  if (relevance === "secondary") {
    return 1;
  }
  return 2;
}

function selectDominantTheme(links: AyahThemeLinkRow[]): {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return parsePositiveInt(value);
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseThemeChunkOverride(
  value: unknown,
  maxAyah: number,
): ThemeChunkOverride | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const startAyah = parsePositiveInt(record.start_ayah);
  const rawEndAyah = parsePositiveInt(record.end_ayah);
  if (!startAyah || !rawEndAyah) {
    return null;
  }
  if (startAyah > maxAyah) {
    return null;
  }

  const endAyah = Math.min(rawEndAyah, maxAyah);
  if (startAyah > endAyah) {
    return null;
  }

  return {
    start_ayah: startAyah,
    end_ayah: endAyah,
    theme_id: parseOptionalInt(record.theme_id),
    label_bm: parseOptionalString(record.label_bm),
    label_en: parseOptionalString(record.label_en),
  };
}

function normalizeSurahOverrides(
  rawOverrides: unknown[] | undefined,
  maxAyah: number,
): ThemeChunkOverride[] {
  if (!rawOverrides || rawOverrides.length === 0) {
    return [];
  }

  const parsed = rawOverrides
    .map((item) => parseThemeChunkOverride(item, maxAyah))
    .filter((item): item is ThemeChunkOverride => item !== null)
    .sort((a, b) => {
      if (a.start_ayah !== b.start_ayah) {
        return a.start_ayah - b.start_ayah;
      }
      return a.end_ayah - b.end_ayah;
    });

  const deduped: ThemeChunkOverride[] = [];
  let previousEndAyah = 0;
  for (const override of parsed) {
    if (override.start_ayah <= previousEndAyah) {
      continue;
    }
    deduped.push(override);
    previousEndAyah = override.end_ayah;
  }
  return deduped;
}

async function loadThemeChunkOverridesMap(): Promise<Record<string, unknown[]>> {
  if (!themeChunkOverridesCachePromise) {
    themeChunkOverridesCachePromise = (async () => {
      try {
        const raw = await readFile(THEME_CHUNK_OVERRIDES_PATH, "utf-8");
        const parsed: unknown = JSON.parse(raw);
        const record = asRecord(parsed);
        if (!record) {
          return {};
        }

        const normalized: Record<string, unknown[]> = {};
        for (const [key, value] of Object.entries(record)) {
          if (Array.isArray(value)) {
            normalized[key] = value;
          }
        }
        return normalized;
      } catch {
        return {};
      }
    })();
  }
  return themeChunkOverridesCachePromise;
}

async function loadSurahThemeChunkOverrides(
  surahId: number,
  maxAyah: number,
): Promise<ThemeChunkOverride[]> {
  const overrideMap = await loadThemeChunkOverridesMap();
  const surahOverrides = overrideMap[String(surahId)];
  return normalizeSurahOverrides(surahOverrides, maxAyah);
}

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

  if (error) {
    throw error;
  }

  const themeRows = (data ?? []) as Theme[];
  const themeMap = new Map<number, Theme>();
  for (const theme of themeRows) {
    themeMap.set(theme.id, theme);
  }
  return themeMap;
}

function buildAutoChunks(ayat: ThemeAppearanceAyah[]): ThemeAppearanceChunkSeed[] {
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

function buildBaseThemeAppearanceAyat(
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

function buildChunksFromAyahThemeDataset(
  themedAyat: ThemeAppearanceAyah[],
  datasetRows: AyahThemeChunkDatasetRow[],
): ThemeAppearanceChunk[] {
  if (themedAyat.length === 0) {
    return [];
  }

  const chunks: ThemeAppearanceChunkSeed[] = [];
  const firstAyah = themedAyat[0].ayah_number;
  const lastAyah = themedAyat[themedAyat.length - 1].ayah_number;
  let cursorAyah = firstAyah;

  const pushUnthemedGapChunk = (startAyah: number, endAyah: number): void => {
    const ayat = pickAyatRange(themedAyat, startAyah, endAyah);
    if (ayat.length === 0) {
      return;
    }

    chunks.push({
      surah_id: ayat[0].surah_id,
      start_ayah: ayat[0].ayah_number,
      end_ayah: ayat[ayat.length - 1].ayah_number,
      ayah_count: ayat.length,
      theme: null,
      label_bm: null,
      label_en: null,
      source: "auto",
      ayat,
    });
  };

  for (const row of datasetRows) {
    const boundedStartAyah = Math.max(row.ayah_from, firstAyah);
    const boundedEndAyah = Math.min(row.ayah_to, lastAyah);
    if (boundedStartAyah > boundedEndAyah) {
      continue;
    }

    const startAyah = Math.max(boundedStartAyah, cursorAyah);
    if (startAyah > boundedEndAyah) {
      continue;
    }

    if (cursorAyah < startAyah) {
      pushUnthemedGapChunk(cursorAyah, startAyah - 1);
    }

    const ayat = pickAyatRange(themedAyat, startAyah, boundedEndAyah);
    if (ayat.length === 0) {
      continue;
    }

    chunks.push({
      surah_id: ayat[0].surah_id,
      start_ayah: ayat[0].ayah_number,
      end_ayah: ayat[ayat.length - 1].ayah_number,
      ayah_count: ayat.length,
      theme: null,
      label_bm: row.theme_bm ?? null,
      label_en: row.theme,
      source: "auto",
      ayat,
    });

    cursorAyah = boundedEndAyah + 1;
    if (cursorAyah > lastAyah) {
      break;
    }
  }

  if (cursorAyah <= lastAyah) {
    pushUnthemedGapChunk(cursorAyah, lastAyah);
  }

  return withChunkIndex(chunks);
}

function pickAyatRange(
  allAyat: ThemeAppearanceAyah[],
  startAyah: number,
  endAyah: number,
): ThemeAppearanceAyah[] {
  return allAyat.filter(
    (ayah) => ayah.ayah_number >= startAyah && ayah.ayah_number <= endAyah,
  );
}

function buildManualChunk(
  override: ThemeChunkOverride,
  ayat: ThemeAppearanceAyah[],
  themeMap: Map<number, Theme>,
): ThemeAppearanceChunkSeed | null {
  if (ayat.length === 0) {
    return null;
  }

  const theme = override.theme_id ? themeMap.get(override.theme_id) ?? null : null;
  const labelBm = override.label_bm ?? (theme ? null : "Chunk Manual");
  const labelEn = override.label_en ?? (theme ? null : "Manual Chunk");

  return {
    surah_id: ayat[0].surah_id,
    start_ayah: ayat[0].ayah_number,
    end_ayah: ayat[ayat.length - 1].ayah_number,
    ayah_count: ayat.length,
    theme,
    label_bm: labelBm,
    label_en: labelEn,
    source: "manual",
    ayat,
  };
}

function withChunkIndex(
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
    source: chunk.source,
    ayat: chunk.ayat,
  }));
}

/**
 * Group ayat in a surah into contiguous "theme appearance" chunks.
 * Chunk boundary changes whenever the selected dominant theme changes.
 */
export async function getThemeAppearanceChunksBySurah(
  surahId: number,
): Promise<ThemeAppearanceChunk[]> {
  const { data, error: ayatError } = await supabase
    .from("ayat")
    .select("id, surah_id, ayah_number, text_uthmani, display_bm, page_number")
    .eq("surah_id", surahId)
    .order("ayah_number");

  if (ayatError) throw ayatError;
  const ayatRows = (data ?? []) as AyahThemeBaseRow[];
  if (ayatRows.length === 0) {
    return [];
  }

  const themedAyat = buildBaseThemeAppearanceAyat(ayatRows);

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
    const links = linksByAyah.get(ayah.id) ?? [];
    const selectedTheme = selectDominantTheme(links);

    return {
      id: ayah.id,
      surah_id: ayah.surah_id,
      ayah_number: ayah.ayah_number,
      text_uthmani: ayah.text_uthmani,
      display_bm: ayah.display_bm,
      page_number: ayah.page_number,
      theme: selectedTheme.theme,
      theme_relevance: selectedTheme.relevance,
    };
  });

  const firstAyah = themedAyatWithFallbackThemes[0];
  const lastAyah = themedAyatWithFallbackThemes[themedAyatWithFallbackThemes.length - 1];
  const overrides = await loadSurahThemeChunkOverrides(surahId, lastAyah.ayah_number);
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
    if (manualChunk) {
      chunks.push(manualChunk);
    }

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
