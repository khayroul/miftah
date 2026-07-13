import { notFound } from "next/navigation";

import { ModeNavigator } from "@/features/read";
import { TemaDataFetcher } from "@/features/tema";
import { getSurah, getSurahs } from "@/lib/queries";
import type { Surah } from "@/shared/types/database";

interface SurahThemeAppearancePageProps {
  params: Promise<{ surah: string }>;
}

function parseSurahNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 114) {
    return null;
  }
  return parsed;
}

export default async function SurahThemeAppearancePage({
  params,
}: SurahThemeAppearancePageProps) {
  const { surah } = await params;
  const surahNumber = parseSurahNumber(surah);

  if (!surahNumber) {
    notFound();
  }

  let surahMeta: Surah;
  let allSurahs: Surah[];
  try {
    [surahMeta, allSurahs] = await Promise.all([
      getSurah(surahNumber),
      getSurahs(),
    ]);
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

      <TemaDataFetcher
        surahNumber={surahNumber}
        surahMeta={surahMeta}
        allSurahs={allSurahs}
      />
    </main>
  );
}
