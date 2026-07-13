"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ThemePageContent } from "./ThemePageContent";
import type { Surah } from "@/types/database";
import type { AyahWordByWordEntry } from "@/lib/queries";
import type { ThemeAppearanceChunk } from "@/data/repositories/tema";

interface TemaApiResponse {
  readonly surahId: number;
  readonly chunks: ThemeAppearanceChunk[];
  readonly wbw: Record<number, AyahWordByWordEntry[]>;
  readonly prevSurahChunkCount: number | null;
}

interface TemaDataFetcherProps {
  readonly surahNumber: number;
  readonly surahMeta: Surah;
  readonly allSurahs: Surah[];
}

type FetchState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly data: TemaApiResponse }
  | { readonly kind: "error"; readonly message: string };

export function TemaDataFetcher({
  surahNumber,
  surahMeta,
  allSurahs,
}: TemaDataFetcherProps) {
  const searchParams = useSearchParams();
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "loading" });
  const cacheRef = useRef<Record<number, TemaApiResponse>>({});

  const fetchTemaData = useCallback(async (surah: number): Promise<void> => {
    const cached = cacheRef.current[surah];
    if (cached) {
      setFetchState({ kind: "loaded", data: cached });
      return;
    }

    setFetchState({ kind: "loading" });

    try {
      const response = await fetch(`/api/tema/${surah}`);
      if (!response.ok) {
        setFetchState({
          kind: "error",
          message: "Tema tidak dapat dimuatkan.",
        });
        return;
      }

      const data: TemaApiResponse = await response.json();
      cacheRef.current = { ...cacheRef.current, [surah]: data };
      setFetchState({ kind: "loaded", data });
    } catch {
      setFetchState({
        kind: "error",
        message: "Tema tidak dapat dimuatkan.",
      });
    }
  }, []);

  useEffect(() => {
    void fetchTemaData(surahNumber);
  }, [surahNumber, fetchTemaData]);

  if (fetchState.kind === "loading") {
    return <TemaLoadingSkeleton />;
  }

  if (fetchState.kind === "error") {
    return (
      <section className="flex flex-col items-center gap-4 rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
        <p>{fetchState.message}</p>
        <button
          type="button"
          onClick={() => void fetchTemaData(surahNumber)}
          className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
        >
          Cuba semula
        </button>
      </section>
    );
  }

  const { data } = fetchState;

  const chunkParam = searchParams.get("chunk");
  const parsedChunk = chunkParam ? Number.parseInt(chunkParam, 10) : 1;
  const selectedChunkIndex =
    data.chunks.length > 0
      ? Number.isInteger(parsedChunk)
        ? Math.min(Math.max(parsedChunk, 1), data.chunks.length)
        : 1
      : 1;

  return (
    <ThemePageContent
      surahNumber={surahNumber}
      surahMeta={surahMeta}
      allSurahs={allSurahs}
      chunks={data.chunks}
      wbw={data.wbw}
      selectedChunkIndex={selectedChunkIndex}
      prevSurahChunkCount={data.prevSurahChunkCount}
    />
  );
}

function TemaLoadingSkeleton() {
  return (
    <>
      <section
        className="rounded-2xl border border-stone-300 bg-white px-4 py-4 shadow-sm sm:px-5 dark:border-stone-600 dark:bg-stone-900"
        aria-hidden
      >
        <div className="mb-3 h-4 w-28 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="h-11 animate-pulse rounded-xl bg-stone-200/90 dark:bg-stone-800/90" />
      </section>

      <section
        className="rounded-[1.9rem] border border-stone-200/85 bg-white/92 p-5 shadow-[0_28px_80px_-52px_rgba(28,25,23,0.18)] dark:border-stone-700/80 dark:bg-stone-900/88 sm:p-6"
        aria-hidden
      >
        <div className="h-5 w-32 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="mt-4 h-9 w-3/4 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
        <div className="mt-3 h-4 w-40 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="mt-6 h-48 animate-pulse rounded-[1.5rem] bg-stone-100 dark:bg-stone-800/80" />
      </section>
    </>
  );
}
