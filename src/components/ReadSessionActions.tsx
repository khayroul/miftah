"use client";

import Link from "next/link";
import { useEffect } from "react";
import { rememberLastReadPage } from "@/lib/readingProgressStorage";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

interface ReadSessionActionsProps {
  currentPage: number;
}

export function ReadSessionActions({ currentPage }: ReadSessionActionsProps) {
  const state = useReadingProgressState();

  useEffect(() => {
    rememberLastReadPage(currentPage);
  }, [currentPage]);

  return (
    <section className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={state.lastPage ? `/read/${state.lastPage}` : "/read/1"}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Continue Reading
        </Link>
      </div>
    </section>
  );
}
