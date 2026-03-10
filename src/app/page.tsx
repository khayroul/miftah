import Link from "next/link";
import { ContinueReadingCard } from "@/components/ContinueReadingCard";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const highlights = [
    {
      title: "Sacred Reading Flow",
      description:
        "Distraction-light mushaf view designed for focused tilawah and hifz sessions.",
    },
    {
      title: "Theme Navigator",
      description:
        "Explore surah-level theme groupings to connect ayat meaning while memorizing.",
    },
    {
      title: "Progress That Persists",
      description:
        "Continue from your latest page and jump to bookmarks without re-setting context.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,94,89,0.18),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.16),transparent_30%)] dark:bg-[radial-gradient(circle_at_16%_12%,rgba(15,118,110,0.22),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.18),transparent_30%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex w-full justify-end">
          <ThemeToggle />
        </header>

        <section className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/85 p-5 shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78 dark:shadow-[0_25px_70px_-48px_rgba(2,6,23,0.9)]">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center rounded-full border border-teal-900/15 bg-teal-950/5 px-3 py-1 text-xs font-medium tracking-wide text-teal-900/80 dark:border-teal-300/20 dark:bg-teal-900/40 dark:text-teal-100">
                Phase 0 · Foundation
              </div>

              <div className="space-y-3">
                <h1 className="text-4xl font-medium leading-tight tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
                  مفتاح
                </h1>
                <p className="max-w-xl text-lg text-stone-700 sm:text-xl dark:text-stone-100">
                  Memorize the Quran by understanding, not just repetition.
                </p>
                <p className="max-w-xl text-sm text-stone-600 dark:text-stone-300">
                  Bina hafazan yang kukuh dengan aliran bacaan yang tenang,
                  konteks tema ayat, dan sambungan progres yang lancar.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-stone-700 dark:text-stone-200">
                <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                  Bahasa Malaysia + English
                </span>
                <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                  Quran Focus First
                </span>
                <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                  Supabase-backed progress
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/read/1"
                  className="rounded-xl bg-teal-900 px-5 py-2.5 text-sm font-medium text-teal-50 transition hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600"
                >
                  Start Reading
                </Link>
                <Link
                  href="/read/surah/2/themes"
                  className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Explore Theme Navigator
                </Link>
                <Link
                  href="/hifz"
                  className="rounded-xl border border-teal-900/30 bg-teal-50 px-5 py-2.5 text-sm font-medium text-teal-900 transition hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-100 dark:hover:bg-teal-900/50"
                >
                  Hifz Dashboard
                </Link>
              </div>
            </div>

            <aside className="animate-fade-in-up-delay rounded-2xl border border-stone-200/80 bg-stone-50/90 p-3 dark:border-stone-700 dark:bg-stone-900/85">
              <div className="[&>section]:max-w-none">
                <ContinueReadingCard />
              </div>
              <p className="px-2 pb-1 pt-3 text-xs text-stone-500 dark:text-stone-400">
                Progress is saved locally to keep your next session one tap away.
              </p>
            </aside>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((highlight, index) => (
            <article
              key={highlight.title}
              className="animate-fade-in-up rounded-2xl border border-stone-200/85 bg-white/80 p-4 shadow-[0_12px_36px_-28px_rgba(28,25,23,0.45)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/78 dark:shadow-[0_12px_36px_-28px_rgba(2,6,23,0.85)]"
              style={{ animationDelay: `${140 + index * 80}ms` }}
            >
              <h2 className="text-sm font-semibold tracking-wide text-stone-900 dark:text-stone-100">
                {highlight.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                {highlight.description}
              </p>
            </article>
          ))}
        </section>

        <section className="animate-fade-in-up-delay rounded-2xl border border-stone-200 bg-white/80 p-4 text-center text-xs text-stone-500 backdrop-blur-sm sm:text-sm dark:border-stone-700 dark:bg-stone-900/75 dark:text-stone-400">
          Sacred reading mode is still intentionally minimal while Phase 0
          foundations are being finalized.
        </section>
      </main>
    </div>
  );
}
