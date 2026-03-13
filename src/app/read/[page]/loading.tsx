export default function ReadPageLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 pt-2 sm:pt-4">
        <div className="flex w-full items-center justify-end gap-2">
          <div className="h-10 w-10 rounded-full bg-stone-200/80 dark:bg-stone-800" />
          <div className="h-10 w-10 rounded-full bg-stone-200/80 dark:bg-stone-800" />
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 text-center">
        <div className="h-4 w-40 rounded-full bg-stone-200/80 dark:bg-stone-800" />
        <div className="h-8 w-64 rounded-full bg-stone-300/80 dark:bg-stone-700" />
        <div className="h-4 w-48 rounded-full bg-stone-200/80 dark:bg-stone-800" />
      </section>

      <section className="rounded-[2rem] border border-stone-200/80 bg-white/80 p-5 shadow-sm dark:border-stone-700/50 dark:bg-stone-900/60 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="h-10 w-28 rounded-2xl bg-stone-200/80 dark:bg-stone-800" />
          <div className="h-10 w-28 rounded-2xl bg-stone-200/80 dark:bg-stone-800" />
        </div>

        <div className="rounded-[2rem] border border-stone-200/70 bg-stone-50/90 p-4 dark:border-stone-700/50 dark:bg-stone-950/50">
          <div className="mx-auto aspect-[10/16] max-w-4xl rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(245,240,227,0.95),rgba(240,232,214,0.75))] p-6 shadow-inner dark:bg-[linear-gradient(180deg,rgba(41,37,36,0.95),rgba(28,25,23,0.92))]">
            <div className="flex h-full flex-col justify-between">
              <div className="space-y-3">
                <div className="h-4 w-32 rounded-full bg-stone-300/70 dark:bg-stone-700" />
                <div className="h-3 w-full rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[94%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[97%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[92%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[96%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[90%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[95%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[93%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
                <div className="h-3 w-[97%] rounded-full bg-stone-200/90 dark:bg-stone-800" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="h-16 rounded-2xl bg-white/75 shadow-sm dark:bg-stone-900/65" />
                <div className="h-16 rounded-2xl bg-white/75 shadow-sm dark:bg-stone-900/65" />
                <div className="h-16 rounded-2xl bg-white/75 shadow-sm dark:bg-stone-900/65" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
