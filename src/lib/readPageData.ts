import { unstable_cache } from "next/cache";
import type { MushafAyahDetail } from "@/components/MushafPageView";
import { loadMushafLayout, normalizeLayoutForRender } from "@/lib/mushafLayout";
import type { MushafLayoutPage } from "@/types/mushafLayout";
import { mapAyatToPageAudioTracks, type ReadAudioTrack } from "@/lib/pageAudioTracks";
import { getAyatByPage, getSurah } from "@/lib/queries";
import { getWordTranslationsByLocation } from "@/lib/wbwTranslations";
import type { Ayah, Surah } from "@/types/database";
import type { MushafWordTranslationMap } from "@/types/mushaf";

export interface ReadPageStaticData {
  audioTracks: ReadAudioTrack[];
  ayahDetails: MushafAyahDetail[];
  ayatOnPage: Ayah[];
  currentJuzNumber: number;
  currentSurahId: number;
  layout: MushafLayoutPage;
  surahMeta: Surah | null;
  themeSurahId: number;
  wordTranslations: MushafWordTranslationMap;
}

const DEFAULT_SURAH_ID = 1;
const DEFAULT_JUZ_NUMBER = 1;

const EMPTY_LAYOUT: MushafLayoutPage = { page: 0, lines: [] };

function toAyahDetails(ayatOnPage: Ayah[]): MushafAyahDetail[] {
  return ayatOnPage.map((ayah) => ({
    id: ayah.id,
    key: `${ayah.surah_id}:${ayah.ayah_number}`,
    label: `${ayah.surah_id}:${ayah.ayah_number}`,
    textUthmani: ayah.text_uthmani,
    bm: ayah.display_bm,
    en: ayah.translation_en,
  }));
}

function loadSurahMetaSync(): Record<number, { name_ar: string; name_en: string; ayas: number }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    const xmlPath = path.join(process.cwd(), "data", "qul", "quran-data.xml");
    const xml = fs.readFileSync(xmlPath, "utf-8") as string;
    const surahs: Record<number, { name_ar: string; name_en: string; ayas: number }> = {};
    const matches = xml.matchAll(/<sura\s+([^>]+)\/>/g);
    for (const m of matches) {
      const attrs = m[1];
      const idx = attrs.match(/index="(\d+)"/)?.[1];
      const name = attrs.match(/name="([^"]+)"/)?.[1];
      const tname = attrs.match(/tname="([^"]+)"/)?.[1];
      const ayas = attrs.match(/ayas="(\d+)"/)?.[1];
      if (idx) {
        surahs[parseInt(idx)] = {
          name_ar: name || "",
          name_en: tname || "",
          ayas: parseInt(ayas || "0"),
        };
      }
    }
    return surahs;
  } catch {
    return {};
  }
}

let cachedSurahMeta: ReturnType<typeof loadSurahMetaSync> | null = null;

function getSurahMetaForLayout() {
  if (!cachedSurahMeta) {
    cachedSurahMeta = loadSurahMetaSync();
  }
  return cachedSurahMeta;
}

const getCachedReadPageStaticData = unstable_cache(
  async (pageNumber: number): Promise<ReadPageStaticData> => {
    const [rawLayout, ayatOnPage] = await Promise.all([
      loadMushafLayout(pageNumber),
      getAyatByPage(pageNumber).catch(() => [] as Ayah[]),
    ]);

    const surahMetaForLayout = getSurahMetaForLayout();
    const layout = rawLayout
      ? normalizeLayoutForRender(rawLayout, surahMetaForLayout)
      : EMPTY_LAYOUT;

    const ayahDetails = toAyahDetails(ayatOnPage);
    const currentSurahId = ayatOnPage[0]?.surah_id ?? DEFAULT_SURAH_ID;
    const currentJuzNumber = ayatOnPage[0]?.juz_number ?? DEFAULT_JUZ_NUMBER;
    const themeSurahId = ayatOnPage[0]?.surah_id ?? currentSurahId;

    // Collect word locations from layout for translation lookup
    const wordLocations: string[] = [];
    for (const line of layout.lines) {
      if (line.type === "text" && line.words) {
        for (const word of line.words) {
          wordLocations.push(word.location);
        }
      }
    }

    const [wordTranslations, surahMeta] = await Promise.all([
      wordLocations.length > 0
        ? getWordTranslationsByLocation(wordLocations)
        : Promise.resolve({}),
      getSurah(themeSurahId).catch(() => null),
    ]);

    return {
      audioTracks: mapAyatToPageAudioTracks(ayatOnPage),
      ayahDetails,
      ayatOnPage,
      currentJuzNumber,
      currentSurahId,
      layout,
      surahMeta,
      themeSurahId,
      wordTranslations,
    };
  },
  ["read-page-static-data"],
  {
    revalidate: 3600,
    tags: ["read-page-static-data"],
  },
);

export async function getReadPageStaticData(
  pageNumber: number,
): Promise<ReadPageStaticData> {
  return getCachedReadPageStaticData(pageNumber);
}
