"use client";

import Link from "next/link";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

export function ContinueReadingCard() {
  const state = useReadingProgressState();

  const continuePage = state.lastPage ?? 1;

  return (
    <section className="w-full max-w-md rounded-2xl border border-stone-300 bg-white px-4 py-4 shadow-sm dark:border-stone-600 dark:bg-stone-900">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Reading Progress
      </p>
      <p className="mt-1 text-sm text-stone-700 dark:text-stone-200">
        {state.lastPage
          ? `Last read: page ${state.lastPage}`
          : "No reading history yet. Start from page 1."}
      </p>

      <Link
        href={`/read/${continuePage}`}
        className="mt-3 inline-flex rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        Continue Reading
      </Link>
    </section>
  );
}
