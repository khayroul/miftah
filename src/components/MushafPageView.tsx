"use client";

import Image from "next/image";
import {
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  type AyahEndByLine,
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
  id: number;
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
  onNavigatePrevPage?: () => void;
  onNavigateNextPage?: () => void;
  onCanvasTap?: () => void;
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

interface HifzRevealContext {
  stage: HifzRevealStage;
  firstBoundaryY: number;
  secondBoundaryY: number;
  visibleBoundaryY: number;
  firstSegmentAyahKeys: string[];
  secondSegmentAyahKeys: string[];
  thirdSegmentAyahKeys: string[];
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

function deriveLineCenters(
  words: MushafWordHitbox[],
  imageHeight: number,
): number[] {
  if (words.length === 0) {
    return [];
  }

  const centers = words
    .map((word) => word.y + word.height / 2)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (centers.length === 0) {
    return [];
  }

  const threshold = Math.max(16, imageHeight / 70);
  const clusters: Array<{ sum: number; count: number; mean: number }> = [];

  for (const center of centers) {
    const current = clusters[clusters.length - 1];
    if (!current || Math.abs(center - current.mean) > threshold) {
      clusters.push({ sum: center, count: 1, mean: center });
      continue;
    }

    current.sum += center;
    current.count += 1;
    current.mean = current.sum / current.count;
  }

  return clusters.map((cluster) => cluster.mean);
}

function mapYToLinePosition(y: number, lineCenters: number[]): number {
  if (lineCenters.length === 0) {
    return 1;
  }
  if (lineCenters.length === 1) {
    return 1;
  }

  if (y <= lineCenters[0]) {
    return 1;
  }
  const lastCenter = lineCenters[lineCenters.length - 1];
  if (y >= lastCenter) {
    return lineCenters.length;
  }

  for (let index = 0; index < lineCenters.length - 1; index += 1) {
    const start = lineCenters[index];
    const end = lineCenters[index + 1];
    if (y < start || y > end) {
      continue;
    }

    const span = end - start;
    if (span <= 0) {
      return index + 1;
    }
    const ratio = (y - start) / span;
    return index + 1 + ratio;
  }

  return lineCenters.length;
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
  onNavigatePrevPage,
  onNavigateNextPage,
  onCanvasTap,
}: MushafPageViewProps) {
  const [selectedWord, setSelectedWord] = useState<MushafWordHitbox | null>(
    null,
  );
  const [selectedAyahKey, setSelectedAyahKey] = useState<string | null>(null);
  const [fullImageReady, setFullImageReady] = useState(false);
  const [fullImageFailed, setFullImageFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [markingMemorized, setMarkingMemorized] = useState(false);
  const [markMemorizedError, setMarkMemorizedError] = useState<string | null>(
    null,
  );
  const [memorizedAyahKeySet, setMemorizedAyahKeySet] = useState(
    () => new Set(memorizedAyahKeys),
  );
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
  const modeAllowsWordInteraction = mode === "faham" || mode === "read";
  const canInteract = modeAllowsWordInteraction && canInteractWhenReady;
  const canSelectAyah = mode === "read" && canShowFullImage && fullImageReady;
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
  const lineCenters = useMemo(
    () => deriveLineCenters(words, imageHeight),
    [imageHeight, words],
  );
  const ayahEndsByLine = useMemo<AyahEndByLine[]>(
    () =>
      ayahLayoutEntries.map((entry) => ({
        bottomY: entry.bottomY,
        linePosition: mapYToLinePosition(entry.bottomY, lineCenters),
      })),
    [ayahLayoutEntries, lineCenters],
  );
  const totalLineCount = lineCenters.length > 0 ? lineCenters.length : 15;
  const ayahOverlayTargets = useMemo(
    () =>
      Array.from(ayahBoxes.entries()).map(([key, box]) => ({
        key,
        box,
        detail: ayahDetailsMap.get(key) ?? null,
      })),
    [ayahBoxes, ayahDetailsMap],
  );
  const hifzRevealContext = useMemo<HifzRevealContext | null>(() => {
    const revealEnabled =
      mode === "hifz" && hifzRevealByThirdsEnabled && imageHeight > 0;
    if (!revealEnabled || ayahLayoutEntries.length === 0) {
      return null;
    }

    const { firstBoundaryY, secondBoundaryY } = resolveApproxThirdBoundariesByAyahEnd(
      ayahEndsByLine,
      totalLineCount,
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
    const thirdSegmentAyahKeys = ayahLayoutEntries
      .filter((entry) => entry.bottomY > secondBoundaryY)
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
      firstSegmentAyahKeys,
      secondSegmentAyahKeys,
      thirdSegmentAyahKeys,
    };
  }, [
    ayahEndsByLine,
    ayahLayoutEntries,
    hifzRevealByThirdsEnabled,
    imageHeight,
    memorizedAyahKeySet,
    mode,
    totalLineCount,
  ]);
  const revealMaskTop = hifzRevealContext
    ? percent(hifzRevealContext.visibleBoundaryY, imageHeight)
    : null;
  const revealEnabled =
    hifzRevealByThirdsEnabled &&
    mode === "hifz" &&
    hifzRevealContext !== null &&
    hifzRevealContext.visibleBoundaryY < imageHeight;
  const hifzRevealSessionActive = mode === "hifz" && hifzRevealContext !== null;
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
  const selectableAyahTargets = ayahOverlayTargets;
  const selectedAyahDetail = selectedAyahKey && canSelectAyah
    ? ayahDetailsMap.get(selectedAyahKey) ?? null
    : null;
  const allAyatMemorized = useMemo(
    () =>
      ayahLayoutEntries.length > 0 &&
      ayahLayoutEntries.every((entry) => memorizedAyahKeySet.has(entry.key)),
    [ayahLayoutEntries, memorizedAyahKeySet],
  );
  const remainingAyahKeys = useMemo(
    () =>
      ayahLayoutEntries
        .filter((entry) => !memorizedAyahKeySet.has(entry.key))
        .map((entry) => entry.key),
    [ayahLayoutEntries, memorizedAyahKeySet],
  );
  const hifzStageTargetAyahKeys = useMemo(() => {
    if (mode !== "hifz") {
      return [];
    }
    if (!hifzRevealContext) {
      return remainingAyahKeys;
    }
    if (hifzRevealContext.stage === 1) {
      return hifzRevealContext.firstSegmentAyahKeys;
    }
    if (hifzRevealContext.stage === 2) {
      return hifzRevealContext.secondSegmentAyahKeys;
    }
    return hifzRevealContext.thirdSegmentAyahKeys;
  }, [hifzRevealContext, mode, remainingAyahKeys]);
  const canMarkHifz = mode === "hifz" && remainingAyahKeys.length > 0;
  const hifzHafalButtonLabel = allAyatMemorized
    ? "Halaman Sudah Hafal"
    : markingMemorized
      ? "Menyimpan..."
      : !canMarkHifz
        ? "Tiada Ayat Untuk Ditanda"
        : !hifzRevealSessionActive
          ? "Hafal Halaman Ini"
          : hifzRevealContext?.stage === 1
            ? "Hafal 1/3 Pertama"
            : hifzRevealContext?.stage === 2
              ? "Hafal 1/3 Kedua"
              : "Hafal Baki Halaman";
  const handleMarkHifzMemorized = async () => {
    if (mode !== "hifz" || markingMemorized || allAyatMemorized || !canMarkHifz) {
      return;
    }

    const fallbackKeys = remainingAyahKeys;
    const targetAyahKeys =
      hifzStageTargetAyahKeys.length > 0 ? hifzStageTargetAyahKeys : fallbackKeys;
    if (targetAyahKeys.length === 0) {
      setMarkMemorizedError("Ayat sasaran tidak dijumpai untuk ditanda hafal.");
      return;
    }
    const targetAyahIds = targetAyahKeys
      .map((key) => ayahDetailsMap.get(key)?.id ?? null)
      .filter((value): value is number => typeof value === "number");

    if (targetAyahIds.length === 0) {
      setMarkMemorizedError("Ayat sasaran tidak dijumpai untuk ditanda hafal.");
      return;
    }

    setMarkingMemorized(true);
    setMarkMemorizedError(null);
    try {
      const response = await fetch("/api/hifz/mark-memorized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ayahIds: targetAyahIds }),
      });
      if (!response.ok) {
        setMarkMemorizedError("Gagal simpan status hafal. Cuba lagi.");
        return;
      }
      setMemorizedAyahKeySet((current) => {
        const next = new Set(current);
        for (const key of targetAyahKeys) {
          next.add(key);
        }
        return next;
      });
    } catch {
      setMarkMemorizedError("Gagal simpan status hafal. Cuba lagi.");
    } finally {
      setMarkingMemorized(false);
    }
  };
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
        onClick={() => onCanvasTap?.()}
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
            {canSelectAyah ? (
              <div
                className="absolute inset-0"
                onClick={() => {
                  setSelectedAyahKey(null);
                  setMarkMemorizedError(null);
                }}
              >
                {selectableAyahTargets.map(({ key, box, detail }) => (
                  <button
                    key={`ayah-${key}`}
                    type="button"
                    aria-label={`Ayat ${key}`}
                    title={detail?.label ?? key}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMarkMemorizedError(null);
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

      {mode === "hifz" && canShowAnyImage && hifzRevealByThirdsEnabled ? (
        <div className="fixed bottom-24 left-1/2 z-40 w-[min(92vw,420px)] -translate-x-1/2 animate-fade-in-up">
          <div className="rounded-2xl border border-teal-200 bg-white/95 p-3 shadow-[0_10px_30px_rgba(13,148,136,0.22)] backdrop-blur-md dark:border-teal-900/60 dark:bg-stone-900/90">
            <button
              type="button"
              disabled={allAyatMemorized || markingMemorized || !canMarkHifz}
              onClick={handleMarkHifzMemorized}
              className="w-full rounded-xl bg-teal-900 px-4 py-2.5 text-sm font-semibold text-teal-50 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-teal-700 dark:hover:bg-teal-600"
            >
              {hifzHafalButtonLabel}
            </button>
            <p className="mt-2 text-xs text-teal-800 dark:text-teal-200">
              {hifzRevealSessionActive
                ? "Setiap kali ditekan, paparan akan buka bahagian seterusnya sehingga penuh."
                : "Semua ayat pada halaman ini akan ditanda sebagai hafal."}
            </p>
            {markMemorizedError ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                {markMemorizedError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!manifest ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Manifest tidak ditemui. Halaman dipaparkan tanpa hitbox.
        </p>
      ) : revealEnabled && hifzRevealContext ? (
        <p className="text-sm text-teal-700 dark:text-teal-300">
          Hifz reveal aktif: paparan {revealStageLabel(hifzRevealContext.stage)} halaman (sempadan ikut hujung ayat).
        </p>
      ) : mode === "hifz" && !hifzRevealByThirdsEnabled ? (
        <p className="text-sm text-teal-700 dark:text-teal-300">
          Paparan 1/3 sedang dimatikan. Aktifkan semula untuk memaparkan butang Hafal.
        </p>
      ) : mode === "read" && canSelectAyah ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Ketik ayat untuk melihat terjemahan BM. Leret kiri atau kanan untuk menukar halaman.
        </p>
      ) : mode === "hifz" ? (
        <p className="text-sm text-teal-700 dark:text-teal-300">
          Gunakan butang Hafal untuk membuka 1/3 → 2/3 → penuh.
        </p>
      ) : words.length === 0 ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Manifest dijumpai, tetapi tiada hitbox sah untuk dipaparkan.
        </p>
      ) : !fullImageReady ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Thumbnail dipaparkan dahulu. Hitbox aktif selepas imej penuh siap.
        </p>
      ) : mode === "tema" ? (
        <p className="text-sm text-indigo-700 dark:text-indigo-300">
          Mod Tema aktif. Anda akan dibawa terus ke halaman tema surah.
        </p>
      ) : !modeAllowsWordInteraction ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Mod Baca aktif. Tukar ke Faham untuk melihat makna perkataan.
        </p>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Ketik perkataan untuk melihat makna segera.
        </p>
      )}

      {selectedAyahDetail && mode === "read" ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/35"
          onClick={() => {
            setSelectedAyahKey(null);
          }}
        >
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
                onClick={() => {
                  setSelectedAyahKey(null);
                }}
                className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Tutup
              </button>
            </div>
            <p
              className="font-arabic mt-3 text-right text-2xl leading-loose text-stone-900 dark:text-stone-100"
              dir="rtl"
              lang="ar"
            >
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
