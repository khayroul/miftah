import Link from "next/link";
import type { SerializedFahamCard } from "../domain/queue";

interface AnswerState {
  isCorrect: boolean;
  selectedIndex: number;
}

function optionButtonClassName(params: {
  answerState: AnswerState | null;
  index: number;
  isPending: boolean;
  isSelected: boolean;
  correctIndex: number;
}): string {
  const { answerState, correctIndex, index, isPending, isSelected } = params;

  if (!answerState) {
    return [
      "border-stone-200 bg-white/90 text-stone-800 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50",
      "dark:border-stone-700 dark:bg-stone-950/70 dark:text-stone-100 dark:hover:border-amber-500/50 dark:hover:bg-amber-950/40",
      isPending ? "opacity-50" : "",
    ].join(" ");
  }

  if (index === correctIndex) {
    return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-100";
  }

  if (isSelected) {
    return "border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-100";
  }

  return "border-stone-200 bg-stone-100/80 text-stone-500 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-400";
}

export function FahamStudyCard({
  answerState,
  audioEnabled,
  card,
  cardCount,
  currentIndex,
  isConfigExpanded,
  isPending,
  onAnswer,
  onContinue,
  onManualAudio,
  onToggleAudio,
  onToggleConfig,
  progressPct,
}: {
  answerState: AnswerState | null;
  audioEnabled: boolean;
  card: SerializedFahamCard;
  cardCount: number;
  currentIndex: number;
  isConfigExpanded: boolean;
  isPending: boolean;
  onAnswer: (index: number) => void;
  onContinue: () => void;
  onManualAudio: (
    lang: "ar" | "ms",
    text: string,
    explicitUrl?: string | null,
  ) => void;
  onToggleAudio: () => void;
  onToggleConfig: () => void;
  progressPct: number;
}) {
  return (
    <section className="animate-fade-in-up rounded-[2rem] border border-stone-200/90 bg-white/88 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.65)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/80">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleAudio}
          className={`group flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-sm transition sm:text-base ${
            audioEnabled
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400"
          }`}
        >
          {audioEnabled ? (
            <>
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  d="M11 5L6 9H2v6h4l5 4V5z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15.54 8.46a5 5 0 0 1 0 7.07"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Audio On
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  d="M11 5L6 9H2v6h4l5 4V5z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="23"
                  y1="9"
                  x2="17"
                  y2="15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="17"
                  y1="9"
                  x2="23"
                  y2="15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Audio Off
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleConfig}
          className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-sm transition sm:text-base ${
            isConfigExpanded
              ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/30 dark:bg-amber-900/50"
              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          }`}
          aria-expanded={isConfigExpanded}
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-300 ${isConfigExpanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path
              d="M12 5v14M5 12l7 7 7-7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {isConfigExpanded ? "Tutup Pilihan Tambahan" : "Pilihan Tambahan"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="min-w-32">
          <div className="flex items-center justify-between text-sm text-stone-500 sm:text-base dark:text-stone-400">
            <span>
              {currentIndex + 1} / {cardCount}
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0d9488,#6366f1)] transition-[width] duration-300 dark:bg-[linear-gradient(90deg,#14b8a6,#818cf8)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.75rem] border border-teal-200/70 bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.1),transparent_55%),linear-gradient(180deg,rgba(240,253,250,0.92),rgba(255,255,255,0.96))] p-6 dark:border-teal-500/25 dark:bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.15),transparent_55%),linear-gradient(180deg,rgba(17,24,39,0.92),rgba(12,10,9,0.96))]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500 sm:text-base dark:text-stone-400">
            {card.mcq.promptLabel}
          </p>
          <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-300">
            {card.mcq.promptHint}
          </p>
          <p
            dir={card.mcq.promptDir}
            lang={card.mcq.promptLang}
            onClick={() =>
              onManualAudio(
                card.mcq.promptLang,
                card.mcq.promptPrimary,
                card.mcq.promptAudioUrl,
              )
            }
            className={`mt-10 cursor-pointer text-center leading-tight text-stone-950 transition hover:scale-[1.03] active:scale-95 sm:text-6xl dark:text-stone-50 ${
              card.mcq.promptLang === "ar"
                ? "font-arabic text-5xl"
                : "text-4xl font-semibold"
            }`}
            title="Tekan untuk dengar audio"
          >
            {card.mcq.promptPrimary}
          </p>
        </div>

        <div className="space-y-3">
          {card.mcq.options.map((option, index) => {
            const isSelected = answerState?.selectedIndex === index;
            const label = String.fromCharCode(65 + index);

            return (
              <button
                key={`${card.progressId}-${option.lang}-${option.value}`}
                type="button"
                disabled={Boolean(answerState) || isPending}
                onClick={() => onAnswer(index)}
                className={`w-full rounded-[1.35rem] border px-4 py-4 text-left transition ${optionButtonClassName(
                  {
                    answerState,
                    correctIndex: card.mcq.correctIndex,
                    index,
                    isPending,
                    isSelected,
                  },
                )} ${isSelected && !answerState?.isCorrect ? "animate-shake" : ""}`}
              >
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/70 text-sm font-semibold dark:bg-white/10">
                    {label}
                  </span>
                  <span
                    dir={option.dir}
                    lang={option.lang}
                    className={`leading-relaxed ${
                      option.lang === "ar"
                        ? "font-arabic text-2xl"
                        : "text-base font-medium"
                    }`}
                  >
                    {option.value}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {answerState ? (
        <div
          className={`mt-6 rounded-[1.5rem] border p-4 sm:p-5 ${
            answerState.isCorrect
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-950/30"
              : "border-rose-200 bg-rose-50 dark:border-rose-700/40 dark:bg-rose-950/30"
          }`}
        >
          <p
            className={`text-base font-semibold ${
              answerState.isCorrect
                ? "text-emerald-800 dark:text-emerald-200"
                : "text-rose-800 dark:text-rose-200"
            }`}
          >
            {answerState.isCorrect ? "Betul!" : "Kurang tepat."}
          </p>

          <p className="mt-2 text-base text-stone-800 dark:text-stone-100">
            {card.mcq.answerLabel}:{" "}
            <span
              dir={card.mcq.direction === "bm_to_arab" ? "rtl" : "ltr"}
              lang={card.mcq.direction === "bm_to_arab" ? "ar" : "ms"}
              onClick={() => {
                const lang = card.mcq.direction === "bm_to_arab" ? "ar" : "ms";
                onManualAudio(
                  lang,
                  card.mcq.answerPrimary,
                  card.mcq.answerAudioUrl,
                );
              }}
              className={`cursor-pointer transition hover:opacity-75 ${
                card.mcq.direction === "bm_to_arab"
                  ? "font-arabic text-2xl"
                  : "font-medium"
              }`}
              title="Tekan untuk dengar"
            >
              {card.mcq.answerPrimary}
            </span>
            {card.mcq.answerSecondary &&
            card.mcq.direction !== "bm_to_arab" ? (
              <span className="ml-2 text-sm text-stone-500 dark:text-stone-400">
                ({card.mcq.answerSecondary})
              </span>
            ) : null}
          </p>

          {(card.sourceContext?.primaryReference ||
            (card.sourceContext?.sources.length ?? 0) > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {card.sourceContext?.primaryReference ? (
                card.sourceContext.primaryReference.href ? (
                  <Link
                    href={card.sourceContext.primaryReference.href}
                    className="rounded-full border border-stone-300/70 bg-stone-100/80 px-2.5 py-0.5 text-xs font-medium text-stone-700 transition hover:bg-stone-200 dark:border-stone-600/50 dark:bg-stone-800/60 dark:text-stone-200 dark:hover:bg-stone-700"
                  >
                    Ayat {card.sourceContext.primaryReference.label}
                  </Link>
                ) : (
                  <span className="rounded-full border border-stone-300/70 bg-stone-100/80 px-2.5 py-0.5 text-xs font-medium text-stone-700 dark:border-stone-600/50 dark:bg-stone-800/60 dark:text-stone-200">
                    Ayat {card.sourceContext.primaryReference.label}
                  </span>
                )
              ) : null}
              {card.sourceContext?.sources.map((source) => (
                <Link
                  key={`${card.progressId}-${source.type}-${source.href}`}
                  href={source.href}
                  className="rounded-full border border-stone-300/70 bg-stone-100/80 px-2.5 py-0.5 text-xs font-medium text-stone-700 transition hover:bg-stone-200 dark:border-stone-600/50 dark:bg-stone-800/60 dark:text-stone-200 dark:hover:bg-stone-700"
                  title={source.detail}
                >
                  {source.label}
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={isPending}
            onClick={onContinue}
            className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 text-base font-medium text-stone-50 transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            {isPending ? "Menyimpan..." : "Kad seterusnya"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
