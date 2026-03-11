import Link from "next/link";
import { notFound } from "next/navigation";
import { FahamExposureTracker } from "@/components/FahamExposureTracker";
import { ModeNavigator } from "@/components/ModeNavigator";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  getWordByWordForAyahIds,
  getSurah,
  getThemeAppearanceChunksBySurah,
} from "@/lib/queries";
import type { AyahWordByWordEntry, ThemeAppearanceChunk } from "@/lib/queries";
import type { Surah } from "@/types/database";

interface SurahThemeAppearancePageProps {
  params: Promise<{ surah: string }>;
  searchParams: Promise<{ chunk?: string | string[] }>;
}

function parseSurahNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 114) {
    return null;
  }
  return parsed;
}

function rangeLabel(
  surahId: number,
  startAyah: number,
  endAyah: number,
): string {
  if (startAyah === endAyah) {
    return `${surahId}:${startAyah}`;
  }
  return `${surahId}:${startAyah}-${endAyah}`;
}

function chunkTitleBm(chunk: ThemeAppearanceChunk): string {
  return chunk.label_bm ?? chunk.theme?.name_bm ?? "Tanpa tema";
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

  let chunks: ThemeAppearanceChunk[] = [];
  let loadError: string | null = null;
  try {
    chunks = await getThemeAppearanceChunksBySurah(surahNumber);
  } catch {
    loadError =
      "Data tema belum dapat dimuat sekarang. Sila semak sambungan Supabase dan cuba semula.";
  }

  const rawChunkParam = Array.isArray(query.chunk)
    ? query.chunk[0]
    : query.chunk;
  const parsedChunkParam = rawChunkParam
    ? Number.parseInt(rawChunkParam, 10)
    : 1;
  const selectedChunkIndex =
    chunks.length > 0
      ? Number.isInteger(parsedChunkParam)
        ? Math.min(Math.max(parsedChunkParam, 1), chunks.length)
        : 1
      : 1;
  const selectedChunk = chunks[selectedChunkIndex - 1] ?? null;
  const hasNextThemeInSurah = selectedChunkIndex < chunks.length;
  const canJumpToNextSurahTheme =
    chunks.length > 0 &&
    selectedChunkIndex === chunks.length &&
    surahNumber < 114;
  let previousThemeHref: string | null = null;
  if (chunks.length > 0) {
    if (selectedChunkIndex > 1) {
      previousThemeHref = `/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex - 1}`;
    } else if (surahNumber > 1) {
      try {
        const previousSurahChunks = await getThemeAppearanceChunksBySurah(
          surahNumber - 1,
        );
        if (previousSurahChunks.length > 0) {
          previousThemeHref = `/read/surah/${surahNumber - 1}/themes?chunk=${previousSurahChunks.length}`;
        }
      } catch {
        previousThemeHref = null;
      }
    }
  }
  const nextThemeHref = hasNextThemeInSurah
    ? `/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex + 1}`
    : canJumpToNextSurahTheme
      ? `/read/surah/${surahNumber + 1}/themes?chunk=1`
      : null;
  let wbwByAyahId: Record<number, AyahWordByWordEntry[]> = {};
  if (selectedChunk) {
    try {
      wbwByAyahId = await getWordByWordForAyahIds(
        selectedChunk.ayat.map((ayah) => ayah.id),
      );
    } catch {
      wbwByAyahId = {};
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 md:py-12">
      {/* Refined Header */}
      <header className="flex flex-col gap-6">
        <nav className="flex w-full items-center justify-end">
          <ThemeToggle />
        </nav>

        <ModeNavigator
          activeMode="tema"
          fallbackReadPage={surahMeta.page_start ?? 1}
          fallbackThemeSurahId={surahNumber}
        />

        <div className="flex flex-col items-center text-center gap-2 mt-2">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100 flex items-center justify-center gap-3">
            Surah {surahMeta.name_en}
            <span
              className="font-arabic font-normal text-2xl opacity-80 mt-1"
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

      {loadError ? (
        <section className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </section>
      ) : null}

      {!loadError && chunks.length === 0 ? (
        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-center text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
          Tema untuk surah ini belum tersedia lagi.
        </section>
      ) : null}

      {!loadError && chunks.length > 0 ? (
        <div className="flex flex-col gap-8">
          {selectedChunk ? (
            <FahamExposureTracker
              payload={{
                ayahIds: selectedChunk.ayat.map((ayah) => ayah.id),
                sourceType: "theme_chunk",
                surahId: surahNumber,
                themeChunkIndex: selectedChunk.chunk_index,
              }}
            />
          ) : null}

          {/* Main Content Area */}
          <section className="space-y-6">
            {selectedChunk ? (
              <article
                key={selectedChunk.chunk_index}
                id={`chunk-${selectedChunk.chunk_index}`}
                className="space-y-8 animate-in fade-in duration-500"
              >
                {/* Theme Header */}
                <header className="border-b border-stone-200 pb-4 dark:border-stone-800">
                  <span className="mb-2 inline-block rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    Tema {selectedChunkIndex} daripada {chunks.length}
                  </span>
                  <h2 className="mt-2 text-2xl font-serif text-stone-900 dark:text-stone-50 md:text-3xl">
                    {chunkTitleBm(selectedChunk)}
                  </h2>
                  <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                    Ayat{" "}
                    {rangeLabel(
                      surahNumber,
                      selectedChunk.start_ayah,
                      selectedChunk.end_ayah,
                    )}
                  </p>
                </header>

                {/* Ayat List */}
                <div className="space-y-16 pb-8">
                  {selectedChunk.ayat.map((ayah) => (
                    <div
                      key={ayah.id}
                      className="relative group/ayah flex flex-col gap-6"
                    >
                      {/* Ayat Indicator */}
                      <div className="absolute -left-4 sm:-left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                        {ayah.ayah_number}
                      </div>

                      {/* Word by Word */}
                      {wbwByAyahId[ayah.id] &&
                      wbwByAyahId[ayah.id].length > 0 ? (
                        <div
                          className="flex flex-wrap justify-start gap-x-1.5 gap-y-6"
                          dir="rtl"
                        >
                          {wbwByAyahId[ayah.id].map((word) => (
                            <div
                              key={`${ayah.id}-${word.position}`}
                              className="group/word flex min-w-fit max-w-max flex-1 flex-col items-center justify-start rounded-lg p-2 transition-colors hover:bg-stone-50 cursor-pointer dark:hover:bg-stone-800/50"
                            >
                              <span
                                className="font-arabic mb-2 block text-center text-4xl leading-[1.6] text-stone-900 sm:text-5xl dark:text-stone-100"
                                lang="ar"
                              >
                                {word.text_uthmani}
                              </span>
                              <span
                                dir="ltr"
                                className="block text-center text-xs sm:text-sm leading-snug text-stone-500 line-clamp-2 group-hover/word:text-stone-800 dark:text-stone-400 dark:group-hover/word:text-stone-200 transition-colors"
                              >
                                {word.translation_bm ??
                                  word.translation_en ??
                                  "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p
                          className="text-right text-sm text-stone-400"
                          dir="rtl"
                        >
                          [Data kata demi kata belum tersedia]
                        </p>
                      )}

                      {/* Full Translation */}
                      <div className="mt-2 pl-6 sm:pl-0">
                        <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 sm:p-5 dark:border-stone-800/80 dark:bg-stone-800/20">
                          <p className="text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                            {ayah.display_bm ?? "Terjemahan BM belum tersedia."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
          </section>

          {/* Theme Navigation Bottom Bar */}
          <nav className="sticky bottom-6 z-10 mx-auto w-fit mt-4 flex items-center justify-center gap-1 sm:gap-2 rounded-full border border-stone-200/80 bg-white/90 p-2 backdrop-blur-xl shadow-xl shadow-black/5 dark:border-stone-700/80 dark:bg-stone-900/90">
            {/* Surah Prev Button */}
            {surahNumber > 1 ? (
              <Link
                href={`/read/surah/${surahNumber - 1}/themes`}
                className="flex h-10 items-center justify-center rounded-full px-3 sm:px-4 text-xs sm:text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 whitespace-nowrap"
              >
                &laquo; Surah
              </Link>
            ) : (
              <span className="flex h-10 items-center justify-center px-3 sm:px-4 text-xs sm:text-sm font-medium opacity-0 whitespace-nowrap">
                &laquo; Surah
              </span>
            )}

            {/* Central Controls */}
            <div className="flex items-center gap-1 sm:gap-2 border-x border-stone-200/60 dark:border-stone-700/60 px-1 sm:px-2">
              {previousThemeHref ? (
                <Link
                  href={previousThemeHref}
                  className="flex h-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 px-4 text-xs sm:text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 whitespace-nowrap"
                >
                  &larr; Tema
                </Link>
              ) : (
                <span className="flex h-10 items-center justify-center rounded-full border border-stone-100 bg-stone-50/50 px-4 text-xs sm:text-sm font-medium text-stone-400 dark:border-stone-800 dark:bg-stone-800/30 dark:text-stone-600 whitespace-nowrap">
                  &larr; Tema
                </span>
              )}
              
              <form
                method="get"
                className="hidden md:flex flex-row items-center gap-1"
              >
                <select
                  name="chunk"
                  defaultValue={String(selectedChunkIndex)}
                  onChange={(e) => e.target.form?.submit()}
                  className="max-w-[12rem] h-10 truncate rounded-full border border-stone-200 bg-white px-3 pr-8 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 cursor-pointer"
                >
                  {chunks.map((chunk) => (
                    <option key={chunk.chunk_index} value={chunk.chunk_index}>
                      {chunk.chunk_index}. {chunkTitleBm(chunk)}
                    </option>
                  ))}
                </select>
              </form>
              
              {nextThemeHref ? (
                <Link
                  href={nextThemeHref}
                  className="flex h-10 items-center justify-center rounded-full bg-stone-900 px-4 text-xs sm:text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white whitespace-nowrap"
                >
                  Tema &rarr;
                </Link>
              ) : (
                <span className="flex h-10 items-center justify-center rounded-full bg-stone-100 px-4 text-xs sm:text-sm font-medium text-stone-400 dark:bg-stone-800 dark:text-stone-600 whitespace-nowrap">
                  Tamat Surah
                </span>
              )}
            </div>

            {/* Surah Next Button */}
            {surahNumber < 114 ? (
              <Link
                href={`/read/surah/${surahNumber + 1}/themes`}
                className="flex h-10 items-center justify-center rounded-full px-3 sm:px-4 text-xs sm:text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 whitespace-nowrap"
              >
                Surah &raquo;
              </Link>
            ) : (
              <span className="flex h-10 items-center justify-center px-3 sm:px-4 text-xs sm:text-sm font-medium opacity-0 whitespace-nowrap">
                Surah &raquo;
              </span>
            )}
          </nav>
        </div>
      ) : null}
    </main>
  );
}
