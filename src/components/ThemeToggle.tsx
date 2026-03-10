"use client";

import { useTheme } from "@/lib/useTheme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <aside className="fixed right-3 top-3 z-50 rounded-full border border-stone-300/90 bg-white/90 p-1 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-900/90">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setTheme("light")}
          aria-pressed={theme === "light"}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            theme === "light"
              ? "bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900"
              : "text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
          }`}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          aria-pressed={theme === "dark"}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            theme === "dark"
              ? "bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900"
              : "text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
          }`}
        >
          Dark
        </button>
      </div>
    </aside>
  );
}
