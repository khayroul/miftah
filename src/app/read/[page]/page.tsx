import { notFound } from "next/navigation";
import type { MushafAyahDetail } from "@/components/MushafPageView";
import { ReadPageWorkspace } from "@/components/ReadPageWorkspace";
import { LightweightBreadcrumb } from "@/components/LightweightBreadcrumb";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthStatusButton } from "@/components/AuthStatusButton";
import { ReadPageVocabSection } from "@/components/ReadPageVocabSection";
import { getProgressByAyahIds } from "@/lib/hifz/study-progress";
import {
  buildFahamLevelProgress,
  getFahamLevelState,
  type FahamLevelProgress,
} from "@/lib/faham/levels";
import { getReadPageVocabPreview } from "@/lib/faham/repository";
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
    cue?: string;
    intent?: string;
    flow?: string;
    qi?: string;
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
  let fahamLevelProgress: FahamLevelProgress = {
    activeLevel: 1,
    activeWordLimit: 1000,
    isMaxLevel: false,
    lemmaUnlocked: false,
    maxLevel: 4,
    nextLevel: 2,
    nextWordLimit: 2000,
    unlockFoundProgress: 0,
    unlockFoundRequired: 600,
    unlockMasteredProgress: 0,
    unlockMasteredRequired: 0,
    unlockReady: false,
  };
  let pageVocabItems: Awaited<ReturnType<typeof getReadPageVocabPreview>> = [];
  let pageVocabLoadError: string | null = null;
  const user = await getOptionalAuthUser();
  const userId = user?.id;
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

  try {
    if (userId) {
      const levelState = await getFahamLevelState(userId);
      fahamLevelProgress = buildFahamLevelProgress(levelState);
    }

    pageVocabItems = await getReadPageVocabPreview({
      ayahIds: ayatOnPage.map((ayah) => ayah.id),
      limit: 6,
      userId,
      wordLimit: fahamLevelProgress.activeWordLimit,
    });
  } catch (error) {
    console.error("[read/page] Failed to load page vocab preview", error);
    pageVocabItems = [];
    pageVocabLoadError = "Perkataan fokus tak dapat dimuatkan sekarang.";
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
  const hifzFirstWordCueEnabled =
    query.mode === "hifz" && query.cue === "first-word";
  const hifzIntent =
    query.from === "hifz" || query.from === "dashboard"
      ? query.intent === "new"
        ? "new"
        : query.intent === "test"
          ? "test"
          : null
      : null;
  const hifzFlow =
    query.flow === "memorize" ? "memorize" as const
    : query.flow === "review" ? "review" as const
    : null;
  const fromHifzFlow = hifzFlow !== null || query.from === "dashboard" || query.from === "hifz";
  const breadcrumbItems = fromHifzFlow
    ? [
        { href: "/", label: "Utama" },
        { href: "/hifz", label: "Hafal" },
        { label: `Mushaf p.${pageNumber}` },
      ]
    : [
        { href: "/", label: "Utama" },
        { label: `Baca p.${pageNumber}` },
      ];
  
  const surahMeta = await getSurah(surahForThemeView);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 pt-1 sm:gap-4 sm:pt-4">
        <nav className="flex w-full items-center justify-end gap-2">
          <AuthStatusButton />
          <ThemeToggle />
        </nav>
      </header>

      <ReadPageWorkspace
        pageNumber={pageNumber}
        mushafHeader={
          <div className="mt-1 flex flex-col items-center justify-center gap-1.5 text-center sm:mt-2 sm:gap-2">
            <LightweightBreadcrumb items={breadcrumbItems} />
            {hifzFlow === "memorize" ? (
              <div className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
                Hafal Baru
              </div>
            ) : hifzFlow === "review" ? (
              <div className="inline-flex items-center rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-xs font-semibold tracking-wide text-teal-900 dark:border-teal-700/50 dark:bg-teal-900/30 dark:text-teal-100">
                Uji Hafalan
              </div>
            ) : hifzIntent === "new" ? (
              <div className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
                BARU · SABAK · Mushaf terbuka
              </div>
            ) : hifzIntent === "test" ? (
              <div className="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-900 dark:border-indigo-700/50 dark:bg-indigo-900/30 dark:text-indigo-100">
                UJI HAFALAN · Tasmi&apos; + petunjuk kata pertama
              </div>
            ) : null}
            {!hifzFlow && hifzIntent === "new" ? (
              <div className="w-full max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-700/45 dark:bg-amber-900/20 dark:text-amber-100">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  Aliran Baru
                </p>
                <p className="mt-1">
                  Lihat mushaf penuh, dengar bacaan, ulang beberapa kali, kemudian semak tanpa melihat.
                </p>
              </div>
            ) : !hifzFlow && hifzIntent === "test" ? (
              <div className="w-full max-w-2xl rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-left text-sm text-indigo-900 dark:border-indigo-700/45 dark:bg-indigo-900/20 dark:text-indigo-100">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  Aliran Uji Hafalan
                </p>
                <p className="mt-1">
                  Mulakan tanpa melihat, guna kata pembuka bila perlu, dan buka reveal 1/3 hanya jika tersangkut.
                </p>
              </div>
            ) : null}
            <h1 className="flex flex-wrap items-center justify-center gap-2 text-[1.75rem] font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:gap-3 sm:text-3xl">
              Surah {surahMeta?.name_en ?? "Al-Fatihah"}
              {surahMeta?.name_arabic && (
                <span className="font-arabic mt-0.5 text-[1.65rem] font-normal opacity-80 sm:mt-1 sm:text-2xl" lang="ar">
                  {surahMeta.name_arabic}
                </span>
              )}
            </h1>
            <p className="text-sm font-medium text-stone-500 sm:text-base dark:text-stone-400">
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
        initialReadMode={hifzFlow ? "hifz" : initialReadMode}
        forceHifzRevealByThirds={!hifzFlow && forceHifzRevealByThirds}
        hifzFirstWordCueEnabled={!hifzFlow && hifzFirstWordCueEnabled}
        hifzFlow={hifzFlow}
      />

      {!hifzFlow ? (
        <ReadPageVocabSection
          items={pageVocabItems}
          levelProgress={fahamLevelProgress}
          loadError={pageVocabLoadError}
          pageNumber={pageNumber}
        />
      ) : null}
    </main>
  );
}
