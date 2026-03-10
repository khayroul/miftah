"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  calculateHifzRevealStageByAyahKeys,
  resolveApproxThirdBoundariesByAyahEnd,
  type HifzRevealStage,
} from "@/lib/hifz/pageReveal";
import { deriveMushafViewState } from "@/lib/mushafViewState";
import { useReadMode } from "@/lib/useReadMode";
import type {
  MushafPageManifest,
  MushafWordHitbox,
  MushafWordTranslationMap,
} from "@/types/mushaf";

export interface MushafAyahDetail {
  key: string;
  label: string;
  textUthmani: string;
  bm: string | null;
  en: string | null;
}

interface MushafPageViewProps {
  pageNumber: number;
  imageAvailable: boolean;
  thumbnailAvailable: boolean;
  manifest: MushafPageManifest | null;
  wordTranslations: MushafWordTranslationMap;
  ayahDetails: MushafAyahDetail[];
  memorizedAyahKeys: string[];
  hifzRevealByThirdsEnabled?: boolean;
  playingAyahKey?: string | null;
  onNavigatePrevPage?: () => void;
  onNavigateNextPage?: () => void;
}

interface AyahBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WordTooltipPlacement {
  left: number;
  top: number;
  width: number;
}

interface AyahLayoutEntry {
  key: string;
  box: AyahBoundingBox;
  bottomY: number;
}

function percent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expandHitbox(
  box: AyahBoundingBox,
  paddingX: number,
  paddingY: number,
  maxWidth: number,
  maxHeight: number,
): AyahBoundingBox {
  const x = clamp(box.x - paddingX, 0, maxWidth);
  const y = clamp(box.y - paddingY, 0, maxHeight);
  const width = clamp(box.width + paddingX * 2, 1, maxWidth - x);
  const height = clamp(box.height + paddingY * 2, 1, maxHeight - y);
  return { x, y, width, height };
}

function getWordTooltipPlacement(
  word: MushafWordHitbox,
  imageWidth: number,
  imageHeight: number,
): WordTooltipPlacement {
  const horizontalPadding = Math.max(12, imageWidth * 0.01);
  const verticalPadding = Math.max(12, imageHeight * 0.01);
  const verticalGap = Math.max(14, imageHeight * 0.008);
  const tooltipWidth = Math.min(420, imageWidth * 0.52);
  const estimatedTooltipHeight = Math.min(220, imageHeight * 0.18);

  const centeredLeft = word.x + word.width / 2 - tooltipWidth / 2;
  const left = clamp(
    centeredLeft,
    horizontalPadding,
    imageWidth - tooltipWidth - horizontalPadding,
  );

  const preferredTop = word.y + word.height + verticalGap;
  const fallbackTop = word.y - estimatedTooltipHeight - verticalGap;
  const top = preferredTop + estimatedTooltipHeight <= imageHeight - verticalPadding
    ? preferredTop
    : fallbackTop;

  return {
    left,
    top: clamp(
      top,
      verticalPadding,
      imageHeight - estimatedTooltipHeight - verticalPadding,
    ),
    width: tooltipWidth,
  };
}

function getAyahKeyFromWord(word: MushafWordHitbox): string | null {
  const surah = word.surah;
  const ayah = word.ayah;
  const explicitAyahKey =
    typeof surah === "number" && typeof ayah === "number"
      ? `${surah}:${ayah}`
      : word.location.split(":").slice(0, 2).join(":");
  return explicitAyahKey.includes(":") ? explicitAyahKey : null;
}

function revealStageLabel(stage: HifzRevealStage): string {
  if (stage === 1) {
    return "1/3";
  }
  if (stage === 2) {
    return "2/3";
  }
  return "Penuh";
}

export function MushafPageView({
  pageNumber,
  imageAvailable,
  thumbnailAvailable,
  manifest,
  wordTranslations,
  ayahDetails,
  memorizedAyahKeys,
  hifzRevealByThirdsEnabled = false,
  playingAyahKey = null,
  onNavigatePrevPage,
  onNavigateNextPage,
}: MushafPageViewProps) {
  const [selectedWord, setSelectedWord] = useState<MushafWordHitbox | null>(
    null,
  );
  const [selectedAyahKey, setSelectedAyahKey] = useState<string | null>(null);
  const [fullImageReady, setFullImageReady] = useState(false);
  const [fullImageFailed, setFullImageFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const { mode } = useReadMode();

  const imageWidth = manifest?.image_width ?? 1200;
  const imageHeight = manifest?.image_height ?? 1920;
  const words = useMemo(() => manifest?.words ?? [], [manifest]);
  const {
    canShowFullImage,
    canShowThumbnail,
    canShowAnyImage,
    canInteract: canInteractWhenReady,
  } =
    deriveMushafViewState({
      imageAvailable,
      thumbnailAvailable,
      fullImageFailed,
      thumbnailFailed,
      fullImageReady,
      wordsCount: words.length,
    });
  const modeAllowsWordInteraction = mode !== "read";
  const canInteract = modeAllowsWordInteraction && canInteractWhenReady;
  const canTapAyah = mode === "read" && canShowFullImage && fullImageReady;
  const wordTapPaddingX = Math.max(8, imageWidth * 0.004);
  const wordTapPaddingY = Math.max(8, imageHeight * 0.003);
  const ayahDetailsMap = useMemo(() => {
    const map = new Map<string, MushafAyahDetail>();
    for (const ayah of ayahDetails) {
      map.set(ayah.key, ayah);
    }
    return map;
  }, [ayahDetails]);
  const ayahBoxes = useMemo(() => {
    const map = new Map<string, AyahBoundingBox>();

    for (const word of words) {
      const ayahKey = getAyahKeyFromWord(word);
      if (!ayahKey) {
        continue;
      }

      const current = map.get(ayahKey);
      if (!current) {
        map.set(ayahKey, {
          x: word.x,
          y: word.y,
          width: word.width,
          height: word.height,
        });
        continue;
      }

      const minX = Math.min(current.x, word.x);
      const minY = Math.min(current.y, word.y);
      const maxX = Math.max(current.x + current.width, word.x + word.width);
      const maxY = Math.max(current.y + current.height, word.y + word.height);

      map.set(ayahKey, {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    }

    return map;
  }, [words]);
  const ayahLayoutEntries = useMemo<AyahLayoutEntry[]>(() => {
    return Array.from(ayahBoxes.entries())
      .map(([key, box]) => ({
        key,
        box,
        bottomY: box.y + box.height,
      }))
      .sort((a, b) => {
        if (a.box.y !== b.box.y) {
          return a.box.y - b.box.y;
        }
        return a.box.x - b.box.x;
      });
  }, [ayahBoxes]);
  const ayahOverlayTargets = useMemo(
    () =>
      Array.from(ayahBoxes.entries()).map(([key, box]) => ({
        key,
        box,
        detail: ayahDetailsMap.get(key) ?? null,
      })),
    [ayahBoxes, ayahDetailsMap],
  );
  const memorizedAyahKeySet = useMemo(
    () => new Set(memorizedAyahKeys),
    [memorizedAyahKeys],
  );
  const hifzRevealContext = useMemo(() => {
    const revealEnabled =
      mode === "hifz" && hifzRevealByThirdsEnabled && imageHeight > 0;
    if (!revealEnabled || ayahLayoutEntries.length === 0) {
      return null;
    }

    const ayahBottomsAscending = ayahLayoutEntries.map((entry) => entry.bottomY);
    const { firstBoundaryY, secondBoundaryY } = resolveApproxThirdBoundariesByAyahEnd(
      ayahBottomsAscending,
      imageHeight,
    );

    const firstSegmentAyahKeys = ayahLayoutEntries
      .filter((entry) => entry.bottomY <= firstBoundaryY)
      .map((entry) => entry.key);
    const secondSegmentAyahKeys = ayahLayoutEntries
      .filter(
        (entry) =>
          entry.bottomY > firstBoundaryY && entry.bottomY <= secondBoundaryY,
      )
      .map((entry) => entry.key);

    const stage = calculateHifzRevealStageByAyahKeys(
      firstSegmentAyahKeys,
      secondSegmentAyahKeys,
      memorizedAyahKeySet,
    );

    const visibleBoundaryY =
      stage === 1 ? firstBoundaryY : stage === 2 ? secondBoundaryY : imageHeight;

    return {
      stage,
      firstBoundaryY,
      secondBoundaryY,
      visibleBoundaryY,
    };
  }, [
    ayahLayoutEntries,
    hifzRevealByThirdsEnabled,
    imageHeight,
    memorizedAyahKeySet,
    mode,
  ]);
  const revealMaskTop = hifzRevealContext
    ? percent(hifzRevealContext.visibleBoundaryY, imageHeight)
    : null;
  const revealEnabled =
    hifzRevealByThirdsEnabled &&
    mode === "hifz" &&
    hifzRevealContext !== null &&
    hifzRevealContext.visibleBoundaryY < imageHeight;
  const revealVisibleBoundaryY = hifzRevealContext?.visibleBoundaryY ?? imageHeight;
  const activeWord =
    canInteract &&
    selectedWord !== null &&
    selectedWord.y < revealVisibleBoundaryY
      ? selectedWord
      : null;
  const selectedTranslation = activeWord
    ? wordTranslations[activeWord.location] ?? null
    : null;
  const activeWordTooltipPlacement = activeWord
    ? getWordTooltipPlacement(activeWord, imageWidth, imageHeight)
    : null;
  const selectedAyahBox = selectedAyahKey ? ayahBoxes.get(selectedAyahKey) ?? null : null;
  const selectedAyahDetail = selectedAyahKey && canTapAyah
    ? !selectedAyahBox || selectedAyahBox.y < revealVisibleBoundaryY
      ? ayahDetailsMap.get(selectedAyahKey) ?? null
      : null
    : null;
  const playingAyahBox = playingAyahKey ? ayahBoxes.get(playingAyahKey) ?? null : null;
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsedMs = Date.now() - start.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (elapsedMs > 900 || absDx < 60 || absDy > 120 || absDx < absDy * 1.3) {
      return;
    }

    if (dx > 0) {
      onNavigatePrevPage?.();
      return;
    }

    onNavigateNextPage?.();
  };

  return (
    <section className="space-y-3">
      <div
        className="relative overflow-visible rounded-2xl border border-stone-300 bg-[#fffdfa] shadow-[0_18px_34px_-30px_rgba(28,25,23,0.7)] dark:border-stone-600 dark:bg-slate-950 dark:shadow-[0_22px_38px_-30px_rgba(2,6,23,0.9)]"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {canShowAnyImage ? (
          <>
            {canShowThumbnail ? (
              <Image
                src={`/api/mushaf/page/${pageNumber}?variant=thumb`}
                alt={`Thumbnail halaman mushaf ${pageNumber}`}
                fill
                unoptimized
                sizes="(max-width: 1024px) 100vw, 960px"
                className={`object-contain transition-opacity duration-200 dark:invert dark:brightness-105 dark:contrast-110 ${
                  fullImageReady ? "opacity-0" : "opacity-100"
                }`}
                onError={() => setThumbnailFailed(true)}
              />
            ) : null}
            {canShowFullImage ? (
              <Image
                src={`/api/mushaf/page/${pageNumber}`}
                alt={`Halaman mushaf ${pageNumber}`}
                fill
                unoptimized
                sizes="(max-width: 1024px) 100vw, 960px"
                className={`object-contain transition-opacity duration-200 dark:invert dark:brightness-105 dark:contrast-110 ${
                  fullImageReady ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setFullImageReady(true)}
                onError={() => {
                  setFullImageFailed(true);
                  setFullImageReady(false);
                  setSelectedWord(null);
                }}
              />
            ) : null}
            {playingAyahBox ? (
              <div
                className="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-200/20 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]"
                style={{
                  left: percent(playingAyahBox.x, imageWidth),
                  top: percent(playingAyahBox.y, imageHeight),
                  width: percent(playingAyahBox.width, imageWidth),
                  height: percent(playingAyahBox.height, imageHeight),
                }}
              />
            ) : null}
            {canTapAyah ? (
              <div className="absolute inset-0" onClick={() => setSelectedAyahKey(null)}>
                {ayahOverlayTargets.map(({ key, box, detail }) => (
                  <button
                    key={`ayah-${key}`}
                    type="button"
                    aria-label={`Ayat ${key}`}
                    title={detail?.label ?? key}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedAyahKey((current) => (current === key ? null : key));
                    }}
                    className="absolute cursor-pointer bg-transparent hover:bg-sky-300/15 focus-visible:bg-sky-300/20 focus-visible:outline-none"
                    style={{
                      left: percent(box.x, imageWidth),
                      top: percent(box.y, imageHeight),
                      width: percent(box.width, imageWidth),
                      height: percent(box.height, imageHeight),
                    }}
                  />
                ))}
              </div>
            ) : null}
            {!fullImageReady && canShowFullImage ? (
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4">
                <span className="rounded-full border border-stone-300 bg-white/90 px-3 py-1 text-xs text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-300">
                  Loading full page...
                </span>
              </div>
            ) : null}
            {canInteract ? (
              <div
                className="absolute inset-0"
                onClick={() => setSelectedWord(null)}
              >
                {words.map((word, index) => {
                  const tapBox = expandHitbox(
                    {
                      x: word.x,
                      y: word.y,
                      width: word.width,
                      height: word.height,
                    },
                    wordTapPaddingX,
                    wordTapPaddingY,
                    imageWidth,
                    imageHeight,
                  );

                  return (
                    <button
                      key={`${word.location}-${index}`}
                      type="button"
                      data-testid="word-hitbox"
                      aria-label={`Perkataan ${word.location}`}
                      title={word.location}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedWord(word);
                      }}
                      onTouchStart={(event) => {
                        event.stopPropagation();
                        setSelectedWord(word);
                      }}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                      }}
                      className="absolute cursor-pointer bg-transparent hover:bg-amber-300/25 focus-visible:bg-amber-300/30 focus-visible:outline-none"
                      style={{
                        left: percent(tapBox.x, imageWidth),
                        top: percent(tapBox.y, imageHeight),
                        width: percent(tapBox.width, imageWidth),
                        height: percent(tapBox.height, imageHeight),
                      }}
                    />
                  );
                })}
                {activeWord ? (
                  <div
                    className="pointer-events-none absolute border-2 border-amber-500"
                    style={{
                      left: percent(activeWord.x, imageWidth),
                      top: percent(activeWord.y, imageHeight),
                      width: percent(activeWord.width, imageWidth),
                      height: percent(activeWord.height, imageHeight),
                    }}
                  />
                ) : null}
                {activeWord && activeWordTooltipPlacement ? (
                  <article
                    data-testid="word-tooltip"
                    className="pointer-events-none absolute z-20 rounded-xl border border-stone-300 bg-white/96 px-3 py-2 text-sm text-stone-800 shadow-md dark:border-stone-700 dark:bg-stone-900/96 dark:text-stone-100"
                    style={{
                      left: percent(activeWordTooltipPlacement.left, imageWidth),
                      top: percent(activeWordTooltipPlacement.top, imageHeight),
                      width: percent(activeWordTooltipPlacement.width, imageWidth),
                    }}
                  >
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {selectedTranslation?.bm ?? "Tiada terjemahan"}
                    </p>
                    <p className="text-sm text-stone-600 dark:text-stone-300">
                      {selectedTranslation?.en ?? "No translation"}
                    </p>
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                      {activeWord.location}
                    </p>
                  </article>
                ) : null}
              </div>
            ) : null}
            {hifzRevealContext && revealEnabled && revealMaskTop ? (
              <div
                className="absolute left-0 right-0 bottom-0 z-30 border-t border-dashed border-teal-500/60 bg-[#fffdfa] dark:bg-slate-950"
                style={{ top: revealMaskTop }}
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onTouchEnd={(event) => event.stopPropagation()}
              >
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-teal-500/40 bg-white/95 px-3 py-1 text-[10px] font-semibold tracking-wide text-teal-800 shadow-sm dark:border-teal-300/40 dark:bg-stone-900/95 dark:text-teal-200">
                  HIFZ REVEAL · {revealStageLabel(hifzRevealContext.stage)}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-600 dark:text-stone-300">
            Imej halaman {pageNumber} belum tersedia lagi.
          </div>
        )}
      </div>

      <div className="fixed bottom-6 left-1/2 z-40 w-max max-w-[95vw] -translate-x-1/2 animate-fade-in-up">
        <nav className="flex items-center gap-1 rounded-full border border-stone-200/80 bg-white/95 p-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md dark:border-stone-700/60 dark:bg-stone-900/90">
          {pageNumber > 1 ? (
            <Link
              href={`/read/${pageNumber - 1}`}
              className="rounded-full px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 flex items-center gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              <span className="hidden sm:inline">Prev</span>
            </Link>
          ) : (
            <span className="flex cursor-not-allowed items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-stone-300 dark:text-stone-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              <span className="hidden sm:inline">Prev</span>
            </span>
          )}

          <div className="flex select-none items-center justify-center px-4">
            <span className="text-xs font-bold tracking-widest text-stone-500 dark:text-stone-400">
              HALAMAN {pageNumber}
            </span>
          </div>

          {pageNumber < 604 ? (
            <Link
              href={`/read/${pageNumber + 1}`}
              className="rounded-full px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 flex items-center gap-1.5"
            >
              <span className="hidden sm:inline">Next</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ) : (
            <span className="flex cursor-not-allowed items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-stone-300 dark:text-stone-600">
              <span className="hidden sm:inline">Next</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          )}
        </nav>
      </div>

      {!manifest ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Manifest tidak ditemui. Halaman dipaparkan tanpa hitbox.
        </p>
      ) : revealEnabled && hifzRevealContext ? (
        <p className="text-sm text-teal-700 dark:text-teal-300">
          Hifz reveal aktif: paparan {revealStageLabel(hifzRevealContext.stage)} halaman (sempadan ikut hujung ayat).
        </p>
      ) : canTapAyah ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Tap pada ayat untuk lihat terjemahan BM. Swipe kiri/kanan untuk tukar halaman.
        </p>
      ) : playingAyahKey ? (
        <p className="text-sm text-emerald-700">
          Sedang dimainkan: ayat {playingAyahKey}
        </p>
      ) : words.length === 0 ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Manifest dijumpai, tetapi tiada hitbox sah untuk dipaparkan.
        </p>
      ) : !fullImageReady ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Thumbnail dipaparkan dahulu. Hitbox aktif selepas imej penuh siap.
        </p>
      ) : !modeAllowsWordInteraction ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Read mode aktif. Tukar ke Study/Hifz untuk makna perkataan.
        </p>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Tap pada perkataan untuk lihat makna segera.
        </p>
      )}

      {selectedAyahDetail ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/35" onClick={() => setSelectedAyahKey(null)}>
          <article
            className="max-h-[78vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-stone-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Ayat {selectedAyahDetail.label}
              </p>
              <button
                type="button"
                onClick={() => setSelectedAyahKey(null)}
                className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Tutup
              </button>
            </div>
            <p className="mt-3 text-right text-2xl leading-loose text-stone-900 dark:text-stone-100" dir="rtl">
              {selectedAyahDetail.textUthmani}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-200">
              {selectedAyahDetail.bm ?? "Terjemahan BM belum tersedia."}
            </p>
            {selectedAyahDetail.en ? (
              <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                EN: {selectedAyahDetail.en}
              </p>
            ) : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}
