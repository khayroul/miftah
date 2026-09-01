"use client";

import { useLocale, useTranslations } from "next-intl";
import { FahamExposureTracker } from "@/features/faham";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";
import { ThemeActionPanel } from "./ThemeActionPanel";
import { ThemeChunkAyahList } from "./ThemeChunkAyahList";
import { ThemeChunkProgressTracker } from "./ThemeChunkProgressTracker";
import { ThemeChunkSelect } from "./ThemeChunkSelect";
import { ThemeJumpControls } from "./ThemeJumpControls";
import {
  resolveThemeChunkLabelBm,
  resolveThemeChunkLabelEn,
} from "../domain/themeLabels";
import type { AyahWordByWordEntry } from "@/lib/queries";
import type { ThemeAppearanceChunk } from "@/data/repositories/tema";
import type { Surah } from "@/shared/types/database";

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

type PageContentTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function chunkTitle(
  chunk: ThemeAppearanceChunk,
  locale: string,
  t: PageContentTranslator,
): string {
  if (locale !== "en") {
    return chunkTitleBm(chunk);
  }

  const label = resolveThemeChunkLabelEn({
    surahId: chunk.surah_id,
    startAyah: chunk.start_ayah,
    endAyah: chunk.end_ayah,
    labelEn: chunk.label_en,
    themeNameEn: chunk.theme?.name_en ?? null,
  });
  if (label) return label;

  return t("fallbackThemeTitle", {
    range: rangeLabel(chunk.surah_id, chunk.start_ayah, chunk.end_ayah),
  });
}

function buildThemeSynopsis(
  chunk: ThemeAppearanceChunk,
  t: PageContentTranslator,
  locale: string,
): {
  sourceLabel: string;
  synopsis: string;
} {
  const isEnglish = locale === "en";
  const curatedSynopsis = isEnglish ? null : chunk.synopsis_bm?.trim();
  const description = isEnglish
    ? chunk.theme?.description_en?.trim()
    : chunk.theme?.description_bm?.trim();
  const title = chunkTitle(chunk, locale, t);

  if (curatedSynopsis) {
    return {
      sourceLabel: t("sourceSynopsis"),
      synopsis: curatedSynopsis,
    };
  }

  if (description) {
    return {
      sourceLabel: t("sourceDescription"),
      synopsis: description,
    };
  }

  const translationSnippets = chunk.ayat
    .map((ayah) =>
      isEnglish ? ayah.translation_en?.trim() : ayah.display_bm?.trim(),
    )
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);

  if (translationSnippets.length > 0) {
    const combined = translationSnippets.join(" ");
    return {
      sourceLabel: t("sourceVerseExcerpt"),
      synopsis: truncateText(
        t("synopsisFromVerses", { title, excerpt: combined }),
        320,
      ),
    };
  }

  return {
    sourceLabel: t("sourceChunkTitle"),
    synopsis: t("genericSynopsisFallback"),
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
  const t = useTranslations("tema.pageContent");
  const locale = useLocale();
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
    ? buildThemeSynopsis(selectedChunk, t, locale)
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
          {t("noThemesYet")}
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
                    {t("themeCounterBadge", { current: selectedChunkIndex, total: chunks.length })}
                  </span>
                  <h2 className="mt-2 text-2xl font-serif text-stone-900 dark:text-stone-50 md:text-3xl">
                    {chunkTitle(selectedChunk, locale, t)}
                  </h2>
                  <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                    {t("verseRangeLabel", {
                      range: rangeLabel(
                        surahNumber,
                        selectedChunk.start_ayah,
                        selectedChunk.end_ayah,
                      ),
                    })}
                  </p>
                </header>

                <ThemeActionPanel
                  rangeLabel={rangeLabel(
                    surahNumber,
                    selectedChunk.start_ayah,
                    selectedChunk.end_ayah,
                  )}
                  sourceLabel={selectedChunkSynopsis?.sourceLabel ?? t("sourceChunkTitle")}
                  synopsis={selectedChunkSynopsis?.synopsis ?? ""}
                />
                <ThemeChunkAyahList
                  ayat={selectedChunk.ayat}
                  wbwByAyahId={wbwByAyahId}
                />
              </article>
            ) : null}
          </section>

          <nav className="relative z-10 mx-auto mt-4 flex w-fit items-center justify-center gap-1 rounded-full border border-stone-200/80 bg-white/90 p-2 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-stone-700/80 dark:bg-stone-900/90 sm:sticky sm:bottom-6 sm:gap-2">
            {previousThemeHref ? (
              <OfflineAwareLink
                href={previousThemeHref}
                className="ui-touch-target flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-stone-200 bg-stone-50 px-4 text-xs font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 sm:text-sm"
              >
                {isFirstChunkInSurah && prevSurahNumber !== null
                  ? t("prevSurahNav", {
                      surah:
                        allSurahs.find((s) => s.id === prevSurahNumber)?.[
                          locale === "en" ? "name_en" : "name_bm"
                        ] ?? t("prevSurahFallbackName"),
                    })
                  : t("prevThemeNav")}
              </OfflineAwareLink>
            ) : (
              <span className="flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-stone-100 bg-stone-50/50 px-4 text-xs font-medium text-stone-400 dark:border-stone-800 dark:bg-stone-800/30 dark:text-stone-600 sm:text-sm">
                {t("prevThemeNav")}
              </span>
            )}

            <div className="hidden flex-row items-center gap-1 md:flex">
              <ThemeChunkSelect
                surahNumber={surahNumber}
                selectedChunkIndex={selectedChunkIndex}
                chunks={chunks.map((chunk) => ({
                  chunk_index: chunk.chunk_index,
                  label: chunkTitle(chunk, locale, t),
                }))}
              />
            </div>

            {nextThemeHref ? (
              <OfflineAwareLink
                href={nextThemeHref}
                className="ui-touch-target flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-stone-900 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white sm:text-sm"
              >
                {nextSurah
                  ? t("nextSurahNav", {
                      surah: locale === "en" ? nextSurah.name_en : nextSurah.name_bm,
                    })
                  : t("nextThemeNav")}
              </OfflineAwareLink>
            ) : (
              <span className="flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-stone-100 px-4 text-xs font-medium text-stone-400 dark:bg-stone-800 dark:text-stone-600 sm:text-sm">
                {t("endOfQuranLabel")}
              </span>
            )}
          </nav>
        </div>
      ) : null}
    </>
  );
}
