"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, type TouchEvent } from "react";
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

export function MushafPageView({
  pageNumber,
  imageAvailable,
  thumbnailAvailable,
  manifest,
  wordTranslations,
  ayahDetails,
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
  const activeWord = canInteract ? selectedWord : null;
  const wordTapPaddingX = Math.max(8, imageWidth * 0.004);
  const wordTapPaddingY = Math.max(8, imageHeight * 0.003);
  const selectedTranslation = activeWord
    ? wordTranslations[activeWord.location] ?? null
    : null;
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
      const surah = word.surah;
      const ayah = word.ayah;
      const ayahKey =
        typeof surah === "number" && typeof ayah === "number"
          ? `${surah}:${ayah}`
          : word.location.split(":").slice(0, 2).join(":");

      if (!ayahKey.includes(":")) {
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
  const ayahOverlayTargets = useMemo(
    () =>
      Array.from(ayahBoxes.entries()).map(([key, box]) => ({
        key,
        box,
        detail: ayahDetailsMap.get(key) ?? null,
      })),
    [ayahBoxes, ayahDetailsMap],
  );
  const selectedAyahDetail = selectedAyahKey && canTapAyah
    ? ayahDetailsMap.get(selectedAyahKey) ?? null
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
        className="relative overflow-visible rounded-2xl border border-stone-300 bg-[#fffdfa] shadow-[0_18px_34px_-30px_rgba(28,25,23,0.7)] dark:border-stone-600 dark:bg-[#fffdfa] dark:shadow-[0_22px_38px_-30px_rgba(2,6,23,0.9)]"
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
                className={`object-contain transition-opacity duration-200 ${
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
                className={`object-contain transition-opacity duration-200 ${
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
                        setSelectedWord((current) =>
                          current?.location === word.location ? null : word,
                        );
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
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-600 dark:text-stone-300">
            Imej halaman {pageNumber} belum tersedia lagi.
          </div>
        )}
      </div>

      <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {pageNumber > 1 ? (
          <Link
            href={`/read/${pageNumber - 1}`}
            className="justify-self-start rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Prev
          </Link>
        ) : (
          <span className="justify-self-start rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
            Prev
          </span>
        )}
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Page {pageNumber} / 604
        </span>
        {pageNumber < 604 ? (
          <Link
            href={`/read/${pageNumber + 1}`}
            className="justify-self-end rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Next
          </Link>
        ) : (
          <span className="justify-self-end rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
            Next
          </span>
        )}
      </nav>

      {activeWord ? (
        <article
          data-testid="word-tooltip"
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
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

      {!manifest ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Manifest tidak ditemui. Halaman dipaparkan tanpa hitbox.
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
