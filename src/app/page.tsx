export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 dark:bg-stone-950">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-5xl font-light tracking-tight text-stone-900 dark:text-stone-100">
          مفتاح
        </h1>
        <p className="text-lg text-stone-600 dark:text-stone-400">
          Memorize the Quran by understanding, not just repetition.
        </p>
        <span className="mt-4 text-sm text-stone-400 dark:text-stone-600">
          Phase 0 — Building
        </span>
      </main>
    </div>
  );
}
