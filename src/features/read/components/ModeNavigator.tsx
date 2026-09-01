"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
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

const LanguageToggle = dynamic(
  () =>
    import("@/components/LanguageToggle").then(
      (module) => module.LanguageToggle,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

interface ModeNavigatorProps {
  activeMode: ReadMode | null;
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

const MODE_ITEMS: ReadMode[] = ["read", "faham", "tema", "hifz"];

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
  const t = useTranslations("nav");
  const readingState = useReadingProgressState();

  useEffect(() => {
    if (activeMode) {
      saveReadMode(activeMode);
    }
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

  const navigator = (
    <nav
      aria-label={t("ariaLabel")}
      className="grid min-h-[52px] w-full items-center rounded-[26px] border border-stone-200 bg-white/92 p-1 shadow-sm backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/88"
      style={{
        gridTemplateColumns: showUtilities
          ? "2.75rem repeat(4, minmax(0, 1fr)) 1px 2.75rem 2.75rem"
          : "2.75rem repeat(4, minmax(0, 1fr))",
      }}
    >
      <OfflineAwareLink
        href="/"
        prefetch={false}
        aria-current={highlightHome ? "page" : undefined}
        aria-label={t("home")}
        className={`flex h-11 w-full items-center justify-center rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:text-base dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900 ${
          highlightHome
            ? "bg-stone-900 text-stone-50 shadow-sm dark:bg-stone-100 dark:text-stone-900"
            : "text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        }`}
        title={t("home")}
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
      {MODE_ITEMS.map((mode) => {
        const active = !highlightHome && mode === activeMode;
        const href = modeHref({
          mode,
          readPage,
          themeSurahId: derivedThemeSurahId,
        });

        return (
          <OfflineAwareLink
            key={mode}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              saveReadMode(mode);
              if (onModeClick) {
                onModeClick(mode, e);
              }
            }}
            className={`flex min-h-11 min-w-0 items-center justify-center rounded-full px-1 py-1.5 text-center text-xs font-medium leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:px-2 sm:text-sm dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900 ${
              active
                ? "bg-stone-900 text-stone-50 shadow-sm dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            }`}
          >
            {t(mode)}
          </OfflineAwareLink>
        );
      })}
      {showUtilities ? (
        <>
          <span
            aria-hidden="true"
            className="h-6 w-px justify-self-center bg-stone-200 dark:bg-stone-700"
          />
          <div className="flex h-11 w-11 items-center justify-center">
            <ThemeToggle iconOnly embedded />
          </div>
          <div className="flex h-11 w-11 items-center justify-center">
            <LanguageToggle />
          </div>
        </>
      ) : null}
    </nav>
  );

  const navigatorRow = (
    <div className="relative left-1/2 flex w-[min(calc(100vw-2rem),69rem)] -translate-x-1/2 self-start justify-start sm:w-[min(calc(100vw-3rem),69rem)] sm:justify-center">
      {navigator}
    </div>
  );

  if (!showUtilities) {
    return navigatorRow;
  }

  if (!showAuthStatus) {
    return navigatorRow;
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {navigatorRow}
      <div className="flex w-full justify-center">
        <AuthStatusButton />
      </div>
    </div>
  );
}
