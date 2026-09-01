"use client";

import { useLocale, useTranslations } from "next-intl";
import type { SerializedFahamCard } from "../domain/queue";

function cardKindConfig(
  kind: SerializedFahamCard["kind"],
  t: (key: string) => string,
): {
  label: string;
  classes: string;
  rowClasses: string;
  numberClasses: string;
} {
  switch (kind) {
    case "mastered":
      return {
        label: t("kindMastered"),
        classes:
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300",
        rowClasses:
          "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/25 dark:bg-emerald-900/30",
        numberClasses:
          "bg-emerald-200 text-emerald-800 dark:bg-emerald-400/30 dark:text-emerald-200",
      };
    case "due":
      return {
        label: t("kindDue"),
        classes:
          "bg-teal-100 text-teal-800 dark:bg-teal-400/20 dark:text-teal-200",
        rowClasses:
          "border-teal-200 bg-teal-50/60 dark:border-teal-400/25 dark:bg-teal-900/30",
        numberClasses:
          "bg-teal-200 text-teal-900 dark:bg-teal-400/30 dark:text-teal-100",
      };
    case "new":
      return {
        label: t("kindNew"),
        classes:
          "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
        rowClasses:
          "border-amber-200 bg-amber-50/60 dark:border-amber-400/25 dark:bg-amber-900/25",
        numberClasses:
          "bg-amber-200 text-amber-900 dark:bg-amber-400/30 dark:text-amber-100",
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
  const t = useTranslations("faham.preview");
  const locale = useLocale();
  const newCount = cards.filter((card) => card.kind === "new").length;
  const dueCount = cards.filter((card) => card.kind === "due").length;
  const masteredCount = cards.filter(
    (card) => card.kind === "mastered",
  ).length;

  return (
    <section
      aria-labelledby="faham-preview-title"
      className="ui-surface animate-fade-in-up rounded-[2rem] p-5 sm:p-7"
    >
      <div className="flex flex-col gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="faham-preview-title"
            className="text-xl font-semibold text-foreground"
          >
            {t("cardCountTitle", { count: cards.length })}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {t("previewSubtitle")}
          </p>
        </div>
        <div
          aria-label={t("summaryAria")}
          className="flex flex-wrap gap-2 text-xs font-semibold"
        >
          {newCount > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
              {t("newChip", { count: newCount })}
            </span>
          ) : null}
          {dueCount > 0 ? (
            <span className="rounded-full bg-teal-100 px-3 py-1.5 text-teal-800 dark:bg-teal-400/20 dark:text-teal-200">
              {t("dueChip", { count: dueCount })}
            </span>
          ) : null}
          {masteredCount > 0 ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200">
              {t("masteredChip", { count: masteredCount })}
            </span>
          ) : null}
        </div>
      </div>
      <ol className="mt-5 space-y-2.5">
        {cards.map((card, index) => {
          const statusConfig = cardKindConfig(card.kind, t);
          const reference = card.sourceContext?.primaryReference?.label;
          const activeMeaning =
            locale === "ms"
              ? (card.word.translationBm ?? t("meaningUnavailable"))
              : (card.word.translationEn ?? t("meaningUnavailable"));
          return (
            <li
              key={card.progressId}
              className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border px-4 py-4 ${statusConfig.rowClasses}`}
            >
              <span
                className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${statusConfig.numberClasses}`}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      dir={card.mcq.promptDir}
                      lang={card.mcq.promptLang}
                      className={`truncate text-stone-900 dark:text-stone-50 ${
                        card.mcq.promptLang === "ar"
                          ? "font-arabic text-3xl leading-tight sm:text-4xl"
                          : "text-base font-semibold"
                      }`}
                    >
                      {card.mcq.promptPrimary}
                    </p>
                    {card.word.transliteration ? (
                      <p className="mt-1 text-xs text-muted">
                        {card.word.transliteration}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${statusConfig.classes}`}
                  >
                    {statusConfig.label}
                  </span>
                </div>

                <p className="mt-2 text-base font-semibold leading-relaxed text-foreground">
                  {activeMeaning}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {reference ? t("fromAyah", { label: reference }) : t("mixedSource")}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 border-t border-border-subtle pt-5">
        <button
          type="button"
          onClick={onStart}
          className="ui-touch-target w-full touch-manipulation rounded-2xl bg-brand px-6 py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-strong active:bg-brand-strong dark:text-slate-950"
        >
          {t("startAction")}
        </button>
      </div>
    </section>
  );
}
