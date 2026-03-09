"use client";

import Image from "next/image";
import { useState } from "react";
import type {
  MushafPageManifest,
  MushafWordHitbox,
  MushafWordTranslationMap,
} from "@/types/mushaf";

interface MushafPageViewProps {
  pageNumber: number;
  imageAvailable: boolean;
  manifest: MushafPageManifest | null;
  wordTranslations: MushafWordTranslationMap;
}

function percent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function MushafPageView({
  pageNumber,
  imageAvailable,
  manifest,
  wordTranslations,
}: MushafPageViewProps) {
  const [selectedWord, setSelectedWord] = useState<MushafWordHitbox | null>(
    null,
  );
  const [imageFailed, setImageFailed] = useState(false);

  const imageWidth = manifest?.image_width ?? 1200;
  const imageHeight = manifest?.image_height ?? 1920;
  const words = manifest?.words ?? [];
  const canShowImage = imageAvailable && !imageFailed;
  const selectedTranslation = selectedWord
    ? wordTranslations[selectedWord.location] ?? null
    : null;
  const tooltipAnchor = selectedWord
    ? {
        left: clamp(
          ((selectedWord.x + selectedWord.width / 2) / imageWidth) * 100,
          12,
          88,
        ),
        top: ((selectedWord.y + selectedWord.height / 2) / imageHeight) * 100,
        showBelow: selectedWord.y < imageHeight * 0.18,
      }
    : null;

  return (
    <section className="space-y-3">
      <div
        className="relative overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-sm"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
      >
        {canShowImage ? (
          <>
            <Image
              src={`/api/mushaf/page/${pageNumber}`}
              alt={`Halaman mushaf ${pageNumber}`}
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 960px"
              className="object-contain"
              onError={() => setImageFailed(true)}
            />
            {words.length > 0 ? (
              <div
                className="absolute inset-0"
                onClick={() => setSelectedWord(null)}
              >
                {words.map((word, index) => (
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
                      left: percent(word.x, imageWidth),
                      top: percent(word.y, imageHeight),
                      width: percent(word.width, imageWidth),
                      height: percent(word.height, imageHeight),
                    }}
                  />
                ))}
                {selectedWord ? (
                  <div
                    className="pointer-events-none absolute border-2 border-amber-500"
                    style={{
                      left: percent(selectedWord.x, imageWidth),
                      top: percent(selectedWord.y, imageHeight),
                      width: percent(selectedWord.width, imageWidth),
                      height: percent(selectedWord.height, imageHeight),
                    }}
                  />
                ) : null}
                {selectedWord && tooltipAnchor ? (
                  <div
                    data-testid="word-tooltip"
                    className="pointer-events-none absolute z-20 w-[min(84vw,21rem)] max-w-sm rounded-xl border border-stone-300 bg-white/95 px-3 py-2 text-xs text-stone-800 shadow-lg backdrop-blur-sm"
                    style={{
                      left: `${tooltipAnchor.left}%`,
                      top: `${tooltipAnchor.top}%`,
                      transform: tooltipAnchor.showBelow
                        ? "translate(-50%, 14px)"
                        : "translate(-50%, calc(-100% - 14px))",
                    }}
                  >
                    <p className="font-medium text-stone-900">
                      {selectedTranslation?.bm ?? "Tiada terjemahan"}
                    </p>
                    <p className="text-stone-600">
                      {selectedTranslation?.en ?? "No translation"}
                    </p>
                    <p className="mt-1 text-[11px] text-stone-500">
                      {selectedWord.location}
                    </p>
                    <div
                      className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-stone-300 bg-white/95"
                      style={{
                        top: tooltipAnchor.showBelow ? "-6px" : undefined,
                        bottom: tooltipAnchor.showBelow ? undefined : "-6px",
                        borderTopWidth: tooltipAnchor.showBelow ? 1 : 0,
                        borderLeftWidth: tooltipAnchor.showBelow ? 1 : 0,
                        borderRightWidth: tooltipAnchor.showBelow ? 0 : 1,
                        borderBottomWidth: tooltipAnchor.showBelow ? 0 : 1,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-600">
            Imej halaman {pageNumber} belum tersedia lagi.
          </div>
        )}
      </div>

      {!manifest ? (
        <p className="text-sm text-stone-600">
          Manifest tidak ditemui. Halaman dipaparkan tanpa hitbox.
        </p>
      ) : words.length === 0 ? (
        <p className="text-sm text-stone-600">
          Manifest dijumpai, tetapi tiada hitbox sah untuk dipaparkan.
        </p>
      ) : (
        <p className="text-sm text-stone-600">
          Tap pada perkataan untuk lihat makna segera.
        </p>
      )}
    </section>
  );
}
