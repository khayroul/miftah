"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { findMarkerForPage } from "../domain/readNavigationUtils";
import { saveReadMode, type ReadMode } from "../domain/readMode";
import { useReadingProgressState } from "../domain/useReadingProgressState";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";

const AuthStatusButton = dynamic(
  () =>
    import("@/features/auth/status-button").then(
      (module) => module.AuthStatusButton,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const ThemeToggle = dynamic(
  () =>
    import("@/components/ThemeToggle").then(
      (module) => module.ThemeToggle,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

interface ModeNavigatorProps {
  activeMode: ReadMode;
  fallbackReadPage?: number;
  fallbackThemeSurahId?: number;
  surahTargets?: Array<{
    page: number;
    surah: number;
  }>;
  onModeClick?: (mode: ReadMode, e: React.MouseEvent) => void;
  showUtilities?: boolean;
  showAuthStatus?: boolean;
  highlightHome?: boolean;
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
    return "/hifz";
  }
  return "/faham";
}

export function ModeNavigator({
  activeMode,
  fallbackReadPage = 1,
  fallbackThemeSurahId = 1,
  surahTargets = [],
  onModeClick,
  showUtilities = false,
  showAuthStatus = false,
  highlightHome = false,
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

  const utilityThemeToggle = showUtilities ? (
    <>
      <span
        className="mx-0.5 h-6 w-px shrink-0 bg-stone-200 sm:mx-1 dark:bg-stone-700"
        aria-hidden="true"
      />
      <ThemeToggle iconOnly embedded />
    </>
  ) : null;

  const navigator = (
    <nav
      aria-label="Navigasi utama Miftah"
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-[26px] border border-stone-200 bg-white/92 p-1 shadow-sm backdrop-blur-sm sm:gap-1 dark:border-stone-700 dark:bg-stone-900/88"
    >
      <OfflineAwareLink
        href="/"
        prefetch={false}
        aria-current={highlightHome ? "page" : undefined}
        aria-label="Utama"
        className={`mr-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:mr-1 sm:text-base dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900 ${
          highlightHome
            ? "bg-stone-900 text-stone-50 shadow-sm dark:bg-stone-100 dark:text-stone-900"
            : "text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        }`}
        title="Utama"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </OfflineAwareLink>
      {MODE_ITEMS.map((item) => {
        const active = !highlightHome && item.value === activeMode;
        const href = modeHref({
          mode: item.value,
          readPage,
          themeSurahId: derivedThemeSurahId,
        });

        return (
          <OfflineAwareLink
            key={item.value}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              saveReadMode(item.value);
              if (onModeClick) {
                onModeClick(item.value, e);
              }
            }}
            className={`flex min-h-11 shrink-0 items-center rounded-full px-2 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:px-4 sm:py-2 sm:text-base dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900 ${
              active
                ? "bg-stone-900 text-stone-50 shadow-sm dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            }`}
          >
            {item.label}
          </OfflineAwareLink>
        );
      })}
      {utilityThemeToggle}
    </nav>
  );

  if (!showUtilities) {
    return <div className="flex w-full justify-start sm:justify-center">{navigator}</div>;
  }

  if (!showAuthStatus) {
    return <div className="flex w-full justify-start sm:justify-center">{navigator}</div>;
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full justify-start sm:justify-center">{navigator}</div>
      <div className="flex w-full justify-center">
        <AuthStatusButton />
      </div>
    </div>
  );
}
