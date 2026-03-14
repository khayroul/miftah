import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ModeNavigator } from "@/components/ModeNavigator";
import { ThemePageContentAsync } from "@/components/ThemePageContentAsync";
import { getSurah } from "@/lib/queries";
import type { Surah } from "@/types/database";

interface SurahThemeAppearancePageProps {
  params: Promise<{ surah: string }>;
  searchParams: Promise<{ chunk?: string | string[]; marker?: string | string[] }>;
}

function parseSurahNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 114) {
    return null;
  }
  return parsed;
}

function ThemePageContentFallback() {
  return (
    <>
      <section
        className="rounded-2xl border border-stone-300 bg-white px-4 py-4 shadow-sm sm:px-5 dark:border-stone-600 dark:bg-stone-900"
        aria-hidden
      >
        <div className="mb-3 h-4 w-28 rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="h-11 rounded-xl bg-stone-200/90 dark:bg-stone-800/90" />
      </section>

      <section
        className="rounded-[1.9rem] border border-stone-200/85 bg-white/92 p-5 shadow-[0_28px_80px_-52px_rgba(28,25,23,0.18)] dark:border-stone-700/80 dark:bg-stone-900/88 sm:p-6"
        aria-hidden
      >
        <div className="h-5 w-32 rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="mt-4 h-9 w-3/4 rounded-2xl bg-stone-200 dark:bg-stone-800" />
        <div className="mt-3 h-4 w-40 rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="mt-6 h-48 rounded-[1.5rem] bg-stone-100 dark:bg-stone-800/80" />
      </section>
    </>
  );
}

export default async function SurahThemeAppearancePage({
  params,
  searchParams,
}: SurahThemeAppearancePageProps) {
  const { surah } = await params;
  const query = await searchParams;
  const surahNumber = parseSurahNumber(surah);

  if (!surahNumber) {
    notFound();
  }

  let surahMeta: Surah;
  try {
    surahMeta = await getSurah(surahNumber);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 md:py-12">
      <header className="flex flex-col gap-6">
        <ModeNavigator
          activeMode="tema"
          fallbackReadPage={surahMeta.page_start ?? 1}
          fallbackThemeSurahId={surahNumber}
          showUtilities
        />

        <div className="mt-2 flex flex-col items-center gap-2 text-center">
          <h1 className="flex items-center justify-center gap-3 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            Surah {surahMeta.name_en}
            <span
              className="font-arabic mt-1 text-2xl font-normal opacity-80"
              lang="ar"
            >
              {surahMeta.name_arabic}
            </span>
          </h1>

          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            Surah {surahMeta.id} &bull; Bacaan bertema
          </p>
        </div>
      </header>

      <Suspense fallback={<ThemePageContentFallback />}>
        <ThemePageContentAsync
          rawChunkParam={query.chunk}
          rawMarkerParam={query.marker}
          surahMeta={surahMeta}
          surahNumber={surahNumber}
        />
      </Suspense>
    </main>
  );
}
