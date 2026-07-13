import surahSeedData from "../../../../data/seed/surahs.json";
import { JUZ_BOUNDARY_PAGES } from "@/features/hifz/read-runtime";
import { SURAH_PAGE_MAP } from "@/lib/pwa/surahPageMap";
import type {
  JuzJumpTarget,
  ReadJumpTargets,
  SurahJumpTarget,
} from "@/lib/readNavigation";

function buildSurahNameMap(): Map<number, string> {
  const names = new Map<number, string>();

  for (const row of surahSeedData) {
    if (
      typeof row.id !== "number" ||
      !Number.isInteger(row.id) ||
      row.id < 1 ||
      row.id > 114
    ) {
      continue;
    }

    if (
      typeof row.name_transliteration === "string" &&
      row.name_transliteration.trim().length > 0
    ) {
      names.set(row.id, row.name_transliteration.trim());
      continue;
    }

    names.set(row.id, `Surah ${row.id}`);
  }

  return names;
}

function buildFallbackSurahTargets(): SurahJumpTarget[] {
  const namesBySurahId = buildSurahNameMap();
  const targets: SurahJumpTarget[] = [];

  for (let surah = 1; surah <= 114; surah += 1) {
    const startPage = SURAH_PAGE_MAP[surah]?.startPage;
    targets.push({
      surah,
      page: typeof startPage === "number" ? startPage : 1,
      name: namesBySurahId.get(surah) ?? `Surah ${surah}`,
    });
  }

  return targets;
}

function buildFallbackJuzTargets(): JuzJumpTarget[] {
  return JUZ_BOUNDARY_PAGES.map((page, index) => ({
    juz: index + 1,
    page,
  }));
}

export const FALLBACK_READ_JUMP_TARGETS: ReadJumpTargets = {
  surahs: buildFallbackSurahTargets(),
  juzs: buildFallbackJuzTargets(),
};
