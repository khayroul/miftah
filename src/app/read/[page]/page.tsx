import Link from "next/link";
import { notFound } from "next/navigation";
import type { PageAudioTrack } from "@/components/PageAudioControls";
import type { MushafAyahDetail } from "@/components/MushafPageView";
import { ReadPageWorkspace } from "@/components/ReadPageWorkspace";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadPageManifest, pageImageExists } from "@/lib/mushafAssets";
import { getAyatByPage, getSurah } from "@/lib/queries";
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
  
  const surahMeta = await getSurah(surahForThemeView);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-6">
        <nav className="flex items-center justify-between text-sm text-stone-500 dark:text-stone-400">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            &larr; Utama
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-stone-900 hover:text-stone-800 dark:text-stone-100">
              Surah {surahMeta?.name_en ?? "Al-Fatihah"}
              {surahMeta?.name_arabic && (
                <span className="font-arabic mt-1 text-2xl font-normal opacity-80">
                  {surahMeta.name_arabic}
                </span>
              )}
            </h1>
            <p className="mt-1 text-stone-500 dark:text-stone-400">
              Surah {surahForThemeView} • Halaman {pageNumber} / 604
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pageNumber > 1 ? (
              <Link
                href={`/read/${pageNumber - 1}`}
                className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Prev Page
              </Link>
            ) : null}
            {pageNumber < 604 ? (
              <Link
                href={`/read/${pageNumber + 1}`}
                className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Next Page
              </Link>
            ) : null}
          </div>
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
