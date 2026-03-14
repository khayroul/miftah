import { unstable_cache } from "next/cache";
import type { MushafAyahDetail } from "@/components/MushafPageView";
import { getPageImageClientSrc, loadPageManifest, pageImageExists } from "@/lib/mushafAssets";
import { mapAyatToPageAudioTracks, type ReadAudioTrack } from "@/lib/pageAudioTracks";
import { getAyatByPage, getSurah } from "@/lib/queries";
import { getReadJumpTargets, type ReadJumpTargets } from "@/lib/readNavigation";
import { getWordTranslationsByHitboxes } from "@/lib/wbwTranslations";
import type { Ayah, Surah } from "@/types/database";
import type { MushafPageManifest, MushafWordTranslationMap } from "@/types/mushaf";

export interface ReadPageStaticData {
  audioTracks: ReadAudioTrack[];
  ayahDetails: MushafAyahDetail[];
  ayatOnPage: Ayah[];
  currentJuzNumber: number;
  currentSurahId: number;
  fullImageSrc: string | null;
  imageAvailable: boolean;
  jumpTargets: ReadJumpTargets;
  manifest: MushafPageManifest | null;
  mobileImageSrc: string | null;
  nextPageFullImageSrc: string | null;
  nextPageMobileImageSrc: string | null;
  surahMeta: Surah | null;
  themeSurahId: number;
  thumbnailSrc: string | null;
  thumbnailAvailable: boolean;
  wordTranslations: MushafWordTranslationMap;
}

const DEFAULT_SURAH_ID = 1;
const DEFAULT_JUZ_NUMBER = 1;

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

const getCachedReadPageStaticData = unstable_cache(
  async (pageNumber: number): Promise<ReadPageStaticData> => {
    const [
      manifest,
      imageAvailable,
      thumbnailAvailable,
      mobileImageAvailable,
      nextPageMobileImageAvailable,
      jumpTargets,
      ayatOnPage,
    ] =
      await Promise.all([
        loadPageManifest(pageNumber),
        pageImageExists(pageNumber),
        pageImageExists(pageNumber, "thumb"),
        pageImageExists(pageNumber, "mobile").catch(() => false),
        pageNumber < 604
          ? pageImageExists(pageNumber + 1, "mobile").catch(() => false)
          : Promise.resolve(false),
        getReadJumpTargets(),
        getAyatByPage(pageNumber).catch(() => [] as Ayah[]),
      ]);

    const ayahDetails = toAyahDetails(ayatOnPage);
    const currentSurahId = ayatOnPage[0]?.surah_id ?? DEFAULT_SURAH_ID;
    const currentJuzNumber = ayatOnPage[0]?.juz_number ?? DEFAULT_JUZ_NUMBER;
    const themeSurahId = ayatOnPage[0]?.surah_id ?? currentSurahId;

    const [wordTranslations, surahMeta] = await Promise.all([
      manifest ? getWordTranslationsByHitboxes(manifest.words) : Promise.resolve({}),
      getSurah(themeSurahId).catch(() => null),
    ]);

    return {
      audioTracks: mapAyatToPageAudioTracks(ayatOnPage),
      ayahDetails,
      ayatOnPage,
      currentJuzNumber,
      currentSurahId,
      fullImageSrc: imageAvailable ? getPageImageClientSrc(pageNumber) : null,
      imageAvailable,
      jumpTargets,
      manifest,
      mobileImageSrc: mobileImageAvailable
        ? getPageImageClientSrc(pageNumber, "mobile")
        : null,
      nextPageFullImageSrc:
        pageNumber < 604 ? getPageImageClientSrc(pageNumber + 1) : null,
      nextPageMobileImageSrc:
        nextPageMobileImageAvailable && pageNumber < 604
          ? getPageImageClientSrc(pageNumber + 1, "mobile")
          : null,
      surahMeta,
      themeSurahId,
      thumbnailSrc: thumbnailAvailable
        ? getPageImageClientSrc(pageNumber, "thumb")
        : null,
      thumbnailAvailable,
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
