"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
  type ReactNode,
} from "react";
import {
  getDifficultAyahs,
  toggleDifficultAyah,
} from "@/lib/hifz/difficultAyahs";
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
  fullImageSrc?: string | null;
  imageAvailable: boolean;
  mobileImageSrc?: string | null;
  thumbnailAvailable: boolean;
  thumbnailSrc?: string | null;
  manifest: MushafPageManifest | null;
  wordTranslations: MushafWordTranslationMap;
  ayahDetails: MushafAyahDetail[];
  memorizedAyahKeys: string[];
  hifzRevealByThirdsEnabled?: boolean;
  onNavigatePrevPage?: () => void;
  onNavigateNextPage?: () => void;
  onCanvasTap?: () => void;
  onAyahAudioTap?: (ayahKey: string) => void;
  audioDiscovered?: boolean;
  onAudioDiscovered?: () => void;
  onFullImageReadyChange?: (ready: boolean) => void;
  activePlaybackAyahKey?: string | null;
  isAudioDockVisible?: boolean;
  onPlayableAyahKeysChange?: (ayahKeys: string[] | null) => void;
  hifzFirstWordCueEnabled?: boolean;
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
  
  // If the word is in the lower 45% of the page, flip the tooltip to appear above the word
  // to prevent it from being cut off by the bottom of the viewport or floating docks.
  const isBottomHalf = word.y > imageHeight * 0.55;
  
  const top = isBottomHalf 
    ? fallbackTop 
    : (preferredTop + estimatedTooltipHeight <= imageHeight - verticalPadding 
        ? preferredTop 
        : fallbackTop);

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

function isFirstWordOfAyah(word: MushafWordHitbox): boolean {
  if (typeof word.wordPosition === "number") {
    return word.wordPosition === 1;
  }

  const locationParts = word.location.split(":");
  const maybeWordPosition = Number.parseInt(
    locationParts[locationParts.length - 1] ?? "",
    10,
  );
  return Number.isInteger(maybeWordPosition) && maybeWordPosition === 1;
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

function trackHifzUiEvent(
  eventName: "hafal_click" | "hafal_success" | "hafal_fail",
  payload: Record<string, unknown>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("miftah:hifz-ui", {
      detail: {
        eventName,
        ...payload,
      },
    }),
  );

  const maybeGtag = Reflect.get(window, "gtag");
  if (typeof maybeGtag === "function") {
    maybeGtag("event", eventName, payload);
  }
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
  fullImageSrc = null,
  imageAvailable,
  mobileImageSrc = null,
  thumbnailAvailable,
  thumbnailSrc = null,
  manifest,
  wordTranslations,
  ayahDetails,
  memorizedAyahKeys,
  hifzRevealByThirdsEnabled = false,
  onNavigatePrevPage,
  onNavigateNextPage,
  onCanvasTap,
  onAyahAudioTap,
  audioDiscovered = true,
  onAudioDiscovered,
  onFullImageReadyChange,
  activePlaybackAyahKey = null,
  isAudioDockVisible = false,
  onPlayableAyahKeysChange,
  hifzFirstWordCueEnabled = false,
}: MushafPageViewProps) {
  const [selectedWord, setSelectedWord] = useState<MushafWordHitbox | null>(
    null,
  );
  const [selectedAyahKey, setSelectedAyahKey] = useState<string | null>(null);
  const [fullImageReady, setFullImageReady] = useState(false);
  const [fullImageFailed, setFullImageFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [showDiscoveryHint, setShowDiscoveryHint] = useState(!audioDiscovered);
  const [markingMemorized, setMarkingMemorized] = useState(false);
  const [markMemorizedError, setMarkMemorizedError] = useState<string | null>(
    null,
  );
  const [hifzFeedbackMessage, setHifzFeedbackMessage] = useState<string | null>(
    null,
  );
  const [memorizedAyahKeySet, setMemorizedAyahKeySet] = useState(
    () => new Set(memorizedAyahKeys),
  );
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const [difficultAyahSet, setDifficultAyahSet] = useState<Set<string>>(() => getDifficultAyahs());
  const [difficultToast, setDifficultToast] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLongPress = useCallback((word: MushafWordHitbox) => {
    const ayahKey = getAyahKeyFromWord(word);
    if (!ayahKey) return;
    const nowDifficult = toggleDifficultAyah(ayahKey);
    setDifficultAyahSet(getDifficultAyahs());
    setDifficultToast(nowDifficult ? `${ayahKey} ditanda susah` : `${ayahKey} tanda dibuang`);
    setTimeout(() => setDifficultToast(null), 2000);
  }, []);

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
  const modeAllowsWordInteraction = mode === "faham";
  const canInteract = modeAllowsWordInteraction && canInteractWhenReady;
  const canSelectAyah = false; // Disabled by user request to prevent WBW conflict
  const needsAyahLayout = mode === "hifz" || canSelectAyah;
  const needsLineCenters = mode === "hifz" && hifzRevealByThirdsEnabled;
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
    if (!needsAyahLayout) {
      return new Map<string, AyahBoundingBox>();
    }

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
  }, [needsAyahLayout, words]);
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
    () => (needsLineCenters ? deriveLineCenters(words, imageHeight) : []),
    [imageHeight, needsLineCenters, words],
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
  const firstWordCueActive = mode === "hifz" && hifzFirstWordCueEnabled;
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
  const activePlaybackAyahSegments = useMemo(() => {
    if (!activePlaybackAyahKey || !fullImageReady) {
      return [] as AyahBoundingBox[];
    }

    const ayahWords = words.filter((word) => {
      const ayahKey = getAyahKeyFromWord(word);
      return ayahKey === activePlaybackAyahKey;
    });
    if (ayahWords.length === 0) {
      return [] as AyahBoundingBox[];
    }

    const lineThreshold = Math.max(16, imageHeight / 70);
    const sortedWords = [...ayahWords].sort((a, b) => {
      const aCenterY = a.y + a.height / 2;
      const bCenterY = b.y + b.height / 2;
      if (Math.abs(aCenterY - bCenterY) > lineThreshold) {
        return aCenterY - bCenterY;
      }
      return a.x - b.x;
    });

    const lineSegments: AyahBoundingBox[] = [];
    for (const word of sortedWords) {
      const current = lineSegments[lineSegments.length - 1];
      if (!current) {
        lineSegments.push({
          x: word.x,
          y: word.y,
          width: word.width,
          height: word.height,
        });
        continue;
      }

      const currentCenterY = current.y + current.height / 2;
      const wordCenterY = word.y + word.height / 2;
      if (Math.abs(wordCenterY - currentCenterY) > lineThreshold) {
        lineSegments.push({
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
      current.x = minX;
      current.y = minY;
      current.width = maxX - minX;
      current.height = maxY - minY;
    }

    const paddingX = Math.max(8, imageWidth * 0.004);
    const paddingY = Math.max(6, imageHeight * 0.003);
    return lineSegments
      .map((segment) =>
        expandHitbox(
          segment,
          paddingX,
          paddingY,
          imageWidth,
          imageHeight,
        ),
      )
      .flatMap((expanded) => {
        if (expanded.y >= revealVisibleBoundaryY) {
          return [];
        }
        const clippedHeight = Math.min(
          expanded.height,
          revealVisibleBoundaryY - expanded.y,
        );
        if (clippedHeight <= 1) {
          return [];
        }
        return [{ ...expanded, height: clippedHeight }];
      });
  }, [
    activePlaybackAyahKey,
    fullImageReady,
    imageHeight,
    imageWidth,
    revealVisibleBoundaryY,
    words,
  ]);
  const firstWordCueMasks = useMemo(() => {
    if (!firstWordCueActive) {
      return [] as AyahBoundingBox[];
    }

    const paddingX = Math.max(2, imageWidth * 0.0012);
    const paddingY = Math.max(2, imageHeight * 0.0012);
    return words
      .filter((word) => !isFirstWordOfAyah(word))
      .map((word) =>
        expandHitbox(
          {
            x: word.x,
            y: word.y,
            width: word.width,
            height: word.height,
          },
          paddingX,
          paddingY,
          imageWidth,
          imageHeight,
        ),
      )
      .flatMap((box) => {
        if (box.y >= revealVisibleBoundaryY) {
          return [];
        }
        const clippedHeight = Math.min(
          box.height,
          revealVisibleBoundaryY - box.y,
        );
        if (clippedHeight <= 1) {
          return [];
        }
        return [{ ...box, height: clippedHeight }];
      });
  }, [
    firstWordCueActive,
    imageHeight,
    imageWidth,
    revealVisibleBoundaryY,
    words,
  ]);
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
  const memorizedOnPageCount = useMemo(
    () =>
      ayahLayoutEntries.filter((entry) => memorizedAyahKeySet.has(entry.key))
        .length,
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
  const hifzPlayableAyahKeys = useMemo(() => {
    if (mode !== "hifz" || !hifzRevealByThirdsEnabled || !hifzRevealContext) {
      return null;
    }

    if (hifzRevealContext.stage === 1) {
      return hifzRevealContext.firstSegmentAyahKeys.length > 0
        ? hifzRevealContext.firstSegmentAyahKeys
        : null;
    }

    if (hifzRevealContext.stage === 2) {
      const unlockedKeys = [
        ...hifzRevealContext.firstSegmentAyahKeys,
        ...hifzRevealContext.secondSegmentAyahKeys,
      ];
      return unlockedKeys.length > 0 ? Array.from(new Set(unlockedKeys)) : null;
    }

    const allPageKeys = ayahLayoutEntries.map((entry) => entry.key);
    return allPageKeys.length > 0 ? allPageKeys : null;
  }, [ayahLayoutEntries, hifzRevealByThirdsEnabled, hifzRevealContext, mode]);
  const audioTapAyahTargets = useMemo(() => {
    if (!fullImageReady || !onAyahAudioTap || modeAllowsWordInteraction) {
      return [] as typeof ayahOverlayTargets;
    }

    if (mode !== "read" && mode !== "hifz") {
      return [] as typeof ayahOverlayTargets;
    }

    if (mode === "hifz" && hifzPlayableAyahKeys) {
      const playableAyahKeySet = new Set(hifzPlayableAyahKeys);
      return ayahOverlayTargets.filter(({ key }) => playableAyahKeySet.has(key));
    }

    return ayahOverlayTargets;
  }, [
    ayahOverlayTargets,
    fullImageReady,
    hifzPlayableAyahKeys,
    mode,
    modeAllowsWordInteraction,
    onAyahAudioTap,
  ]);
  const canMarkHifz = mode === "hifz" && remainingAyahKeys.length > 0;
  const showHifzSessionControls =
    mode === "hifz" && canShowAnyImage && hifzRevealByThirdsEnabled;
  const hifzTargetStage = hifzRevealSessionActive ? hifzRevealContext.stage : 3;
  const hifzCompletedStageCount = allAyatMemorized
    ? 3
    : hifzRevealSessionActive
      ? Math.max(hifzTargetStage - 1, 0)
      : 0;
  const hifzActiveStage = allAyatMemorized
    ? null
    : hifzRevealSessionActive
      ? Math.min(hifzTargetStage, 3)
      : null;
  const hifzStages = [
    { label: "1/3", step: 1 },
    { label: "2/3", step: 2 },
    { label: "Penuh", step: 3 },
  ] as const;
  const hifzActionHint = hifzRevealSessionActive
    ? "Tekan sekali untuk buka bahagian seterusnya."
    : "Semua ayat pada halaman ini akan ditanda sebagai hafal.";
  const hifzProgressHint =
    ayahLayoutEntries.length > 0
      ? `${memorizedOnPageCount}/${ayahLayoutEntries.length} ayat sudah ditanda hafal`
      : "Tiada ayat ditemui pada halaman ini";
  const hifzHafalButtonLabel = allAyatMemorized
    ? "Halaman Sudah Hafal"
    : markingMemorized
      ? "Menyimpan..."
      : !canMarkHifz
        ? "Tiada Ayat Untuk Ditanda"
        : !hifzRevealSessionActive
          ? "Sahkan Hafal Halaman"
          : hifzRevealContext?.stage === 1
            ? "Sahkan Hafal 1/3 Pertama"
            : hifzRevealContext?.stage === 2
              ? "Sahkan Hafal 1/3 Kedua"
              : "Sahkan Hafal Baki Halaman";
  useEffect(() => {
    setShowDiscoveryHint(!audioDiscovered);
  }, [audioDiscovered]);
  useEffect(() => {
    if (!showDiscoveryHint || mode !== "read") {
      return;
    }
    const timer = window.setTimeout(() => {
      setShowDiscoveryHint(false);
    }, 2600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [mode, showDiscoveryHint]);
  useEffect(() => {
    if (!hifzFeedbackMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHifzFeedbackMessage(null);
    }, 2600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [hifzFeedbackMessage]);
  useEffect(() => {
    onPlayableAyahKeysChange?.(hifzPlayableAyahKeys);
  }, [hifzPlayableAyahKeys, onPlayableAyahKeysChange]);
  useEffect(() => {
    onFullImageReadyChange?.(fullImageReady);
  }, [fullImageReady, onFullImageReadyChange]);
  useEffect(() => {
    return () => {
      onPlayableAyahKeysChange?.(null);
    };
  }, [onPlayableAyahKeysChange]);

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

    const completedStageLabel = !hifzRevealSessionActive
      ? "Halaman selesai ditanda hafal."
      : hifzRevealContext?.stage === 1
        ? "1/3 pertama selesai."
        : hifzRevealContext?.stage === 2
          ? "2/3 selesai."
          : "Baki halaman selesai.";

    setMarkingMemorized(true);
    setMarkMemorizedError(null);
    setHifzFeedbackMessage(null);
    trackHifzUiEvent("hafal_click", {
      pageNumber,
      stage: hifzRevealContext?.stage ?? null,
      targetCount: targetAyahIds.length,
    });
    try {
      const response = await fetch("/api/hifz/mark-memorized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ayahIds: targetAyahIds }),
      });
      if (!response.ok) {
        setMarkMemorizedError("Gagal simpan status hafal. Cuba lagi.");
        trackHifzUiEvent("hafal_fail", {
          pageNumber,
          stage: hifzRevealContext?.stage ?? null,
          reason: "response_not_ok",
        });
        return;
      }
      setMemorizedAyahKeySet((current) => {
        const next = new Set(current);
        for (const key of targetAyahKeys) {
          next.add(key);
        }
        return next;
      });
      setHifzFeedbackMessage(completedStageLabel);
      trackHifzUiEvent("hafal_success", {
        pageNumber,
        stage: hifzRevealContext?.stage ?? null,
        targetCount: targetAyahIds.length,
      });
    } catch {
      setMarkMemorizedError("Gagal simpan status hafal. Cuba lagi.");
      trackHifzUiEvent("hafal_fail", {
        pageNumber,
        stage: hifzRevealContext?.stage ?? null,
        reason: "network_or_exception",
      });
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

  const wordHitboxButtons = useMemo(() => {
    if (!canInteract) {
      return [] as ReactNode[];
    }

    return words.map((word, index) => {
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
            setShowDiscoveryHint(false);
            setSelectedAyahKey(null);
            setSelectedWord(word);
          }}
          onTouchStart={(event) => {
            event.stopPropagation();
            setShowDiscoveryHint(false);
            setSelectedAyahKey(null);
            setSelectedWord(word);
          }}
          onTouchEnd={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={() => {
            longPressTimerRef.current = setTimeout(() => {
              handleLongPress(word);
              longPressTimerRef.current = null;
            }, 600);
          }}
          onPointerUp={() => {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
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
    });
  }, [
    canInteract,
    handleLongPress,
    imageHeight,
    imageWidth,
    wordTapPaddingX,
    wordTapPaddingY,
    words,
  ]);

  return (
    <section
      className={`space-y-3 ${
        showHifzSessionControls
          ? isAudioDockVisible
            ? "pb-64 sm:pb-0"
            : "pb-40 sm:pb-0"
          : ""
      }`}
    >
      {/* Discovery Hint */}
      {showDiscoveryHint && mode === "read" && canShowFullImage && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm animate-in fade-in duration-300 sm:px-4 sm:py-2 sm:text-base dark:bg-emerald-900/30 dark:text-emerald-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Tip: Ketik halaman atau buka Audio untuk dengar bacaan
          </div>
        </div>
      )}

      {showHifzSessionControls ? (
        <>
          <div className="sticky top-2 z-40 hidden sm:block">
            <div className="rounded-2xl border border-teal-200 bg-white/96 p-4 shadow-[0_16px_36px_rgba(13,148,136,0.16)] backdrop-blur dark:border-teal-900/60 dark:bg-stone-900/95">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {hifzStages.map((stage) => {
                    const isDone = stage.step <= hifzCompletedStageCount;
                    const isActive = stage.step === hifzActiveStage;
                    return (
                      <span
                        key={stage.step}
                        className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition ${
                          isDone
                            ? "border-teal-600 bg-teal-600 text-white dark:border-teal-400 dark:bg-teal-500 dark:text-stone-950"
                            : isActive
                              ? "border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-900/45 dark:text-teal-100"
                              : "border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                        }`}
                      >
                        {stage.label}
                      </span>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={allAyatMemorized || markingMemorized || !canMarkHifz}
                  onClick={handleMarkHifzMemorized}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-teal-900 px-6 text-[15px] font-semibold text-teal-50 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  {hifzHafalButtonLabel}
                </button>
              </div>
              <p className="mt-3 text-sm text-teal-800 dark:text-teal-200">
                {hifzActionHint} {hifzProgressHint}
              </p>
              {hifzFeedbackMessage ? (
                <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {hifzFeedbackMessage}
                </p>
              ) : null}
              {markMemorizedError ? (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {markMemorizedError}
                </p>
              ) : null}
            </div>
          </div>

          <div
            className={`fixed inset-x-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] sm:hidden ${
              isAudioDockVisible ? "bottom-[104px]" : "bottom-0"
            }`}
          >
            <div className="rounded-2xl border border-teal-200 bg-white/96 p-3 shadow-[0_14px_34px_rgba(13,148,136,0.22)] backdrop-blur dark:border-teal-900/60 dark:bg-stone-900/95">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {hifzStages.map((stage) => {
                  const isDone = stage.step <= hifzCompletedStageCount;
                  const isActive = stage.step === hifzActiveStage;
                  return (
                    <span
                      key={`mobile-${stage.step}`}
                      className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${
                        isDone
                          ? "border-teal-600 bg-teal-600 text-white dark:border-teal-400 dark:bg-teal-500 dark:text-stone-950"
                          : isActive
                            ? "border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-900/45 dark:text-teal-100"
                            : "border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                      }`}
                    >
                      {stage.label}
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={allAyatMemorized || markingMemorized || !canMarkHifz}
                onClick={handleMarkHifzMemorized}
                className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-teal-900 px-4 text-sm font-semibold text-teal-50 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                {hifzHafalButtonLabel}
              </button>
              <p className="mt-2 text-xs text-teal-800 dark:text-teal-200">
                {hifzActionHint}
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-300">
                {hifzProgressHint}
              </p>
              {hifzFeedbackMessage ? (
                <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {hifzFeedbackMessage}
                </p>
              ) : null}
              {markMemorizedError ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {markMemorizedError}
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <div
        className="relative overflow-visible cursor-pointer rounded-2xl border border-stone-300 bg-[#fffdfa] shadow-[0_18px_34px_-30px_rgba(28,25,23,0.7)] dark:border-[#162a44] dark:bg-[#0d1b2a] dark:shadow-[0_22px_38px_-30px_rgba(2,6,23,0.95)]"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          onAudioDiscovered?.();
          setShowDiscoveryHint(false);
          setSelectedAyahKey(null);
          setSelectedWord(null);
          setMarkMemorizedError(null);
          onCanvasTap?.();
        }}
      >
        {canShowAnyImage ? (
          <>
            {canShowThumbnail ? (
              <img
                src={thumbnailSrc ?? `/api/mushaf/page/${pageNumber}?variant=thumb&v=qcfv2`}
                alt={`Thumbnail halaman mushaf ${pageNumber}`}
                loading="eager"
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 dark:invert dark:[mix-blend-mode:lighten] ${
                  fullImageReady ? "opacity-0" : "opacity-100"
                }`}
                onError={() => setThumbnailFailed(true)}
              />
            ) : null}
            {canShowFullImage ? (
              <picture>
                {mobileImageSrc ? (
                  <source media="(max-width: 768px)" srcSet={mobileImageSrc} />
                ) : null}
                <img
                  src={fullImageSrc ?? `/api/mushaf/page/${pageNumber}?v=qcfv2`}
                  alt={`Halaman mushaf ${pageNumber}`}
                  loading="eager"
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 dark:invert dark:[mix-blend-mode:lighten] ${
                    fullImageReady ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={() => setFullImageReady(true)}
                  onError={() => {
                    setFullImageFailed(true);
                    setFullImageReady(false);
                    setSelectedWord(null);
                  }}
                />
              </picture>
            ) : null}
            {canSelectAyah
              ? selectableAyahTargets.map(({ key, box, detail }) => (
                  <button
                    key={`ayah-${key}`}
                    type="button"
                    aria-label={`Ayat ${key}`}
                    title={detail?.label ?? key}
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowDiscoveryHint(false);
                      setMarkMemorizedError(null);
                      setSelectedWord(null);
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
                ))
              : null}
            {audioTapAyahTargets.map(({ key, box, detail }) => (
              <button
                key={`ayah-audio-${key}`}
                type="button"
                aria-label={`Main ayat ${key}`}
                title={`Main ayat ${detail?.label ?? key}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAudioDiscovered?.();
                  setShowDiscoveryHint(false);
                  setMarkMemorizedError(null);
                  setSelectedAyahKey(null);
                  setSelectedWord(null);
                  onAyahAudioTap?.(key);
                }}
                className="absolute cursor-pointer bg-transparent focus-visible:bg-sky-300/15 focus-visible:outline-none"
                style={{
                  left: percent(box.x, imageWidth),
                  top: percent(box.y, imageHeight),
                  width: percent(box.width, imageWidth),
                  height: percent(box.height, imageHeight),
                }}
              />
            ))}
            {!fullImageReady && canShowFullImage ? (
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4">
                <span className="rounded-full border border-stone-300 bg-white/90 px-3 py-1 text-sm text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-300">
                  Loading full page...
                </span>
              </div>
            ) : null}
            {activePlaybackAyahSegments.map((segment, index) => (
              <div
                key={`playback-ayah-segment-${index}`}
                className="pointer-events-none absolute rounded-md border-2 border-sky-500/90 bg-sky-400/10 shadow-[0_0_0_1px_rgba(14,165,233,0.16)] transition-all"
                style={{
                  left: percent(segment.x, imageWidth),
                  top: percent(segment.y, imageHeight),
                  width: percent(segment.width, imageWidth),
                  height: percent(segment.height, imageHeight),
                }}
              />
            ))}
            {firstWordCueMasks.map((box, index) => (
              <div
                key={`first-word-cue-mask-${index}`}
                className="pointer-events-none absolute rounded-sm bg-[#fffdfa] dark:bg-[#0d1b2a]"
                style={{
                  left: percent(box.x, imageWidth),
                  top: percent(box.y, imageHeight),
                  width: percent(box.width, imageWidth),
                  height: percent(box.height, imageHeight),
                }}
              />
            ))}
            {difficultToast ? (
              <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-stone-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                {difficultToast}
              </div>
            ) : null}
            {canInteract ? (
              <>
                {wordHitboxButtons}
                {/* Difficult ayah dots */}
                {words.map((word, index) => {
                  const ayahKey = getAyahKeyFromWord(word);
                  if (!ayahKey || !difficultAyahSet.has(ayahKey)) return null;
                  // Only show dot on first word of each ayah
                  const wordPos = word.location.split(":")[2];
                  if (wordPos !== "1") return null;
                  return (
                    <span
                      key={`diff-${ayahKey}-${index}`}
                      className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-red-500"
                      style={{
                        left: percent(word.x + word.width - 2, imageWidth),
                        top: percent(word.y, imageHeight),
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
                    <p className="mt-1 text-xs text-stone-500 sm:text-sm dark:text-stone-400">
                      {activeWord.location}
                    </p>
                  </article>
                ) : null}
              </>
            ) : null}
            {hifzRevealContext && revealEnabled && revealMaskTop ? (
              <div
                className="absolute left-0 right-0 bottom-0 z-30 border-t border-dashed border-teal-500/60 bg-[#fffdfa] transition-[top] duration-500 ease-out dark:bg-[#0d1b2a]"
                style={{ top: revealMaskTop }}
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onTouchEnd={(event) => event.stopPropagation()}
              >
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-teal-500/40 bg-white/95 px-3 py-1 text-xs font-semibold tracking-wide text-teal-800 sm:text-sm dark:border-teal-300/40 dark:bg-stone-900/95 dark:text-teal-200">
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

      {!manifest ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Manifest tidak ditemui. Halaman dipaparkan tanpa hitbox.
        </p>
      ) : revealEnabled && hifzRevealContext ? (
        <p className="text-[15px] text-teal-700 sm:text-base dark:text-teal-300">
          Hifz reveal aktif: paparan {revealStageLabel(hifzRevealContext.stage)} halaman (sempadan ikut hujung ayat).
        </p>
      ) : mode === "hifz" && !hifzRevealByThirdsEnabled ? (
        <p className="text-[15px] text-teal-700 sm:text-base dark:text-teal-300">
          Paparan 1/3 sedang dimatikan. Aktifkan semula untuk memaparkan butang Hafal.
        </p>
      ) : mode === "read" ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Mod Baca: Leret untuk tukar halaman. <strong>Ketik ayat untuk mula bacaan dari situ, atau gunakan butang Audio.</strong>
        </p>
      ) : mode === "hifz" ? (
        <p className="text-[15px] text-teal-700 sm:text-base dark:text-teal-300">
          {firstWordCueActive
            ? "Mod Uji Hafazan aktif: hanya kata pertama setiap ayat dipaparkan."
            : "Gunakan butang Hafal untuk membuka 1/3 → 2/3 → penuh. "}
          <strong>Tekan ayat untuk dengar murattal.</strong>
        </p>
      ) : words.length === 0 ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Manifest dijumpai, tetapi tiada hitbox sah untuk dipaparkan.
        </p>
      ) : !fullImageReady ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Thumbnail dipaparkan dahulu. Hitbox aktif selepas imej penuh siap.
        </p>
      ) : mode === "tema" ? (
        <p className="text-[15px] text-indigo-700 sm:text-base dark:text-indigo-300">
          Mod Tema aktif. Anda akan dibawa terus ke halaman tema surah.
        </p>
      ) : !modeAllowsWordInteraction ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Mod Baca aktif. Tukar ke Faham untuk melihat makna perkataan.
        </p>
      ) : (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
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
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
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
              <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                EN: {selectedAyahDetail.en}
              </p>
            ) : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}
