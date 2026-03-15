import Link from "next/link";
import type { FahamLevelProgress } from "@/lib/faham/levels";
import type { ReadPageVocabPreviewItem } from "@/lib/faham/repository";

interface ReadPageVocabSectionProps {
  items: ReadPageVocabPreviewItem[];
  levelProgress: FahamLevelProgress;
  pageNumber: number;
  loadError?: string | null;
  /** Start with the details section already expanded (default: false). */
  defaultOpen?: boolean;
}

function statusLabel(status: ReadPageVocabPreviewItem["status"]): string {
  if (status === "review") {
    return "Ulang";
  }
  if (status === "learning") {
    return "Sedang belajar";
  }
  if (status === "seen") {
    return "Pernah jumpa";
  }
  if (status === "mastered") {
    return "Mahir";
  }
  return "Baru";
}

function statusClassName(status: ReadPageVocabPreviewItem["status"]): string {
  if (status === "review") {
    return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700/45 dark:bg-amber-900/25 dark:text-amber-100";
  }
  if (status === "learning") {
    return "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-700/45 dark:bg-teal-900/25 dark:text-teal-100";
  }
  if (status === "seen") {
    return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-700/45 dark:bg-sky-900/25 dark:text-sky-100";
  }
  if (status === "mastered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700/45 dark:bg-emerald-900/25 dark:text-emerald-100";
  }
  return "border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200";
}

export function ReadPageVocabSection({
  items,
  levelProgress,
  pageNumber,
  loadError = null,
  defaultOpen = false,
}: ReadPageVocabSectionProps) {
  return (
    <section className="rounded-[28px] border border-stone-200/90 bg-white/92 p-4 shadow-[0_18px_42px_-34px_rgba(28,25,23,0.42)] backdrop-blur-sm dark:border-stone-700/80 dark:bg-stone-900/88 sm:p-5">
      <details className="group" open={defaultOpen || undefined}>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
              Faham Ringkas
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-900 dark:text-stone-100">
              Perkataan untuk difahami
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              Halaman {pageNumber} · Tahap L{levelProgress.activeLevel} · fokus {levelProgress.activeWordLimit.toLocaleString("ms-MY")} perkataan teratas.
            </p>
          </div>

          <span className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-stone-200 bg-stone-50 px-3 text-xs font-medium text-stone-700 transition group-open:rotate-180 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
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
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </span>
        </summary>

        <div className="mt-4 space-y-4 border-t border-stone-200/80 pt-4 dark:border-stone-700/80">
          {loadError ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/45 dark:bg-amber-900/20 dark:text-amber-100">
              {loadError}
            </p>
          ) : null}

          {!loadError && items.length === 0 ? (
            <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
              Tiada perkataan fokus baharu pada halaman ini dalam cap Faham anda sekarang.
            </p>
          ) : null}

          {items.length > 0 ? (
            <div className="grid gap-3">
              {items.map((item) => (
                <article
                  key={item.wordId}
                  className="rounded-2xl border border-stone-200 bg-[#fffdfa] px-4 py-3 dark:border-stone-700 dark:bg-stone-950/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="font-arabic text-right text-2xl leading-tight text-stone-900 dark:text-stone-100"
                        dir="rtl"
                        lang="ar"
                      >
                        {item.wordText}
                      </p>
                      {item.transliteration ? (
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                          {item.transliteration}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName(item.status)}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-stone-800 dark:text-stone-100">
                    {item.translationBm ?? "Terjemahan belum tersedia."}
                  </p>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Ayat {item.surahId}:{item.ayahNumber}
                    {item.occurrenceCount > 1 ? ` · ${item.occurrenceCount} kali di halaman ini` : ""}
                  </p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-stone-100/80 px-4 py-3 dark:bg-stone-800/70">
            <p className="text-sm text-stone-700 dark:text-stone-200">
              Teruskan ke Faham untuk ulang kaji penuh dan buka lagi perkataan ikut tahap anda.
            </p>
            <Link
              href="/faham"
              className="inline-flex shrink-0 items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              Buka Faham
            </Link>
          </div>
        </div>
      </details>
    </section>
  );
}
