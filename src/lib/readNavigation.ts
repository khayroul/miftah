import { readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
import {
  fetchReadNavigationDataset,
  type AyahNavigationRow,
} from "@/data/repositories/read/navigation";

interface LocalSurahSeedRow {
  id?: number;
  ayah_count?: number;
  name_transliteration?: string;
}

interface LocalAyahSeedRow {
  surah_id?: number;
  juz_number?: number;
  page_number?: number;
}

export interface SurahJumpTarget {
  surah: number;
  name: string;
  page: number;
  ayahCount: number;
}

export interface JuzJumpTarget {
  juz: number;
  page: number;
}

export interface ReadJumpTargets {
  surahs: SurahJumpTarget[];
  juzs: JuzJumpTarget[];
}

const LOCAL_SURAHS_PATH = path.resolve("data/seed/surahs.json");
const LOCAL_AYAT_PATH = path.resolve("data/seed/ayat.json");

function isValidPageNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 604;
}

function isValidSurahNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 114;
}

function isValidJuzNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 30;
}

function toPositiveInt(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function buildStartPageMap(
  rows: AyahNavigationRow[] | LocalAyahSeedRow[],
  key: "surah_id" | "juz_number",
): Map<number, number> {
  const startPages = new Map<number, number>();

  for (const row of rows) {
    const scopeId = toPositiveInt(
      typeof row[key] === "number" ? row[key] : null,
    );
    const pageNumber = toPositiveInt(
      typeof row.page_number === "number" ? row.page_number : null,
    );

    if (!scopeId || !isValidPageNumber(pageNumber)) {
      continue;
    }

    const current = startPages.get(scopeId);
    if (!current || pageNumber < current) {
      startPages.set(scopeId, pageNumber);
    }
  }

  return startPages;
}

function buildSurahTargets(
  surahStartPages: Map<number, number>,
  namesBySurahId: Map<number, string>,
  ayahCountsBySurahId: Map<number, number>,
): SurahJumpTarget[] {
  const targets: SurahJumpTarget[] = [];
  let carryPage = 1;

  for (let surah = 1; surah <= 114; surah += 1) {
    const page = surahStartPages.get(surah) ?? carryPage;
    carryPage = page;

    targets.push({
      surah,
      page,
      name: namesBySurahId.get(surah) ?? `Surah ${surah}`,
      ayahCount: ayahCountsBySurahId.get(surah) ?? 1,
    });
  }

  return targets;
}

function buildJuzTargets(juzStartPages: Map<number, number>): JuzJumpTarget[] {
  const targets: JuzJumpTarget[] = [];
  let carryPage = 1;

  for (let juz = 1; juz <= 30; juz += 1) {
    const page = juzStartPages.get(juz) ?? carryPage;
    carryPage = page;

    targets.push({ juz, page });
  }

  return targets;
}

async function buildTargetsFromSupabase(): Promise<ReadJumpTargets> {
  const dataset = await fetchReadNavigationDataset();

  const namesBySurahId = new Map<number, string>();
  const ayahCountsBySurahId = new Map<number, number>();
  for (const row of dataset.surahs) {
    if (
      Number.isInteger(row.id) &&
      typeof row.name_transliteration === "string" &&
      row.name_transliteration.trim().length > 0
    ) {
      namesBySurahId.set(row.id, row.name_transliteration.trim());
    }
    if (Number.isInteger(row.ayah_count) && row.ayah_count > 0) {
      ayahCountsBySurahId.set(row.id, row.ayah_count);
    }
  }

  const surahStartPages = buildStartPageMap(dataset.ayat, "surah_id");
  const juzStartPages = buildStartPageMap(dataset.ayat, "juz_number");

  if (surahStartPages.size === 0 || juzStartPages.size === 0) {
    throw new Error("Navigation mapping is empty from Supabase.");
  }

  return {
    surahs: buildSurahTargets(
      surahStartPages,
      namesBySurahId,
      ayahCountsBySurahId,
    ),
    juzs: buildJuzTargets(juzStartPages),
  };
}

async function buildTargetsFromLocalSeed(): Promise<ReadJumpTargets> {
  const [surahRaw, ayahRaw] = await Promise.all([
    readFile(LOCAL_SURAHS_PATH, "utf-8"),
    readFile(LOCAL_AYAT_PATH, "utf-8"),
  ]);

  const parsedSurahs = JSON.parse(surahRaw) as LocalSurahSeedRow[];
  const parsedAyat = JSON.parse(ayahRaw) as LocalAyahSeedRow[];

  const namesBySurahId = new Map<number, string>();
  const ayahCountsBySurahId = new Map<number, number>();
  for (const row of parsedSurahs) {
    const surahId = toPositiveInt(typeof row.id === "number" ? row.id : null);
    if (
      isValidSurahNumber(surahId) &&
      typeof row.name_transliteration === "string" &&
      row.name_transliteration.trim().length > 0
    ) {
      namesBySurahId.set(surahId, row.name_transliteration.trim());
    }
    if (
      isValidSurahNumber(surahId) &&
      typeof row.ayah_count === "number" &&
      Number.isInteger(row.ayah_count) &&
      row.ayah_count > 0
    ) {
      ayahCountsBySurahId.set(surahId, row.ayah_count);
    }
  }

  const surahStartPages = buildStartPageMap(parsedAyat, "surah_id");
  const juzStartPages = buildStartPageMap(parsedAyat, "juz_number");

  return {
    surahs: buildSurahTargets(
      surahStartPages,
      namesBySurahId,
      ayahCountsBySurahId,
    ),
    juzs: buildJuzTargets(juzStartPages),
  };
}

export const getReadJumpTargets = unstable_cache(
  async (): Promise<ReadJumpTargets> => {
    try {
      return await buildTargetsFromLocalSeed();
    } catch {
      return buildTargetsFromSupabase();
    }
  },
  ["read-jump-targets-v2"],
  { revalidate: 3600, tags: ["read-navigation"] },
);

export function parseReadPage(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!isValidPageNumber(parsed)) {
    return null;
  }
  return parsed;
}

export function parseReadSurah(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const [surah] = value.split(":");
  const parsed = Number.parseInt(surah, 10);
  if (!isValidSurahNumber(parsed)) {
    return null;
  }
  return parsed;
}

export function parseReadJuz(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!isValidJuzNumber(parsed)) {
    return null;
  }
  return parsed;
}
