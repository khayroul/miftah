import Link from "next/link";
import { notFound } from "next/navigation";
import type { PageAudioTrack } from "@/components/PageAudioControls";
import type { MushafAyahDetail } from "@/components/MushafPageView";
import { ReadPageWorkspace } from "@/components/ReadPageWorkspace";
import { loadPageManifest, pageImageExists } from "@/lib/mushafAssets";
import { getAyatByPage } from "@/lib/queries";
import {
  getReadJumpTargets,
  parseReadPage,
  parseReadSurah,
} from "@/lib/readNavigation";
import { findMarkerForPage } from "@/lib/readNavigationUtils";
import { mapAyatToPageAudioTracks } from "@/lib/pageAudioTracks";
import { getWordTranslationsByHitboxes } from "@/lib/wbwTranslations";
import type { Ayah } from "@/types/database";

interface ReadPageProps {
  params: Promise<{ page: string }>;
}

export default async function ReadPage({ params }: ReadPageProps) {
  const { page } = await params;
  const pageNumber = parseReadPage(page);

  if (!pageNumber) {
    notFound();
  }

  const [manifest, imageAvailable, thumbnailAvailable, jumpTargets] = await Promise.all([
    loadPageManifest(pageNumber),
    pageImageExists(pageNumber),
    pageImageExists(pageNumber, "thumb"),
    getReadJumpTargets(),
  ]);

  let ayatOnPage: Ayah[] = [];
  let audioTracks: PageAudioTrack[] = [];
  let ayahDetails: MushafAyahDetail[] = [];
  try {
    ayatOnPage = await getAyatByPage(pageNumber);
    audioTracks = mapAyatToPageAudioTracks(ayatOnPage);
    ayahDetails = ayatOnPage.map((ayah) => ({
      key: `${ayah.surah_id}:${ayah.ayah_number}`,
      label: `${ayah.surah_id}:${ayah.ayah_number}`,
      textUthmani: ayah.text_uthmani,
      bm: ayah.display_bm,
      en: ayah.translation_en,
    }));
  } catch {
    ayatOnPage = [];
    audioTracks = [];
    ayahDetails = [];
  }

  const wordTranslations = manifest
    ? await getWordTranslationsByHitboxes(manifest.words)
    : {};

  const surahMarkers = jumpTargets.surahs.map((target) => ({
    id: target.surah,
    page: target.page,
  }));
  const juzMarkers = jumpTargets.juzs.map((target) => ({
    id: target.juz,
    page: target.page,
  }));

  const surahByPage = findMarkerForPage(surahMarkers, pageNumber)?.id ?? 1;
  const juzByPage = findMarkerForPage(juzMarkers, pageNumber)?.id ?? 1;
  const firstWordLocation = manifest?.words[0]?.location;
  const surahForThemeView = parseReadSurah(firstWordLocation) ?? surahByPage;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">
              Mushaf View
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">Halaman {pageNumber} / 604</p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Utama
          </Link>
        </div>
      </header>

      <ReadPageWorkspace
        pageNumber={pageNumber}
        imageAvailable={imageAvailable}
        thumbnailAvailable={thumbnailAvailable}
        manifest={manifest}
        wordTranslations={wordTranslations}
        currentSurahId={surahByPage}
        currentJuzNumber={juzByPage}
        themeSurahId={surahForThemeView}
        surahOptions={jumpTargets.surahs}
        juzOptions={jumpTargets.juzs}
        audioTracks={audioTracks}
        ayahDetails={ayahDetails}
      />
    </main>
  );
}
