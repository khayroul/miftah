"use client";

import { useEffect } from "react";
import { rememberLastReadPage } from "@/lib/readingProgressStorage";
import { useReadingProgressState } from "@/lib/useReadingProgressState";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";

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
        <OfflineAwareLink
          href={state.lastPage ? `/read/${state.lastPage}` : "/read/1"}
          prefetch={false}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Sambung Baca
        </OfflineAwareLink>
      </div>
    </section>
  );
}
