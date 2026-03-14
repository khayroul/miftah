import { Suspense } from "react";
import Link from "next/link";
import { FahamExposureTracker } from "@/components/FahamExposureTracker";
import { ThemeActionPanel } from "@/components/ThemeActionPanel";
import { ThemeAyahMarker } from "@/components/ThemeAyahMarker";
import { ThemeChunkAyahListAsync } from "@/components/ThemeChunkAyahListAsync";
import { ThemeChunkProgressTracker } from "@/components/ThemeChunkProgressTracker";
import { ThemeChunkSelect } from "@/components/ThemeChunkSelect";
import { ThemeJumpControls } from "@/components/ThemeJumpControls";
import { getSurahs, getThemeAppearanceChunksBySurah } from "@/lib/queries";
import { resolveThemeChunkLabelBm } from "@/lib/themeLabels";
import type { Surah } from "@/types/database";
import type { ThemeAppearanceAyah, ThemeAppearanceChunk } from "@/lib/queries";

interface ThemePageContentAsyncProps {
  rawChunkParam?: string | string[];
  surahMeta: Surah;
  surahNumber: number;
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
  return resolveThemeChunkLabelBm({
    surahId: chunk.surah_id,
    startAyah: chunk.start_ayah,
    endAyah: chunk.end_ayah,
    labelBm: chunk.label_bm,
    themeNameBm: chunk.theme?.name_bm ?? null,
  });
}

function ThemeChunkAyahListFallback({ ayat }: { ayat: ThemeAppearanceAyah[] }) {
  return (
    <div className="space-y-10 pb-8">
      {ayat.map((ayah) => (
        <div
          key={ayah.id}
          className="rounded-[1.9rem] border border-stone-200/80 bg-white/80 p-5 shadow-[0_28px_80px_-52px_rgba(28,25,23,0.16)] dark:border-stone-700/80 dark:bg-stone-900/55"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="h-3 w-28 rounded-full bg-stone-200 dark:bg-stone-800" />
                <div className="mt-3 h-4 w-44 rounded-full bg-stone-200/90 dark:bg-stone-800/90" />
              </div>
              <ThemeAyahMarker
                ayahNumber={ayah.ayah_number}
                className="shrink-0 rounded-full border border-stone-200/80 bg-white/85 px-3 py-2 dark:border-stone-700/80 dark:bg-stone-900/80"
              />
            </div>
            <div className="h-28 rounded-[1.5rem] border border-stone-200/70 bg-stone-100/90 dark:border-stone-800/80 dark:bg-stone-800/70" />
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Memuatkan paparan kata demi kata.
            </p>
            <div className="rounded-[1.4rem] border border-stone-100 bg-stone-50/50 p-4 dark:border-stone-800/80 dark:bg-stone-800/20 sm:p-5">
              <p className="text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                {ayah.display_bm ?? "Terjemahan BM belum tersedia."}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trimEnd();
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  );

  if (lastSentenceEnd >= Math.floor(maxLength * 0.6)) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }

  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 0) {
    return `${truncated.slice(0, lastSpace)}...`;
  }

  return `${truncated}...`;
}

function buildThemeSynopsis(chunk: ThemeAppearanceChunk): {
  sourceLabel: string;
  synopsis: string;
} {
  const description = chunk.theme?.description_bm?.trim();
  const title = chunkTitleBm(chunk);

  if (description) {
    return {
      sourceLabel: "deskripsi tema",
      synopsis: description,
    };
  }

  const translationSnippets = chunk.ayat
    .map((ayah) => ayah.display_bm?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);

  if (translationSnippets.length > 0) {
    const combined = translationSnippets.join(" ");
    return {
      sourceLabel: "petikan terjemahan ayat",
      synopsis: truncateText(
        `Tema ${title} muncul melalui rangkaian ayat yang menekankan: ${combined}`,
        320,
      ),
    };
  }

  return {
    sourceLabel: "tajuk chunk",
    synopsis:
      "Bahagian ini menghimpunkan ayat-ayat yang bergerak di bawah satu fokus makna yang sama. Baca ayat-ayat di bawah untuk melihat bagaimana tema ini dibina secara beransur-ansur dalam susunan surah.",
  };
}

export async function ThemePageContentAsync({
  rawChunkParam,
  surahMeta,
  surahNumber,
}: ThemePageContentAsyncProps) {
  let chunks: ThemeAppearanceChunk[] = [];
  let loadError: string | null = null;

  try {
    chunks = await getThemeAppearanceChunksBySurah(surahNumber);
  } catch {
    loadError =
      "Data tema belum dapat dimuat sekarang. Sila semak sambungan Supabase dan cuba semula.";
  }

  let surahOptions: Array<{ surah: number; nameBm: string; nameEn: string }> =
    [];

  try {
    const allSurahs = await getSurahs();
    surahOptions = allSurahs.map((item) => ({
      surah: item.id,
      nameBm: item.name_bm,
      nameEn: item.name_en,
    }));
  } catch {
    surahOptions = [
      {
        surah: surahMeta.id,
        nameBm: surahMeta.name_bm,
        nameEn: surahMeta.name_en,
      },
    ];
  }

  const chunkParamValue = Array.isArray(rawChunkParam)
    ? rawChunkParam[0]
    : rawChunkParam;
  const parsedChunkParam = chunkParamValue
    ? Number.parseInt(chunkParamValue, 10)
    : 1;
  const selectedChunkIndex =
    chunks.length > 0
      ? Number.isInteger(parsedChunkParam)
        ? Math.min(Math.max(parsedChunkParam, 1), chunks.length)
        : 1
      : 1;
  const selectedChunk = chunks[selectedChunkIndex - 1] ?? null;
  const hasNextThemeInSurah = selectedChunkIndex < chunks.length;
  const previousThemeHref =
    chunks.length > 0 && selectedChunkIndex > 1
      ? `/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex - 1}`
      : null;
  const nextThemeHref = hasNextThemeInSurah
    ? `/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex + 1}`
    : null;
  const selectedChunkSynopsis = selectedChunk
    ? buildThemeSynopsis(selectedChunk)
    : null;

  return (
    <>
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

      {!loadError ? (
        <ThemeJumpControls
          currentSurahNumber={surahNumber}
          currentChunkIndex={selectedChunkIndex}
          currentChunkCount={chunks.length}
          surahOptions={surahOptions}
        />
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
          {selectedChunk ? (
            <ThemeChunkProgressTracker
              chunkIndex={selectedChunk.chunk_index}
              surahId={surahNumber}
            />
          ) : null}

          <section className="space-y-6">
            {selectedChunk ? (
              <article
                key={selectedChunk.chunk_index}
                id={`chunk-${selectedChunk.chunk_index}`}
                className="space-y-8 animate-in fade-in duration-500"
              >
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

                <ThemeActionPanel
                  rangeLabel={rangeLabel(
                    surahNumber,
                    selectedChunk.start_ayah,
                    selectedChunk.end_ayah,
                  )}
                  sourceLabel={selectedChunkSynopsis?.sourceLabel ?? "tajuk chunk"}
                  synopsis={selectedChunkSynopsis?.synopsis ?? ""}
                  themeTitle={chunkTitleBm(selectedChunk)}
                />

                <Suspense
                  fallback={<ThemeChunkAyahListFallback ayat={selectedChunk.ayat} />}
                >
                  <ThemeChunkAyahListAsync ayat={selectedChunk.ayat} />
                </Suspense>
              </article>
            ) : null}
          </section>

          <nav className="sticky bottom-6 z-10 mx-auto mt-4 flex w-fit items-center justify-center gap-1 rounded-full border border-stone-200/80 bg-white/90 p-2 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-stone-700/80 dark:bg-stone-900/90 sm:gap-2">
            {previousThemeHref ? (
              <Link
                href={previousThemeHref}
                className="flex h-10 items-center justify-center whitespace-nowrap rounded-full border border-stone-200 bg-stone-50 px-4 text-xs font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 sm:text-sm"
              >
                &larr; Tema
              </Link>
            ) : (
              <span className="flex h-10 items-center justify-center whitespace-nowrap rounded-full border border-stone-100 bg-stone-50/50 px-4 text-xs font-medium text-stone-400 dark:border-stone-800 dark:bg-stone-800/30 dark:text-stone-600 sm:text-sm">
                &larr; Tema
              </span>
            )}

            <div className="hidden flex-row items-center gap-1 md:flex">
              <ThemeChunkSelect
                surahNumber={surahNumber}
                selectedChunkIndex={selectedChunkIndex}
                chunks={chunks.map((chunk) => ({
                  chunk_index: chunk.chunk_index,
                  label: chunkTitleBm(chunk),
                }))}
              />
            </div>

            {nextThemeHref ? (
              <Link
                href={nextThemeHref}
                className="flex h-10 items-center justify-center whitespace-nowrap rounded-full bg-stone-900 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white sm:text-sm"
              >
                Tema &rarr;
              </Link>
            ) : (
              <span className="flex h-10 items-center justify-center whitespace-nowrap rounded-full bg-stone-100 px-4 text-xs font-medium text-stone-400 dark:bg-stone-800 dark:text-stone-600 sm:text-sm">
                Tamat Surah
              </span>
            )}
          </nav>
        </div>
      ) : null}
    </>
  );
}
