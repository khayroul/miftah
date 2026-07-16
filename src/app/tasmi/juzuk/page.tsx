import type { Metadata } from "next";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";
import { TasmiJuzukExam } from "@/features/tasmi";
import { requireAuthUser } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Ujian Juzuk — Tasmi' | Miftah",
};

export default async function TasmiJuzukPage() {
  // The whole flow (round picker, transcription, session save) is
  // authenticated — gate the page instead of failing per-request inside.
  await requireAuthUser("/tasmi/juzuk");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <OfflineAwareLink
          href="/hifz"
          prefetch={false}
          className="ui-touch-target inline-flex shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white/85 px-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:border-stone-700 dark:bg-stone-900/75 dark:text-stone-200 dark:hover:bg-stone-900 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-950"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="m15 18-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Hafal
        </OfflineAwareLink>
        <div className="min-w-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-800 dark:text-teal-200">
            Tasmi&apos;
          </p>
          <h1 className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-50">
            Ujian Juzuk
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Semak hafalan anda juzuk demi juzuk
          </p>
        </div>
      </header>
      <TasmiJuzukExam />
    </main>
  );
}
