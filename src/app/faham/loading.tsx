import { ModeNavigator } from "@/features/read";

export default function FahamPageLoading() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(180,83,9,0.16),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(20,94,89,0.18),transparent_34%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(217,119,6,0.16),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(15,118,110,0.24),transparent_34%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <ModeNavigator activeMode="faham" showUtilities />

        <section className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/88 p-8 shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/80">
          <div className="space-y-6" aria-hidden>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="h-24 rounded-[1.5rem] bg-stone-200/80 dark:bg-stone-800" />
              <div className="h-24 rounded-[1.5rem] bg-stone-200/80 dark:bg-stone-800" />
            </div>
            <div className="h-6 w-40 rounded-full bg-stone-200/80 dark:bg-stone-800" />
            <div className="h-12 w-3/4 rounded-3xl bg-stone-200/80 dark:bg-stone-800" />
            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="h-64 rounded-[1.75rem] bg-stone-200/75 dark:bg-stone-800" />
              <div className="space-y-3">
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-stone-600 dark:text-stone-300">
            Faham sedang dibuka. Jika ada sesi tersimpan atau data luar talian,
            ia akan dipaparkan dahulu sementara semakan baharu berjalan.
          </p>
        </section>
      </main>
    </div>
  );
}
