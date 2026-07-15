"use client";

import { useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PageGridEntry, PageGridStatus } from "../domain/types";

interface HifzPageActionSheetProps {
  entry: PageGridEntry;
  onClose: () => void;
}

const STATUS_LABELS: Record<PageGridStatus, string> = {
  "not-started": "Belum mula",
  sabak: "Sabak",
  sabqi: "Sabqi",
  manzil: "Manzil",
  due: "Perlu ulang",
  overdue: "Tertunggak",
};

export function HifzPageActionSheet({ entry, onClose }: HifzPageActionSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router, startTransition],
  );

  const handleBaca = useCallback(() => {
    navigate(`/read/${entry.page}?mode=hifz&from=hifz`);
  }, [entry.page, navigate]);

  const handleMemoryTest = useCallback(() => {
    navigate(`/read/${entry.page}?mode=hifz&from=hifz&intent=test`);
  }, [entry.page, navigate]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Pilihan untuk halaman ${entry.page}`}
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Tutup"
        tabIndex={-1}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-sm animate-[fadeInUp_200ms_ease-out] rounded-t-3xl border border-stone-200/80 bg-white p-6 shadow-2xl dark:border-stone-700/60 dark:bg-stone-900 sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
              Halaman {entry.page} · Juz {entry.juz}
            </p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              {STATUS_LABELS[entry.status]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            aria-label="Tutup"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleBaca}
            className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3.5 text-left transition hover:bg-teal-100 disabled:opacity-40 dark:border-teal-800 dark:bg-teal-900/30 dark:hover:bg-teal-900/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white dark:bg-teal-500">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
                Baca
              </p>
              <p className="text-xs text-teal-700/70 dark:text-teal-300/60">
                Buka mushaf untuk membaca dan menghafal
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={handleMemoryTest}
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left transition hover:bg-amber-100 disabled:opacity-40 dark:border-amber-800 dark:bg-amber-900/30 dark:hover:bg-amber-900/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white dark:bg-amber-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Uji Ingatan
              </p>
              <p className="text-xs text-amber-700/70 dark:text-amber-300/60">
                Uji sendiri tanpa melihat, dengan petunjuk jika anda tersekat
              </p>
            </div>
          </button>
        </div>

        {/* Drag handle for mobile */}
        <div className="mt-4 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-stone-300 dark:bg-stone-600" />
        </div>
      </div>
    </div>
  );
}
