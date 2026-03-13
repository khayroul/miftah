import Link from "next/link";

interface ThemeActionPanelProps {
  firstPageHref: string;
  firstPageNumber: number;
  rangeLabel: string;
  sourceLabel: string;
  synopsis: string;
  themeTitle: string;
}

export function ThemeActionPanel({
  firstPageHref,
  firstPageNumber,
  rangeLabel,
  sourceLabel,
  synopsis,
  themeTitle,
}: ThemeActionPanelProps) {
  return (
    <section className="rounded-[1.9rem] border border-stone-200/85 bg-[linear-gradient(135deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-5 shadow-[0_28px_80px_-52px_rgba(28,25,23,0.24)] dark:border-stone-700/80 dark:bg-[linear-gradient(135deg,rgba(41,37,36,0.74),rgba(12,10,9,0.92))] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full border border-sky-300/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/35 dark:text-sky-200">
            Sinopsis Tema
          </span>
          <h3 className="mt-3 text-xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
            {themeTitle}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            {synopsis}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full border border-stone-300/80 bg-white/80 px-3 py-1 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-900/70 dark:text-stone-200">
            Ayat {rangeLabel}
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            Sumber: {sourceLabel}
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-[1.4rem] border border-stone-200/80 bg-white/70 p-4 dark:border-stone-700/80 dark:bg-stone-950/35">
        <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-200">
          Gunakan sinopsis ini sebagai orientasi sebelum membaca terperinci ayat-ayat di bawah.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={firstPageHref}
            className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            Baca semula dari halaman {firstPageNumber}
          </Link>
          <span className="text-sm text-stone-500 dark:text-stone-400">
            Lihat bagaimana tema ini bergerak dalam susunan ayat.
          </span>
        </div>
      </div>
    </section>
  );
}
