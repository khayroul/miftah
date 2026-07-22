"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SerializedFahamCard } from "../domain/queue";
import type { SerializedFahamSourceLink } from "../domain/queueTypes";
import type { AnswerState } from "./fahamAnswerFlow";

type FahamStudyTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Resolves a source-link badge's label/detail at render time from its
 * structured fields (pageNumber/surahId/themeChunkIndex/ayahReferenceLabel/
 * origin) — mirrors resolveMcqLabels below. Falls back to the deprecated
 * pre-rendered `label`/`detail` strings only for queue snapshots cached
 * (localStorage/IndexedDB) before this structured-field migration, where the
 * structured fields are absent.
 */
function resolveSourceLinkDisplay(
  source: SerializedFahamSourceLink,
  t: FahamStudyTranslator,
): { detail: string; label: string } {
  if (source.type === "reading_page" && source.pageNumber) {
    const label = t("sourceReadingPageLabel", { page: source.pageNumber });
    if (source.origin === "online") {
      const detail = source.ayahReferenceLabel
        ? t("sourceReadingPageDetailWithAyah", { ayah: source.ayahReferenceLabel })
        : t("sourceReadingPageDetailOnlinePlain", { page: source.pageNumber });
      return { detail, label };
    }
    return { detail: t("sourceReadingPageDetailOffline", { page: source.pageNumber }), label };
  }

  if (source.type === "theme_chunk" && source.surahId && source.themeChunkIndex) {
    const values = { chunk: source.themeChunkIndex, surah: source.surahId };
    return {
      detail: t("sourceThemeChunkDetail", values),
      label: t("sourceThemeChunkLabel", values),
    };
  }

  if (source.type === "hifz_ayah") {
    if (source.origin === "online" && source.ayahReferenceLabel) {
      const values = { ref: source.ayahReferenceLabel };
      return {
        detail: t("sourceHifzAyahDetailWithRef", values),
        label: t("sourceHifzAyahLabelWithRef", values),
      };
    }
    return {
      detail: t("sourceHifzAyahDetailPlain"),
      label: t("sourceHifzAyahLabelPlain"),
    };
  }

  // Legacy cached payload built before the structured-field migration —
  // no structured fields to resolve from, so fall back to whatever was
  // pre-rendered and cached at the time.
  return { detail: source.detail ?? "", label: source.label ?? "" };
}

function resolveMcqLabels(
  direction: SerializedFahamCard["mcq"]["direction"],
  tMcq: FahamStudyTranslator,
): { answerLabel: string; promptHint: string; promptLabel: string } {
  const group = direction === "arab_to_bm" ? "arabToBm" : "bmToArab";
  return {
    answerLabel: tMcq(`${group}.answerLabel`),
    promptHint: tMcq(`${group}.promptHint`),
    promptLabel: tMcq(`${group}.promptLabel`),
  };
}

interface FahamStudyCardProps {
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
  onRetry: () => void;
  onRevealAnswer: () => void;
  onToggleAudio: () => void;
  onToggleConfig: () => void;
  progressPct: number;
}

function interactiveOptionClasses(isPending: boolean): string {
  return [
    "border-border-subtle bg-surface-solid text-foreground",
    "hover:border-amber-300 hover:bg-amber-50",
    "dark:hover:border-amber-500/50 dark:hover:bg-amber-950/40",
    isPending ? "opacity-50" : "",
  ].join(" ");
}

function optionButtonClassName(params: {
  answerState: AnswerState | null;
  correctIndex: number;
  index: number;
  isPending: boolean;
  isSelected: boolean;
}): string {
  const { answerState, correctIndex, index, isPending, isSelected } = params;

  if (!answerState) {
    return interactiveOptionClasses(isPending);
  }

  if (isSelected && !answerState.isCorrect) {
    return "border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-100";
  }

  if (answerState.revealAnswer && index === correctIndex) {
    return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-100";
  }

  if (answerState.revealAnswer) {
    return "border-border-subtle bg-surface-muted text-muted";
  }

  return interactiveOptionClasses(false);
}

function feedbackHeading(
  answerState: AnswerState,
  t: FahamStudyTranslator,
): string {
  if (answerState.isCorrect && answerState.attemptCount === 1) {
    return t("feedbackFirstTry");
  }
  if (answerState.isCorrect) {
    return t("feedbackSecondTry");
  }
  if (!answerState.revealAnswer) {
    return t("feedbackIncorrectRetry");
  }
  if (answerState.attemptCount === 2) {
    return t("feedbackIncorrectFinal");
  }
  return t("feedbackReinforce");
}

function AudioIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
    >
      <path
        d="M11 5 6 9H2v6h4l5 4V5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {enabled ? (
        <path
          d="M15.5 8.5a5 5 0 0 1 0 7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="m17 9 6 6m0-6-6 6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function FeedbackPanel({
  answerState,
  card,
  cardCount,
  currentIndex,
  isPending,
  onContinue,
  onManualAudio,
  onRetry,
  onRevealAnswer,
}: Pick<
  FahamStudyCardProps,
  | "answerState"
  | "card"
  | "cardCount"
  | "currentIndex"
  | "isPending"
  | "onContinue"
  | "onManualAudio"
  | "onRetry"
  | "onRevealAnswer"
>) {
  const t = useTranslations("faham.study");

  if (!answerState || answerState.phase !== "feedback") {
    return null;
  }

  const canRetry =
    !answerState.initialIsCorrect &&
    answerState.attemptCount === 1 &&
    !answerState.revealAnswer;
  const feedbackIsPositive = answerState.isCorrect;
  const arabicAudioUrl =
    card.mcq.direction === "arab_to_bm"
      ? card.mcq.promptAudioUrl
      : card.mcq.answerAudioUrl;

  return (
    <div
      aria-live="polite"
      className={`mt-6 rounded-[1.5rem] border p-4 sm:p-5 ${
        feedbackIsPositive
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-950/30"
          : "border-rose-200 bg-rose-50 dark:border-rose-700/40 dark:bg-rose-950/30"
      }`}
    >
      <p
        className={`text-base font-semibold ${
          feedbackIsPositive
            ? "text-emerald-800 dark:text-emerald-200"
            : "text-rose-800 dark:text-rose-200"
        }`}
      >
        {feedbackHeading(answerState, t)}
      </p>

      {canRetry ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-200">
            {t("retryHint")}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onRetry}
              className="ui-touch-target touch-manipulation rounded-xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-800 dark:bg-rose-500 dark:text-rose-950 dark:hover:bg-rose-400"
            >
              {t("retryAction")}
            </button>
            <button
              type="button"
              onClick={onRevealAnswer}
              className="ui-touch-target touch-manipulation rounded-xl border border-rose-300 bg-white/75 px-4 py-3 text-sm font-semibold text-rose-800 transition-colors hover:bg-white dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-100"
            >
              {t("revealAction")}
            </button>
          </div>
        </>
      ) : (
        <>
          {!answerState.initialIsCorrect ? (
            <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-200">
              {t("reinforcementNote")}
            </p>
          ) : null}

          <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-4 dark:border-white/10 dark:bg-stone-950/25">
            <p className="ui-eyebrow">{t("meaningLinkEyebrow")}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() =>
                  onManualAudio("ar", card.word.textUthmani, arabicAudioUrl)
                }
                className="ui-touch-target touch-manipulation rounded-xl border border-border-subtle bg-surface-solid px-4 py-2 text-center font-arabic text-3xl text-foreground transition-colors hover:bg-surface-muted"
                dir="rtl"
                lang="ar"
                aria-label={t("listenPronunciationAria", { word: card.word.textUthmani })}
              >
                {card.word.textUthmani}
              </button>
              <span
                aria-hidden="true"
                className="hidden text-stone-400 sm:inline"
              >
                =
              </span>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
                  {card.word.translationBm ?? card.mcq.answerPrimary}
                </p>
                {card.word.transliteration ? (
                  <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-300">
                    {card.word.transliteration}
                  </p>
                ) : null}
                {card.word.translationEn ? (
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                    {t("englishMeaningLabel", { value: card.word.translationEn })}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {(card.sourceContext?.primaryReference ||
            (card.sourceContext?.sources.length ?? 0) > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {card.sourceContext?.primaryReference ? (
                card.sourceContext.primaryReference.href ? (
                  <Link
                    href={card.sourceContext.primaryReference.href}
                    className="ui-touch-target inline-flex items-center rounded-full border border-border-subtle bg-surface-solid px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
                  >
                    {t("viewAyahLink", { label: card.sourceContext.primaryReference.label })}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center rounded-full border border-border-subtle bg-surface-solid px-3 text-xs font-semibold text-foreground">
                    {t("ayahLabel", { label: card.sourceContext.primaryReference.label })}
                  </span>
                )
              ) : null}
              {card.sourceContext?.sources.map((source) => {
                const display = resolveSourceLinkDisplay(source, t);
                return (
                  <Link
                    key={`${card.progressId}-${source.type}-${source.href}`}
                    href={source.href}
                    className="ui-touch-target inline-flex items-center rounded-full border border-border-subtle bg-surface-solid px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
                    title={display.detail}
                  >
                    {display.label}
                  </Link>
                );
              })}
            </div>
          )}

          <button
            type="button"
            disabled={isPending}
            onClick={onContinue}
            className="ui-touch-target mt-4 w-full touch-manipulation rounded-xl bg-brand px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60 dark:text-slate-950"
          >
            {isPending
              ? t("continuePending")
              : currentIndex + 1 >= cardCount
                ? t("continueFinish")
                : t("continueNext")}
          </button>
        </>
      )}
    </div>
  );
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
  onRetry,
  onRevealAnswer,
  onToggleAudio,
  onToggleConfig,
  progressPct,
}: FahamStudyCardProps) {
  const t = useTranslations("faham.study");
  const tMcq = useTranslations("faham.mcq");
  const mcqLabels = resolveMcqLabels(card.mcq.direction, tMcq);
  const visibleAnswerState =
    answerState?.phase === "feedback" ? answerState : null;
  const isRetrying = answerState?.phase === "retry";

  return (
    <section
      aria-labelledby="faham-study-title"
      className="ui-surface animate-fade-in-up rounded-[2rem] p-5 sm:p-7"
    >
      <div className="flex flex-col gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4 text-sm text-muted">
            <p id="faham-study-title" className="font-semibold text-foreground">
              {isRetrying ? t("retryingLabel") : t("cardCounter", { current: currentIndex + 1, total: cardCount })}
            </p>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong"
            role="progressbar"
            aria-label={t("progressAria")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleAudio}
            className={`ui-touch-target inline-flex touch-manipulation items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors ${
              audioEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "border-border-subtle bg-surface-muted text-muted"
            }`}
            aria-pressed={audioEnabled}
          >
            <AudioIcon enabled={audioEnabled} />
            <span>{audioEnabled ? t("audioOn") : t("audioOff")}</span>
          </button>

          <button
            type="button"
            onClick={onToggleConfig}
            className={`ui-touch-target inline-flex touch-manipulation items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors ${
              isConfigExpanded
                ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/30 dark:bg-amber-900/50 dark:text-amber-100"
                : "border-border-subtle bg-surface-solid text-muted hover:bg-surface-muted"
            }`}
            aria-expanded={isConfigExpanded}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
            >
              <path
                d="M4 7h16M7 12h10M10 17h4"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only sm:not-sr-only">{t("settingsLabel")}</span>
          </button>
        </div>
      </div>

      {isRetrying ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
          {t("retryingNotice")}
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.75rem] border border-teal-200/70 bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.1),transparent_55%),linear-gradient(180deg,rgba(240,253,250,0.92),rgba(255,255,255,0.96))] p-6 dark:border-teal-500/25 dark:bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.15),transparent_55%),linear-gradient(180deg,rgba(17,24,39,0.92),rgba(12,10,9,0.96))]">
          <p className="ui-eyebrow">{mcqLabels.promptLabel}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {mcqLabels.promptHint}
          </p>
          <button
            type="button"
            dir={card.mcq.promptDir}
            lang={card.mcq.promptLang}
            onClick={() =>
              onManualAudio(
                card.mcq.promptLang,
                card.mcq.promptPrimary,
                card.mcq.promptAudioUrl,
              )
            }
            className={`ui-touch-target mt-8 w-full touch-manipulation rounded-2xl px-3 py-5 text-center leading-tight text-foreground transition-colors hover:bg-teal-50/80 dark:hover:bg-teal-950/30 ${
              card.mcq.promptLang === "ar"
                ? "font-arabic text-5xl sm:text-6xl"
                : "text-3xl font-semibold sm:text-4xl"
            }`}
            aria-label={t("listenPromptAria", { word: card.mcq.promptPrimary })}
          >
            {card.mcq.promptPrimary}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            {t("tapToReplay")}
          </p>
        </div>

        <div className="space-y-3" aria-label={t("optionsAria")}>
          {card.mcq.options.map((option, index) => {
            const isSelected =
              visibleAnswerState?.selectedIndex === index;
            const label = String.fromCharCode(65 + index);

            return (
              <button
                key={`${card.progressId}-${option.lang}-${option.value}`}
                type="button"
                disabled={Boolean(visibleAnswerState) || isPending}
                onClick={() => onAnswer(index)}
                className={`ui-touch-target w-full touch-manipulation rounded-[1.35rem] border px-4 py-4 text-left transition-colors disabled:cursor-default ${optionButtonClassName(
                  {
                    answerState: visibleAnswerState,
                    correctIndex: card.mcq.correctIndex,
                    index,
                    isPending,
                    isSelected,
                  },
                )} ${
                  isSelected && !visibleAnswerState?.isCorrect
                    ? "animate-shake"
                    : ""
                }`}
              >
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/70 text-sm font-semibold dark:bg-white/10">
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

      <FeedbackPanel
        answerState={answerState}
        card={card}
        cardCount={cardCount}
        currentIndex={currentIndex}
        isPending={isPending}
        onContinue={onContinue}
        onManualAudio={onManualAudio}
        onRetry={onRetry}
        onRevealAnswer={onRevealAnswer}
      />
    </section>
  );
}
