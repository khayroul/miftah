"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import type {
  MushafPageManifest,
  MushafWordHitbox,
} from "@/types/mushaf";

interface AyahBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ReadOnlyMushafPageViewProps {
  pageNumber: number;
  fullImageSrc?: string | null;
  imageAvailable: boolean;
  mobileImageSrc?: string | null;
  thumbnailAvailable: boolean;
  thumbnailSrc?: string | null;
  manifest: MushafPageManifest | null;
  onNavigatePrevPage?: () => void;
  onNavigateNextPage?: () => void;
  onCanvasTap?: () => void;
  onAyahAudioTap?: (ayahKey: string) => void;
  audioDiscovered?: boolean;
  onAudioDiscovered?: () => void;
  onFullImageReadyChange?: (ready: boolean) => void;
  activePlaybackAyahKey?: string | null;
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

function getAyahKeyFromWord(word: MushafWordHitbox): string | null {
  const surah = word.surah;
  const ayah = word.ayah;
  const explicitAyahKey =
    typeof surah === "number" && typeof ayah === "number"
      ? `${surah}:${ayah}`
      : word.location.split(":").slice(0, 2).join(":");
  return explicitAyahKey.includes(":") ? explicitAyahKey : null;
}

export function ReadOnlyMushafPageView({
  pageNumber,
  fullImageSrc = null,
  imageAvailable,
  mobileImageSrc = null,
  thumbnailAvailable,
  thumbnailSrc = null,
  manifest,
  onNavigatePrevPage,
  onNavigateNextPage,
  onCanvasTap,
  onAyahAudioTap,
  audioDiscovered = true,
  onAudioDiscovered,
  onFullImageReadyChange,
  activePlaybackAyahKey = null,
}: ReadOnlyMushafPageViewProps) {
  const [fullImageReady, setFullImageReady] = useState(false);
  const [fullImageFailed, setFullImageFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [showDiscoveryHint, setShowDiscoveryHint] = useState(!audioDiscovered);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const imageWidth = manifest?.image_width ?? 1200;
  const imageHeight = manifest?.image_height ?? 1920;
  const words = useMemo(() => manifest?.words ?? [], [manifest]);
  const canShowFullImage = imageAvailable && !fullImageFailed;
  const canShowThumbnail = thumbnailAvailable && !thumbnailFailed;
  const canShowAnyImage = canShowFullImage || canShowThumbnail;
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

    return Array.from(map.entries())
      .map(([key, box]) => ({ key, box }))
      .sort((a, b) => {
        if (a.box.y !== b.box.y) {
          return a.box.y - b.box.y;
        }
        return a.box.x - b.box.x;
      });
  }, [words]);

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
    return lineSegments.map((segment) =>
      expandHitbox(segment, paddingX, paddingY, imageWidth, imageHeight),
    );
  }, [activePlaybackAyahKey, fullImageReady, imageHeight, imageWidth, words]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setShowDiscoveryHint(!audioDiscovered);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [audioDiscovered]);

  useEffect(() => {
    if (!showDiscoveryHint || !canShowFullImage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setShowDiscoveryHint(false);
    }, 2600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [canShowFullImage, showDiscoveryHint]);

  useEffect(() => {
    onFullImageReadyChange?.(fullImageReady);
  }, [fullImageReady, onFullImageReadyChange]);

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
      {showDiscoveryHint && canShowFullImage ? (
        <div className="flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm animate-in fade-in duration-300 sm:px-4 sm:py-2 sm:text-base dark:bg-emerald-900/30 dark:text-emerald-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Tip: Ketik halaman atau buka Audio untuk dengar bacaan
          </div>
        </div>
      ) : null}

      <div
        className="relative cursor-pointer rounded-2xl border border-stone-300 bg-[#fffdfa] shadow-[0_18px_34px_-30px_rgba(28,25,23,0.7)] dark:border-[#162a44] dark:bg-[#0d1b2a] dark:shadow-[0_22px_38px_-30px_rgba(2,6,23,0.95)]"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          onAudioDiscovered?.();
          setShowDiscoveryHint(false);
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
                  ref={(el) => {
                    if (el?.complete && el.naturalWidth > 0 && !fullImageReady) {
                      setFullImageReady(true);
                    }
                  }}
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
                  }}
                />
              </picture>
            ) : null}
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
            {fullImageReady
              ? ayahBoxes.map(({ key, box }) => (
                  <button
                    key={`ayah-audio-${key}`}
                    type="button"
                    aria-label={`Main ayat ${key}`}
                    title={`Main ayat ${key}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAudioDiscovered?.();
                      setShowDiscoveryHint(false);
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
                ))
              : null}
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
      ) : !fullImageReady ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Thumbnail dipaparkan dahulu. Halaman penuh menyusul sebaik muat turun siap.
        </p>
      ) : (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Mod Baca: Leret untuk tukar halaman. <strong>Ketik ayat untuk mula bacaan dari situ, atau gunakan butang Audio.</strong>
        </p>
      )}
    </section>
  );
}
