import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50">
      <main className="flex flex-col items-center gap-5 px-6 text-center">
        <h1 className="text-5xl font-light tracking-tight text-stone-900">
          مفتاح
        </h1>
        <p className="text-lg text-stone-600">
          Memorize the Quran by understanding, not just repetition.
        </p>
        <span className="text-sm text-stone-500">Phase 0 - Foundation</span>
        <Link
          href="/read/1"
          className="mt-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-stone-700"
        >
          Open Mushaf View
        </Link>
        <Link
          href="/read/surah/2/themes"
          className="rounded-xl border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          Open Theme Chunks
        </Link>
        <span className="text-xs text-stone-400">
          Sacred reading mode (early preview)
        </span>
      </main>
    </div>
  );
}
