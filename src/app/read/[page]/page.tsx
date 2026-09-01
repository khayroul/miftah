import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  LightweightBreadcrumb,
  ReadAudioProvider,
  ReadPageWorkspace,
} from "@/features/read";
import { getReadPageStaticData } from "@/features/read/server";
import { parseReadPage } from "@/lib/readNavigation";
import { z } from "zod";

interface ReadPageProps {
  params: Promise<{ page: string }>;
  searchParams: Promise<{
    mode?: string;
    from?: string;
    cue?: string;
    intent?: string;
    flow?: string;
    qi?: string;
    view?: string;
    surah?: string;
    startAyah?: string;
    endAyah?: string;
    startPage?: string;
    endPage?: string;
  }>;
}

const freePracticePassageSchema = z
  .object({
    surah: z.coerce.number().int().min(1).max(114),
    startAyah: z.coerce.number().int().min(1).max(286),
    endAyah: z.coerce.number().int().min(1).max(286),
    startPage: z.coerce.number().int().min(1).max(604),
    endPage: z.coerce.number().int().min(1).max(604),
  })
  .refine(
    (value) =>
      value.endAyah >= value.startAyah &&
      value.endPage >= value.startPage,
  );

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

  const [tNav, t] = await Promise.all([
    getTranslations("nav"),
    getTranslations("read.page"),
  ]);
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
  const parsedFreePracticePassage = freePracticePassageSchema.safeParse({
    surah: query.surah,
    startAyah: query.startAyah,
    endAyah: query.endAyah,
    startPage: query.startPage,
    endPage: query.endPage,
  });
  const freePracticePassage = parsedFreePracticePassage.success
    ? parsedFreePracticePassage.data
    : null;
  const initialHifzPracticeView =
    query.view === "mushaf"
      ? ("mushaf" as const)
      : query.view === "ayah"
        ? ("ayah" as const)
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
  if (initialHifzPracticeView) {
    preservedHifzParams.set("view", initialHifzPracticeView);
  }
  if (freePracticePassage) {
    preservedHifzParams.set("surah", String(freePracticePassage.surah));
    preservedHifzParams.set("startAyah", String(freePracticePassage.startAyah));
    preservedHifzParams.set("endAyah", String(freePracticePassage.endAyah));
    preservedHifzParams.set("startPage", String(freePracticePassage.startPage));
    preservedHifzParams.set("endPage", String(freePracticePassage.endPage));
  }
  const hifzNavigationSearch = preservedHifzParams.toString() || null;
  const fromHifzFlow =
    hifzFlow !== null || query.from === "dashboard" || query.from === "hifz";
  const breadcrumbItems = fromHifzFlow
    ? [
        { href: "/", label: tNav("home") },
        { href: "/hifz", label: tNav("hifz") },
        { label: t("breadcrumbMushaf", { page: pageNumber }) },
      ]
    : [
        { href: "/", label: tNav("home") },
        { label: t("breadcrumbRead", { page: pageNumber }) },
      ];

  return (
    <>
      <FontPreloadLinks
        pageNumber={pageNumber}
        preloadSurahNameFont={preloadSurahNameFont}
      />
      <ReadAudioProvider>
        <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:gap-6 sm:px-6 lg:py-12">
          <ReadPageWorkspace
            pageNumber={pageNumber}
            mushafHeader={
              <div className="mt-1 flex flex-col items-center justify-center gap-1.5 text-center sm:mt-2 sm:gap-2">
                <LightweightBreadcrumb items={breadcrumbItems} />
                {hifzFlow === "memorize" ? (
                  <div className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
                    {t("badgeNewMemorize")}
                  </div>
                ) : hifzFlow === "review" ? (
                  <div className="inline-flex items-center rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-xs font-semibold tracking-wide text-teal-900 dark:border-teal-700/50 dark:bg-teal-900/30 dark:text-teal-100">
                    {t("badgeReviewMemorize")}
                  </div>
                ) : hifzExercise === "tebuk" ? (
                  <div className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-xs font-semibold tracking-wide text-purple-900 dark:border-purple-700/50 dark:bg-purple-900/30 dark:text-purple-100">
                    {t("badgeTebuk")}
                  </div>
                ) : hifzExercise === "unveil" ? (
                  <div className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold tracking-wide text-rose-900 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-100">
                    {t("badgeUnveil")}
                  </div>
                ) : hifzIntent === "new" ? (
                  <div className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
                    {t("badgeNewSabak")}
                  </div>
                ) : null}
                {!hifzFlow && hifzIntent === "new" ? (
                  <div className="w-full max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-700/45 dark:bg-amber-900/20 dark:text-amber-100">
                    <p className="font-semibold">
                      {t("newFlowEyebrow")}
                    </p>
                    <p className="mt-1">
                      {t("newFlowDescription")}
                    </p>
                  </div>
                ) : !hifzFlow && hifzIntent === "test" ? (
                  <div className="w-full max-w-2xl rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-left text-sm text-indigo-900 dark:border-indigo-700/45 dark:bg-indigo-900/20 dark:text-indigo-100">
                    <p className="font-semibold">
                      {t("reviewFlowEyebrow")}
                    </p>
                    <p className="mt-1">
                      {t("reviewFlowDescription")}
                    </p>
                  </div>
                ) : null}
                <h1 className="flex flex-wrap items-center justify-center gap-2 text-[1.75rem] font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:gap-3 sm:text-3xl">
                  {t("surahPrefix")} {pageData.surahMeta?.name_en ?? "Al-Fatihah"}
                  {pageData.surahMeta?.name_arabic && (
                    <span className="font-arabic mt-0.5 text-[1.65rem] font-normal opacity-80 sm:mt-1 sm:text-2xl" lang="ar">
                      {pageData.surahMeta.name_arabic}
                    </span>
                  )}
                </h1>
                <p className="text-sm font-medium text-stone-500 sm:text-base dark:text-stone-400">
                  {t("subtitle", { surah: pageData.themeSurahId, page: pageNumber })}
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
            hifzFreePractice={hifzIntent === "test"}
            hifzExercise={hifzExercise}
            hifzNavigationSearch={hifzNavigationSearch}
            initialHifzPracticeView={initialHifzPracticeView}
            personalizationPageNumber={pageNumber}
          />
        </main>
      </ReadAudioProvider>
    </>
  );
}
