import Link from "next/link";
import { notFound } from "next/navigation";
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

function chunkTitleEn(chunk: ThemeAppearanceChunk): string {
  return chunk.label_en ?? chunk.theme?.name_en ?? "Unthemed";
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

  const rawChunkParam = Array.isArray(query.chunk) ? query.chunk[0] : query.chunk;
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
        <nav className="flex items-center justify-between text-sm text-stone-500 dark:text-stone-400">
          <Link href="/" className="hover:text-stone-900 transition dark:hover:text-stone-200">
            &larr; Utama
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href={surahMeta.page_start ? `/read/${surahMeta.page_start}` : "/read/1"}
              className="hover:text-stone-900 transition dark:hover:text-stone-200"
            >
              Page View
            </Link>
          </div>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900 hover:text-stone-800 dark:text-stone-100 flex items-center gap-3">
              Surah {surahMeta.name_en}
              <span className="font-arabic font-normal text-2xl opacity-80 mt-1">{surahMeta.name_arabic}</span>
            </h1>
            <p className="mt-1 text-stone-500 dark:text-stone-400">
              Surah {surahMeta.id} • Thematic Reading
            </p>
          </div>

          <div className="flex items-center gap-3">
            {surahNumber > 1 ? (
              <Link
                href={`/read/surah/${surahNumber - 1}/themes`}
                className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Prev Surah
              </Link>
            ) : null}
            {surahNumber < 114 ? (
              <Link
                href={`/read/surah/${surahNumber + 1}/themes`}
                className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Next Surah
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {loadError ? (
        <section className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </section>
      ) : null}

      {!loadError && chunks.length === 0 ? (
        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-center text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
          Tiada tema untuk surah ini lagi.
        </section>
      ) : null}

      {!loadError && chunks.length > 0 ? (
        <div className="flex flex-col gap-8">
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
                    Theme {selectedChunkIndex} of {chunks.length}
                  </span>
                  <h2 className="mt-2 text-2xl font-serif text-stone-900 dark:text-stone-50 md:text-3xl">
                    {chunkTitleBm(selectedChunk)}
                  </h2>
                  <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                    Ayat {rangeLabel(surahNumber, selectedChunk.start_ayah, selectedChunk.end_ayah)}
                  </p>
                </header>

                {/* Ayat List */}
                <div className="space-y-16 pb-8">
                  {selectedChunk.ayat.map((ayah) => (
                    <div key={ayah.id} className="relative group/ayah flex flex-col gap-6">
                      {/* Ayat Indicator */}
                      <div className="absolute -left-4 sm:-left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                        {ayah.ayah_number}
                      </div>

                      {/* Word by Word */}
                      {wbwByAyahId[ayah.id] && wbwByAyahId[ayah.id].length > 0 ? (
                        <div className="flex flex-wrap justify-start gap-x-1.5 gap-y-6" dir="rtl">
                          {wbwByAyahId[ayah.id].map((word) => (
                            <div
                              key={`${ayah.id}-${word.position}`}
                              className="group/word flex min-w-fit max-w-[10rem] flex-col items-center justify-start hover:bg-stone-50 dark:hover:bg-stone-800/50 rounded-lg p-2 transition-colors cursor-pointer"
                            >
                              <span className="block text-center text-[2.5rem] sm:text-5xl leading-tight text-stone-900 dark:text-stone-100 mb-3">
                                {word.text_uthmani}
                              </span>
                              <span
                                dir="ltr"
                                className="block text-center text-sm sm:text-base leading-snug text-stone-500 group-hover/word:text-stone-800 dark:text-stone-400 dark:group-hover/word:text-stone-200 transition-colors"
                              >
                                {word.translation_bm ?? word.translation_en ?? "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-right text-sm text-stone-400" dir="rtl">
                          [Data WBW belum tersedia]
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
          <nav className="sticky bottom-6 z-10 mx-auto w-full max-w-2xl mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-full border border-stone-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl shadow-xl shadow-black/5 dark:border-stone-700/80 dark:bg-stone-900/90">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {selectedChunkIndex > 1 ? (
                <Link
                  href={`/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex - 1}`}
                  className="flex flex-1 items-center justify-center rounded-full border border-stone-200 bg-stone-50 px-5 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  &larr; Prev
                </Link>
              ) : (
                <span className="flex flex-1 items-center justify-center rounded-full border border-stone-100 bg-stone-50/50 px-5 py-2 text-sm font-medium text-stone-400 dark:border-stone-800 dark:bg-stone-800/30 dark:text-stone-600">
                  &larr; Prev
                </span>
              )}
              {selectedChunkIndex < chunks.length ? (
                <Link
                  href={`/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex + 1}`}
                  className="flex flex-1 items-center justify-center rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white shadow-md transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                >
                  Next Theme &rarr;
                </Link>
              ) : (
                <span className="flex flex-1 items-center justify-center rounded-full bg-stone-100 px-5 py-2 text-sm font-medium text-stone-400 dark:bg-stone-800 dark:text-stone-600">
                  Next Theme &rarr;
                </span>
              )}
            </div>

            <form method="get" className="hidden sm:flex items-center gap-3 pr-2">
              <label className="text-sm font-medium text-stone-500 dark:text-stone-400">
                Jump to
              </label>
              <div className="flex items-center gap-2">
                <select
                  name="chunk"
                  defaultValue={String(selectedChunkIndex)}
                  className="max-w-[12rem] truncate rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                >
                  {chunks.map((chunk) => (
                    <option key={chunk.chunk_index} value={chunk.chunk_index}>
                      {chunk.chunk_index}. {chunkTitleBm(chunk)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
                >
                  Go
                </button>
              </div>
            </form>
          </nav>
        </div>
      ) : null}
    </main>
  );
}
