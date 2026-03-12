"use client";

import Link from "next/link";
import { saveReadMode } from "@/lib/readMode";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

export function HifzPageNav() {
  const readingState = useReadingProgressState();
  const pageNumber = readingState.lastPage ?? 1;

  return (
    <div className="mb-1 flex w-full items-center">
      <span className="mr-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
        Hal. {pageNumber} / 604
      </span>
      <div className="ml-auto flex items-center gap-2">
        {pageNumber > 1 ? (
          <Link
            href={`/read/${pageNumber - 1}`}
            prefetch={false}
            title="Halaman Sebelum"
            onClick={() => saveReadMode("hifz")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Prev
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Halaman Sebelum"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-3 text-sm font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Prev
          </button>
        )}
        {pageNumber < 604 ? (
          <Link
            href={`/read/${pageNumber + 1}`}
            prefetch={false}
            title="Halaman Seterusnya"
            onClick={() => saveReadMode("hifz")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Next
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Halaman Seterusnya"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-3 text-sm font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
          >
            Next
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
