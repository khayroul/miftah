import { notFound } from "next/navigation";
import {
  LightweightBreadcrumb,
  ReadAudioProvider,
  ReadPageWorkspace,
} from "@/features/read";
import { getReadPageStaticData } from "@/features/read/server";
import { parseReadPage } from "@/lib/readNavigation";

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

function FontPreloadLinks({
  pageNumber,
  preloadSurahNameFont,
}: {
  pageNumber: number;
  preloadSurahNameFont: boolean;
}) {
  return (
    <>
      <link rel="preload" href={`/fonts/qcf-v2-woff2/p${pageNumber}.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />
      {preloadSurahNameFont ? (
        <link rel="preload" href="/fonts/sura_names.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      ) : null}
    </>
  );
}

export default async function ReadPage({ params, searchParams }: ReadPageProps) {
  const { page } = await params;
  const query = await searchParams;
  const pageNumber = parseReadPage(page);

  if (!pageNumber) {
    notFound();
  }

  const pageData = await getReadPageStaticData(pageNumber);
  const preloadSurahNameFont = pageData.layout.lines.some(
    (line) => line.type === "surah-header",
  );
  const initialReadMode = query.mode === "hifz" ? "hifz" : null;
  const forceHifzRevealByThirds =
    query.mode === "hifz" && (query.from === "dashboard" || query.from === "hifz");
  const hifzIntent =
    query.from === "hifz" || query.from === "dashboard"
      ? query.intent === "new"
        ? "new"
        : query.intent === "test"
          ? "test"
          : null
      : null;
  const hifzFlow =
    query.flow === "memorize"
      ? ("memorize" as const)
      : query.flow === "review"
        ? ("review" as const)
        : null;
  const hifzExercise =
    query.flow === "tebuk"
      ? ("tebuk" as const)
      : query.flow === "unveil"
        ? ("unveil" as const)
        : null;
  const preservedHifzParams = new URLSearchParams();
  if (query.mode === "hifz") {
    preservedHifzParams.set("mode", "hifz");
  }
  if (query.from === "dashboard" || query.from === "hifz") {
    preservedHifzParams.set("from", query.from);
  }
  if (query.intent === "new" || query.intent === "test") {
    preservedHifzParams.set("intent", query.intent);
  }
  const hifzNavigationSearch = preservedHifzParams.toString() || null;
  const fromHifzFlow =
    hifzFlow !== null || query.from === "dashboard" || query.from === "hifz";
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

  return (
    <>
      <FontPreloadLinks
        pageNumber={pageNumber}
        preloadSurahNameFont={preloadSurahNameFont}
      />
      <ReadAudioProvider>
        <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-8">
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
                ) : hifzExercise === "tebuk" ? (
                  <div className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-xs font-semibold tracking-wide text-purple-900 dark:border-purple-700/50 dark:bg-purple-900/30 dark:text-purple-100">
                    Tebuk
                  </div>
                ) : hifzExercise === "unveil" ? (
                  <div className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold tracking-wide text-rose-900 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-100">
                    Buka Tabir
                  </div>
                ) : hifzIntent === "new" ? (
                  <div className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
                    BARU · SABAK · Mushaf terbuka
                  </div>
                ) : hifzIntent === "test" ? (
                  <div className="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-900 dark:border-indigo-700/50 dark:bg-indigo-900/30 dark:text-indigo-100">
                    UJI INGATAN · Petunjuk kata pertama
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
                  Surah {pageData.surahMeta?.name_en ?? "Al-Fatihah"}
                  {pageData.surahMeta?.name_arabic && (
                    <span className="font-arabic mt-0.5 text-[1.65rem] font-normal opacity-80 sm:mt-1 sm:text-2xl" lang="ar">
                      {pageData.surahMeta.name_arabic}
                    </span>
                  )}
                </h1>
                <p className="text-sm font-medium text-stone-500 sm:text-base dark:text-stone-400">
                  Surah {pageData.themeSurahId} • Halaman {pageNumber} / 604
                </p>
              </div>
            }
            layout={pageData.layout}
            wordTranslations={pageData.wordTranslations}
            currentSurahId={pageData.currentSurahId}
            currentJuzNumber={pageData.currentJuzNumber}
            themeSurahId={pageData.themeSurahId}
            audioTracks={pageData.audioTracks}
            ayahDetails={pageData.ayahDetails}
            memorizedAyahKeys={[]}
            readingAyahIds={pageData.ayatOnPage.map((ayah) => ayah.id)}
            initialReadMode={hifzFlow || hifzExercise ? "hifz" : initialReadMode}
            forceHifzRevealByThirds={!hifzFlow && forceHifzRevealByThirds}
            hifzFlow={hifzFlow}
            hifzExercise={hifzExercise}
            hifzNavigationSearch={hifzNavigationSearch}
            personalizationPageNumber={pageNumber}
          />
        </main>
      </ReadAudioProvider>
    </>
  );
}
