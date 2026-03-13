"use client";

import { useRef, useState } from "react";
import { ReadPageVocabSection } from "@/components/ReadPageVocabSection";
import type { FahamLevelProgress } from "@/lib/faham/levels";
import type { ReadPageVocabPreviewItem } from "@/lib/faham/repository";

interface ReadPageVocabPreviewResponse {
  items: ReadPageVocabPreviewItem[];
  levelProgress: FahamLevelProgress;
}

function isReadPageVocabPreviewResponse(
  value: ReadPageVocabPreviewResponse | { error?: string },
): value is ReadPageVocabPreviewResponse {
  return (
    "items" in value &&
    Array.isArray(value.items) &&
    "levelProgress" in value &&
    typeof value.levelProgress === "object" &&
    value.levelProgress !== null
  );
}

interface ReadPageVocabPreviewLazyProps {
  ayahIds: number[];
  pageNumber: number;
}

export function ReadPageVocabPreviewLazy({
  ayahIds,
  pageNumber,
}: ReadPageVocabPreviewLazyProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<ReadPageVocabPreviewItem[] | null>(null);
  const [levelProgress, setLevelProgress] = useState<FahamLevelProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasRequestedRef = useRef(false);

  const handleToggle = () => {
    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);

    if (!nextExpanded || hasRequestedRef.current) {
      return;
    }

    hasRequestedRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    void fetch("/api/faham/read-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ayahIds,
        pageNumber,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | ReadPageVocabPreviewResponse
          | { error?: string };
        if (!response.ok) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Perkataan fokus tak dapat dimuatkan sekarang.",
          );
        }
        if (!isReadPageVocabPreviewResponse(payload)) {
          throw new Error("Perkataan fokus tak dapat dimuatkan sekarang.");
        }
        setItems(payload.items);
        setLevelProgress(payload.levelProgress);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Perkataan fokus tak dapat dimuatkan sekarang.";
        setLoadError(message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  if (levelProgress && items) {
    return (
      <ReadPageVocabSection
        items={items}
        levelProgress={levelProgress}
        pageNumber={pageNumber}
        loadError={loadError}
      />
    );
  }

  return (
    <section className="rounded-[28px] border border-stone-200/90 bg-white/92 p-4 shadow-[0_18px_42px_-34px_rgba(28,25,23,0.42)] backdrop-blur-sm dark:border-stone-700/80 dark:bg-stone-900/88 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            Faham Ringkas
          </p>
          <h2 className="mt-1 text-lg font-semibold text-stone-900 dark:text-stone-100">
            Perkataan untuk difahami
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            Preview ini dimuat hanya bila anda buka, supaya mushaf muncul lebih cepat.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          {isExpanded ? "Sembunyikan" : "Buka Preview"}
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-4 rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 dark:border-stone-700/70 dark:bg-stone-950/45">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {isLoading
              ? `Menyusun perkataan fokus untuk halaman ${pageNumber}.`
              : loadError ?? "Preview akan muncul di sini."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
