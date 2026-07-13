import { FahamExposureTracker } from "@/components/FahamExposureTracker";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";
import { ThemeActionPanel } from "./ThemeActionPanel";
import { ThemeChunkAyahList } from "./ThemeChunkAyahList";
import { ThemeChunkProgressTracker } from "./ThemeChunkProgressTracker";
import { ThemeChunkSelect } from "./ThemeChunkSelect";
import { ThemeJumpControls } from "./ThemeJumpControls";
import { resolveThemeChunkLabelBm } from "../domain/themeLabels";
import type { AyahWordByWordEntry } from "@/lib/queries";
import type { ThemeAppearanceChunk } from "@/data/repositories/tema";
import type { Surah } from "@/types/database";

export interface ThemePageContentProps {
  readonly surahNumber: number;
  readonly surahMeta: Surah;
  readonly allSurahs: Surah[];
  readonly chunks: ThemeAppearanceChunk[];
  readonly wbw: Record<number, AyahWordByWordEntry[]>;
  readonly selectedChunkIndex: number;
  readonly prevSurahChunkCount: number | null;
}

function buildThemeHref(surahNumber: number, chunkIndex: number): string {
  const params = new URLSearchParams({ chunk: String(chunkIndex) });
  return `/read/surah/${surahNumber}/themes?${params.toString()}`;
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
  const curatedSynopsis = chunk.synopsis_bm?.trim();
  const description = chunk.theme?.description_bm?.trim();
  const title = chunkTitleBm(chunk);

  if (curatedSynopsis) {
    return {
      sourceLabel: "sinopsis tema",
      synopsis: curatedSynopsis,
    };
  }

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

export function ThemePageContent({
  surahNumber,
  allSurahs,
  chunks,
  wbw,
  selectedChunkIndex,
  prevSurahChunkCount,
}: ThemePageContentProps) {
  const selectedChunk = chunks[selectedChunkIndex - 1] ?? null;
  const hasNextThemeInSurah = selectedChunkIndex < chunks.length;
  const isFirstChunkInSurah = selectedChunkIndex <= 1;

  const surahOptions = allSurahs.map((item) => ({
    surah: item.id,
    nameBm: item.name_bm,
    nameEn: item.name_en,
  }));

  // Cross-surah navigation: connect last tema -> first tema of next surah
  const nextSurah =
    !hasNextThemeInSurah && surahNumber < 114
      ? allSurahs.find((s) => s.id === surahNumber + 1)
      : null;

  // Cross-surah navigation: connect first tema -> last tema of previous surah
  const prevSurahNumber =
    isFirstChunkInSurah && surahNumber > 1 ? surahNumber - 1 : null;

  const previousThemeHref =
    chunks.length > 0 && selectedChunkIndex > 1
      ? buildThemeHref(surahNumber, selectedChunkIndex - 1)
      : prevSurahChunkCount !== null && prevSurahNumber !== null
        ? buildThemeHref(prevSurahNumber, prevSurahChunkCount)
        : null;
  const nextThemeHref = hasNextThemeInSurah
    ? buildThemeHref(surahNumber, selectedChunkIndex + 1)
    : nextSurah
      ? buildThemeHref(nextSurah.id, 1)
      : null;
  const selectedChunkSynopsis = selectedChunk
    ? buildThemeSynopsis(selectedChunk)
    : null;

  // Extract wbw entries only for the selected chunk's ayah IDs
  const selectedAyahIds = selectedChunk
    ? selectedChunk.ayat.map((ayah) => ayah.id)
    : [];
  const wbwByAyahId: Record<number, AyahWordByWordEntry[]> = {};
  for (const ayahId of selectedAyahIds) {
    const entries = wbw[ayahId];
    if (entries) {
      wbwByAyahId[ayahId] = entries;
    }
  }

  return (
    <>
      {chunks.length === 0 ? (
        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-center text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
          Tema untuk surah ini belum tersedia lagi.
        </section>
      ) : null}

      <ThemeJumpControls
        currentSurahNumber={surahNumber}
        currentChunkIndex={selectedChunkIndex}
        currentChunkCount={chunks.length}
        surahOptions={surahOptions}
      />

      {chunks.length > 0 ? (
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
                <ThemeChunkAyahList
                  ayat={selectedChunk.ayat}
                  wbwByAyahId={wbwByAyahId}
                />
              </article>
            ) : null}
          </section>

          <nav className="sticky bottom-6 z-10 mx-auto mt-4 flex w-fit items-center justify-center gap-1 rounded-full border border-stone-200/80 bg-white/90 p-2 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-stone-700/80 dark:bg-stone-900/90 sm:gap-2">
            {previousThemeHref ? (
              <OfflineAwareLink
                href={previousThemeHref}
                className="flex h-10 items-center justify-center whitespace-nowrap rounded-full border border-stone-200 bg-stone-50 px-4 text-xs font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 sm:text-sm"
              >
                {isFirstChunkInSurah && prevSurahNumber !== null
                  ? `\u2190 ${allSurahs.find((s) => s.id === prevSurahNumber)?.name_bm ?? "Surah"}`
                  : "\u2190 Tema"}
              </OfflineAwareLink>
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
              <OfflineAwareLink
                href={nextThemeHref}
                className="flex h-10 items-center justify-center whitespace-nowrap rounded-full bg-stone-900 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white sm:text-sm"
              >
                {nextSurah
                  ? `${nextSurah.name_bm} \u2192`
                  : "Tema \u2192"}
              </OfflineAwareLink>
            ) : (
              <span className="flex h-10 items-center justify-center whitespace-nowrap rounded-full bg-stone-100 px-4 text-xs font-medium text-stone-400 dark:bg-stone-800 dark:text-stone-600 sm:text-sm">
                Tamat Quran
              </span>
            )}
          </nav>
        </div>
      ) : null}
    </>
  );
}
