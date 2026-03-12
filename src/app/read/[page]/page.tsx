import { notFound } from "next/navigation";
import type { MushafAyahDetail } from "@/components/MushafPageView";
import { ReadPageWorkspace } from "@/components/ReadPageWorkspace";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthStatusButton } from "@/components/AuthStatusButton";
import { getProgressByAyahIds } from "@/lib/hifz/study-progress";
import { loadPageManifest, pageImageExists } from "@/lib/mushafAssets";
import { mapAyatToPageAudioTracks } from "@/lib/pageAudioTracks";
import { getAyatByPage, getSurah } from "@/lib/queries";
import {
  getReadJumpTargets,
  parseReadPage,
} from "@/lib/readNavigation";
import { findMarkerForPage } from "@/lib/readNavigationUtils";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { getWordTranslationsByHitboxes } from "@/lib/wbwTranslations";
import type { Ayah } from "@/types/database";

interface ReadPageProps {
  params: Promise<{ page: string }>;
  searchParams: Promise<{
    mode?: string;
    from?: string;
  }>;
}

export default async function ReadPage({ params, searchParams }: ReadPageProps) {
  const { page } = await params;
  const query = await searchParams;
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
  let ayahDetails: MushafAyahDetail[] = [];
  let memorizedAyahKeys: string[] = [];
  try {
    ayatOnPage = await getAyatByPage(pageNumber);
    ayahDetails = ayatOnPage.map((ayah) => ({
      id: ayah.id,
      key: `${ayah.surah_id}:${ayah.ayah_number}`,
      label: `${ayah.surah_id}:${ayah.ayah_number}`,
      textUthmani: ayah.text_uthmani,
      bm: ayah.display_bm,
      en: ayah.translation_en,
    }));

    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (userId && ayatOnPage.length > 0) {
      try {
        const progressByAyahId = await getProgressByAyahIds(
          userId,
          ayatOnPage.map((ayah) => ayah.id),
        );
        memorizedAyahKeys = ayatOnPage.flatMap((ayah) => {
          const status = progressByAyahId.get(ayah.id)?.hifz_status;
          if (status === "sabqi" || status === "manzil") {
            return [`${ayah.surah_id}:${ayah.ayah_number}`];
          }
          return [];
        });
      } catch {
        memorizedAyahKeys = [];
      }
    }
  } catch {
    ayatOnPage = [];
    ayahDetails = [];
    memorizedAyahKeys = [];
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
  const surahForThemeView = ayatOnPage[0]?.surah_id ?? surahByPage;
  const audioTracks = mapAyatToPageAudioTracks(ayatOnPage);
  const initialReadMode = query.mode === "hifz" ? "hifz" : null;
  const forceHifzRevealByThirds =
    query.mode === "hifz" && (query.from === "dashboard" || query.from === "hifz");
  
  const surahMeta = await getSurah(surahForThemeView);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 pt-2 sm:pt-4">
        <nav className="flex w-full items-center justify-end gap-2">
          <AuthStatusButton />
          <ThemeToggle />
        </nav>
      </header>

      <ReadPageWorkspace
        pageNumber={pageNumber}
        mushafHeader={
          <div className="flex flex-col items-center justify-center gap-2 text-center mt-2">
            <h1 className="flex flex-wrap items-center justify-center gap-3 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-3xl">
              Surah {surahMeta?.name_en ?? "Al-Fatihah"}
              {surahMeta?.name_arabic && (
                <span className="font-arabic mt-1 text-2xl font-normal opacity-80" lang="ar">
                  {surahMeta.name_arabic}
                </span>
              )}
            </h1>
            <p className="text-[15px] font-medium text-stone-500 sm:text-base dark:text-stone-400">
              Surah {surahForThemeView} • Halaman {pageNumber} / 604
            </p>
          </div>
        }
        imageAvailable={imageAvailable}
        thumbnailAvailable={thumbnailAvailable}
        manifest={manifest}
        wordTranslations={wordTranslations}
        currentSurahId={surahByPage}
        currentJuzNumber={juzByPage}
        themeSurahId={surahForThemeView}
        jumpSurahOptions={jumpTargets.surahs}
        jumpJuzOptions={jumpTargets.juzs}
        audioTracks={audioTracks}
        ayahDetails={ayahDetails}
        memorizedAyahKeys={memorizedAyahKeys}
        readingAyahIds={ayatOnPage.map((ayah) => ayah.id)}
        initialReadMode={initialReadMode}
        forceHifzRevealByThirds={forceHifzRevealByThirds}
      />
    </main>
  );
}
