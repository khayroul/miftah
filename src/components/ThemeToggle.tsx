"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@/lib/useTheme";

interface ThemeToggleProps {
  iconOnly?: boolean;
  embedded?: boolean;
}

export function ThemeToggle({
  iconOnly = false,
  embedded = false,
}: ThemeToggleProps) {
  const t = useTranslations("themeToggle");
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  if (iconOnly && embedded) {
    const nextTheme = isDark ? "light" : "dark";
    const label = isDark ? t("toLight") : t("toDark");

    return (
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        aria-label={label}
        title={label}
        className="ui-touch-target inline-flex w-11 shrink-0 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900"
      >
        {isDark ? (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-2.25-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
            />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
            />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div
      className={
        embedded
          ? "inline-flex items-center gap-1"
          : "inline-flex items-center gap-1 rounded-full border border-stone-200/80 bg-white/95 p-1 shadow-sm backdrop-blur-md dark:border-stone-700/60 dark:bg-stone-900/90 transition-all duration-300"
      }
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        aria-label={t("lightTheme")}
        title={t("lightTheme")}
        className={`flex min-h-9 items-center justify-center gap-1.5 rounded-full ${iconOnly ? "w-9 px-0" : "px-3"} py-1 text-xs font-semibold transition-all duration-300 ${
          theme === "light"
            ? "bg-amber-100 text-amber-900 shadow-sm dark:bg-amber-900/30 dark:text-amber-300"
            : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-2.25l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
        {iconOnly ? null : t("light")}
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        aria-label={t("darkTheme")}
        title={t("darkTheme")}
        className={`flex min-h-9 items-center justify-center gap-1.5 rounded-full ${iconOnly ? "w-9 px-0" : "px-3"} py-1 text-xs font-semibold transition-all duration-300 ${
          theme === "dark"
            ? "bg-indigo-100 text-indigo-900 shadow-sm dark:bg-indigo-900/40 dark:text-indigo-300"
            : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
        {iconOnly ? null : t("dark")}
      </button>
    </div>
  );
}
