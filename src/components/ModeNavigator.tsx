"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { saveReadMode, type ReadMode } from "@/lib/readMode";
import { findMarkerForPage } from "@/lib/readNavigationUtils";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

interface ModeNavigatorProps {
  activeMode: ReadMode;
  fallbackReadPage?: number;
  fallbackThemeSurahId?: number;
  surahTargets?: Array<{
    page: number;
    surah: number;
  }>;
  onModeClick?: (mode: ReadMode, e: React.MouseEvent) => void;
}

const MODE_ITEMS: Array<{
  label: string;
  value: ReadMode;
}> = [
  { label: "Baca", value: "read" },
  { label: "Faham", value: "faham" },
  { label: "Tema", value: "tema" },
  { label: "Hafal", value: "hifz" },
];

function modeHref(params: {
  mode: ReadMode;
  readPage: number;
  themeSurahId: number;
}): string {
  if (params.mode === "read") {
    return `/read/${params.readPage}`;
  }
  if (params.mode === "tema") {
    return `/read/surah/${params.themeSurahId}/themes`;
  }
  if (params.mode === "hifz") {
    return `/read/${params.readPage}`;
  }
  return "/faham";
}

function isReadRoute(href: string): boolean {
  return href.startsWith("/read/");
}

export function ModeNavigator({
  activeMode,
  fallbackReadPage = 1,
  fallbackThemeSurahId = 1,
  surahTargets = [],
  onModeClick,
}: ModeNavigatorProps) {
  const readingState = useReadingProgressState();

  useEffect(() => {
    saveReadMode(activeMode);
  }, [activeMode]);

  const readPage = readingState.lastPage ?? fallbackReadPage;
  const derivedThemeSurahId = useMemo(() => {
    const marker = findMarkerForPage(
      surahTargets.map((target) => ({
        id: target.surah,
        page: target.page,
      })),
      readPage,
    );
    return marker?.id ?? fallbackThemeSurahId;
  }, [fallbackThemeSurahId, readPage, surahTargets]);

  return (
    <div className="flex w-full justify-center">
      <div className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-stone-200 bg-white/92 p-1.5 shadow-sm backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/88">
        <Link
          href="/"
          className="mr-1 flex items-center gap-1.5 rounded-full px-3 py-2 text-[15px] font-medium text-stone-600 transition hover:bg-stone-50 hover:text-stone-900 sm:text-base dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          title="Utama"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>
        {MODE_ITEMS.map((item) => {
          const active = item.value === activeMode;
          const href = modeHref({
            mode: item.value,
            readPage,
            themeSurahId: derivedThemeSurahId,
          });
          return (
            <Link
              key={item.value}
              href={href}
              prefetch={!isReadRoute(href)}
              onClick={(e) => {
                saveReadMode(item.value);
                if (onModeClick) {
                  onModeClick(item.value, e);
                }
              }}
              className={`rounded-full px-4 py-2 text-[15px] font-medium transition sm:text-base ${
                active
                  ? "bg-stone-900 text-stone-50 shadow-sm dark:bg-stone-100 dark:text-stone-900"
                  : "text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
