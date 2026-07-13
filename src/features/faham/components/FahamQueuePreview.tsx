import type { SerializedFahamCard } from "../domain/queue";

function cardKindConfig(kind: SerializedFahamCard["kind"]): {
  label: string;
  classes: string;
  rowClasses: string;
  numberClasses: string;
} {
  switch (kind) {
    case "mastered":
      return {
        label: "Mahir",
        classes:
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300",
        rowClasses:
          "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/25 dark:bg-emerald-900/30",
        numberClasses:
          "bg-emerald-200 text-emerald-800 dark:bg-emerald-400/30 dark:text-emerald-200",
      };
    case "due":
      return {
        label: "Ulang",
        classes:
          "bg-sky-100 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300",
        rowClasses:
          "border-sky-200 bg-sky-50/60 dark:border-sky-400/25 dark:bg-sky-900/30",
        numberClasses:
          "bg-sky-200 text-sky-800 dark:bg-sky-400/30 dark:text-sky-200",
      };
    case "new":
      return {
        label: "Baharu",
        classes:
          "bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300",
        rowClasses:
          "border-violet-200 bg-violet-50/60 dark:border-violet-400/25 dark:bg-violet-900/30",
        numberClasses:
          "bg-violet-200 text-violet-800 dark:bg-violet-400/30 dark:text-violet-200",
      };
  }
}

export function FahamQueuePreview({
  cards,
  onStart,
}: {
  cards: SerializedFahamCard[];
  onStart: () => void;
}) {
  const newCount = cards.filter((card) => card.kind === "new").length;
  const dueCount = cards.filter((card) => card.kind === "due").length;
  const masteredCount = cards.filter(
    (card) => card.kind === "mastered",
  ).length;

  return (
    <section className="animate-fade-in-up rounded-[2rem] border border-stone-200/90 bg-white/88 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.65)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/80">
      <h3 className="mb-1 text-lg font-semibold text-stone-800 dark:text-stone-100">
        Kad Sesi Ini
      </h3>
      <div className="mb-4 flex gap-3 text-xs font-medium">
        {newCount > 0 ? (
          <span className="text-violet-600 dark:text-violet-300">
            {newCount} Baharu
          </span>
        ) : null}
        {dueCount > 0 ? (
          <span className="text-sky-600 dark:text-sky-300">
            {dueCount} Ulang
          </span>
        ) : null}
        {masteredCount > 0 ? (
          <span className="text-emerald-600 dark:text-emerald-300">
            {masteredCount} Mahir
          </span>
        ) : null}
      </div>
      <div className="space-y-2.5">
        {cards.map((card, index) => {
          const statusConfig = cardKindConfig(card.kind);
          return (
            <div
              key={card.progressId}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 ${statusConfig.rowClasses}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${statusConfig.numberClasses}`}
              >
                {index + 1}
              </span>
              <span
                dir="rtl"
                lang="ar"
                className="min-w-[3rem] font-arabic text-xl text-stone-900 dark:text-stone-50"
              >
                {card.word.textUthmani}
              </span>
              <span className="text-stone-400 dark:text-stone-600">
                &mdash;
              </span>
              <span className="flex-1 text-sm text-stone-600 dark:text-stone-200">
                {card.word.translationBm}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${statusConfig.classes}`}
              >
                {statusConfig.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-6 border-t border-stone-200/60 pt-5 dark:border-stone-700/40">
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-2xl bg-[linear-gradient(135deg,#0d9488,#6366f1)] px-6 py-4 text-lg font-bold tracking-wide text-white shadow-lg transition hover:shadow-xl hover:brightness-110 active:scale-[0.98] dark:bg-[linear-gradient(135deg,#0f766e,#4f46e5)] dark:text-white"
        >
          Mula Sesi &rarr;
        </button>
      </div>
    </section>
  );
}
