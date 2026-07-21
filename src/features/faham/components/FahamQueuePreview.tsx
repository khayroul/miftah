"use client";

import { useTranslations } from "next-intl";
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
          "bg-sky-100 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300",
        rowClasses:
          "border-sky-200 bg-sky-50/60 dark:border-sky-400/25 dark:bg-sky-900/30",
        numberClasses:
          "bg-sky-200 text-sky-800 dark:bg-sky-400/30 dark:text-sky-200",
      };
    case "new":
      return {
        label: t("kindNew"),
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
  const t = useTranslations("faham.preview");
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
          <p className="ui-eyebrow">{t("readyEyebrow")}</p>
          <h3
            id="faham-preview-title"
            className="mt-2 text-xl font-semibold text-foreground"
          >
            {t("cardCountTitle", { count: cards.length })}
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {t("previewSubtitle")}
          </p>
        </div>
        <div
          aria-label={t("summaryAria")}
          className="flex flex-wrap gap-2 text-xs font-semibold"
        >
          {newCount > 0 ? (
            <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-700 dark:bg-violet-400/20 dark:text-violet-200">
              {t("newChip", { count: newCount })}
            </span>
          ) : null}
          {dueCount > 0 ? (
            <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sky-700 dark:bg-sky-400/20 dark:text-sky-200">
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
          return (
            <li
              key={card.progressId}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 ${statusConfig.rowClasses}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${statusConfig.numberClasses}`}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  dir={card.mcq.promptDir}
                  lang={card.mcq.promptLang}
                  className={`block truncate text-stone-800 dark:text-stone-100 ${
                    card.mcq.promptLang === "ar"
                      ? "font-arabic text-xl leading-snug"
                      : "text-sm font-semibold"
                  }`}
                >
                  {card.mcq.promptPrimary}
                </span>
                <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">
                  {reference ? t("fromAyah", { label: reference }) : t("mixedSource")}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${statusConfig.classes}`}
              >
                {statusConfig.label}
              </span>
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
