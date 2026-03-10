"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  isPageBookmarked,
  rememberLastReadPage,
  toggleBookmark,
} from "@/lib/readingProgressStorage";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

interface ReadSessionActionsProps {
  currentPage: number;
}

export function ReadSessionActions({ currentPage }: ReadSessionActionsProps) {
  const state = useReadingProgressState();

  useEffect(() => {
    rememberLastReadPage(currentPage);
  }, [currentPage]);

  const pageIsBookmarked = isPageBookmarked(state, currentPage);
  const otherBookmarks = state.bookmarks
    .filter((bookmark) => bookmark.page !== currentPage)
    .slice(0, 8);

  return (
    <section className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => toggleBookmark(currentPage)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          {pageIsBookmarked ? "Remove Bookmark" : "Add Bookmark"}
        </button>
        <Link
          href={state.lastPage ? `/read/${state.lastPage}` : "/read/1"}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Continue Reading
        </Link>
      </div>

      {otherBookmarks.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {otherBookmarks.map((bookmark) => (
            <Link
              key={`${bookmark.page}-${bookmark.createdAt}`}
              href={`/read/${bookmark.page}`}
              className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Bookmark p. {bookmark.page}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Belum ada bookmark lagi.</p>
      )}
    </section>
  );
}
