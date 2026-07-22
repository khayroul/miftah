export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  findMarkerForPage,
  mapAyatToPageAudioTracks,
  PageAudioControls,
  ReadJumpControls,
} from "@/features/read";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getAyatByPage, getSurah } from "@/lib/queries";
import { getReadJumpTargets, parseReadPage } from "@/lib/readNavigation";

interface ReadToolsPageProps {
  params: Promise<{ page: string }>;
}

export default async function ReadToolsPage({ params }: ReadToolsPageProps) {
  const { page } = await params;
  const pageNumber = parseReadPage(page);

  if (!pageNumber) {
    notFound();
  }

  const [t, jumpTargets, ayatOnPage] = await Promise.all([
    getTranslations("read.toolsPage"),
    getReadJumpTargets(),
    getAyatByPage(pageNumber).catch(() => []),
  ]);

  const surahMarkers = jumpTargets.surahs.map((target) => ({
    id: target.surah,
    page: target.page,
  }));
  const juzMarkers = jumpTargets.juzs.map((target) => ({
    id: target.juz,
    page: target.page,
  }));

  const currentSurahId = findMarkerForPage(surahMarkers, pageNumber)?.id ?? 1;
  const currentJuzNumber = findMarkerForPage(juzMarkers, pageNumber)?.id ?? 1;
  const themeSurahId = ayatOnPage[0]?.surah_id ?? currentSurahId;
  const audioTracks = mapAyatToPageAudioTracks(ayatOnPage);
  const surahMeta = await getSurah(currentSurahId).catch(() => null);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(20,94,89,0.16),transparent_32%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.14),transparent_28%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(15,118,110,0.2),transparent_32%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.16),transparent_28%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex items-center justify-between gap-3">
          <Link
            href={`/read/${pageNumber}`}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            {t("backToMushaf")}
          </Link>
          <ThemeToggle />
        </header>

        <section className="animate-fade-in-up rounded-[30px] border border-stone-200/90 bg-white/85 p-5 shadow-[0_28px_90px_-52px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <div className="inline-flex items-center rounded-full border border-teal-900/15 bg-teal-950/6 px-3 py-1 text-xs font-medium tracking-wide text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100">
                {t("eyebrow")}
              </div>

              <div>
                <h1 className="text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
                  {t("heading")}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  {t("description")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  label={t("pageLabel")}
                  value={`p. ${pageNumber}`}
                />
                <SummaryCard
                  label={t("currentSurahLabel")}
                  value={surahMeta?.name_transliteration ?? t("surahFallbackValue", { id: currentSurahId })}
                />
                <SummaryCard
                  label={t("currentJuzLabel")}
                  value={t("juzValue", { juz: currentJuzNumber })}
                />
              </div>
            </div>

            <aside className="rounded-[26px] border border-stone-200/80 bg-stone-50/90 p-4 dark:border-stone-700 dark:bg-stone-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                {t("relatedPathsLabel")}
              </p>
              <div className="mt-4 grid gap-2">
                <Link
                  href={`/read/${pageNumber}`}
                  className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-900"
                >
                  {t("continueReadingLink")}
                </Link>
                <Link
                  href={`/read/surah/${themeSurahId}/themes`}
                  className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900 transition hover:bg-indigo-100 dark:border-indigo-700/40 dark:bg-indigo-900/25 dark:text-indigo-100 dark:hover:bg-indigo-900/40"
                >
                  {t("openThemeLink")}
                </Link>
                <Link
                  href="/faham"
                  className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-900/25 dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  {t("enterFahamLink")}
                </Link>
                <Link
                  href="/hifz"
                  className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900 transition hover:bg-teal-100 dark:border-teal-700/40 dark:bg-teal-900/25 dark:text-teal-100 dark:hover:bg-teal-900/40"
                >
                  {t("openHifzLink")}
                </Link>
              </div>
            </aside>
          </div>
        </section>

        <ReadJumpControls
          currentPage={pageNumber}
          currentSurahId={currentSurahId}
          currentJuzNumber={currentJuzNumber}
          surahOptions={jumpTargets.surahs}
          juzOptions={jumpTargets.juzs}
        />

        <PageAudioControls tracks={audioTracks} />
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        {value}
      </p>
    </div>
  );
}
