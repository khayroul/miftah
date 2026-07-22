"use client";

import { useTranslations } from "next-intl";
import {
  TasmiSessionUI,
  type AyahRange,
  type TasmiRatingLabel,
  type TasmiSessionResult,
} from "@/features/tasmi";
import { buildSignInPath } from "@/features/auth";
import type {
  ChunkSizeSuggestion,
  MemorizeChunk,
  MemorizeChunkSizeOption,
} from "../domain/memorizeChunks";

export type MemorizeStep = 1 | 2 | 3 | 4;

export interface MemorizeFlowError {
  message: string;
  requiresSignIn?: boolean;
  continueHref?: string;
  continueLabel?: string;
}

type MemorizePanelTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

// STEPS/CHUNK_SIZE_OPTIONS are built inside the component (not at module
// scope) because useTranslations() is a hook and must run in render.
function buildSteps(t: MemorizePanelTranslator): Array<{
  step: MemorizeStep;
  label: string;
  description: string;
  nextLabel: string;
}> {
  return [
    {
      step: 1,
      label: t("step1Label"),
      description: t("step1Description"),
      nextLabel: t("step1Next"),
    },
    {
      step: 2,
      label: t("step2Label"),
      description: t("step2Description"),
      nextLabel: t("step2Next"),
    },
    {
      step: 3,
      label: t("step3Label"),
      description: t("step3Description"),
      nextLabel: t("step3Next"),
    },
    {
      step: 4,
      label: t("step4Label"),
      description: t("step4Description"),
      nextLabel: "",
    },
  ];
}

function buildChunkSizeOptions(
  t: MemorizePanelTranslator,
): Array<{ label: string; value: MemorizeChunkSizeOption }> {
  return [
    { label: t("chunkSizeAuto"), value: "auto" },
    { label: t("chunkSizeOption", { count: 1 }), value: 1 },
    { label: t("chunkSizeOption", { count: 2 }), value: 2 },
    { label: t("chunkSizeOption", { count: 3 }), value: 3 },
  ];
}

interface HifzMemorizePanelProps {
  autoAdvancing: boolean;
  bottomOffsetPx: number;
  chunkCount: number;
  chunkSize: MemorizeChunkSizeOption;
  chunkSuggestion: ChunkSizeSuggestion;
  complete: boolean;
  currentChunk: MemorizeChunk | null;
  currentChunkIndex: number;
  currentStep: MemorizeStep;
  error: MemorizeFlowError | null;
  onApplySuggestion: () => void;
  onBack: () => void;
  onChunkListen: () => void;
  onChunkPause: () => void;
  onChunkSizeChange: (size: MemorizeChunkSizeOption) => void;
  onDismissSuggestion: () => void;
  onJumpToChunk: (index: number) => void;
  onNext: () => void;
  onRate: (confident: boolean) => void;
  onTasmiCancel: () => void;
  onTasmiEnd: (
    result: TasmiSessionResult,
    label: TasmiRatingLabel,
  ) => void;
  onTasmiStart: () => void;
  onToggleChunkSize: () => void;
  setPanelElement: (element: HTMLDivElement | null) => void;
  showChunkSize: boolean;
  submitting: boolean;
  suggestionDismissed: boolean;
  tasmiActive: boolean;
  tasmiAyahRanges: AyahRange[];
  tasmiEndAyah: number;
  tasmiExpectedText: string | null;
  tasmiLoading: boolean;
  tasmiStartAyah: number;
  tasmiSurahNumber: number;
}

function describeChunk(chunk: MemorizeChunk | null, t: MemorizePanelTranslator): string {
  const first = chunk?.items[0];
  if (!first) return t("describeChunkEmpty");
  const last = chunk.items[chunk.items.length - 1] ?? first;
  return first.ayahKey === last.ayahKey
    ? t("describeChunkSingle", { key: first.ayahKey })
    : t("describeChunkRange", { start: first.ayahKey, end: last.ayahKey });
}

export function HifzMemorizePanel(props: HifzMemorizePanelProps) {
  const { setPanelElement } = props;
  const t = useTranslations("hifz.memorizePanel");
  if (props.complete) return <CompletionPanel {...props} />;
  if (props.error) return <ErrorPanel {...props} error={props.error} />;

  const STEPS = buildSteps(t);
  const stepInfo = STEPS[props.currentStep - 1];
  const restartLabel =
    props.currentStep === 3 ? t("restartListen") : t("restartPlay");

  return (
    <div
      ref={setPanelElement}
      className="ui-surface-solid fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain rounded-t-[2rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
      style={{
        bottom: props.bottomOffsetPx,
        maxHeight: `calc(100dvh - ${props.bottomOffsetPx}px - 0.75rem)`,
      }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-strong sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ui-eyebrow">
              {t("chunkCounter", {
                current: props.chunkCount > 0 ? props.currentChunkIndex + 1 : 0,
                total: props.chunkCount,
              })}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {stepInfo.label}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {stepInfo.description}
            </p>
          </div>

          <button
            type="button"
            onClick={props.onToggleChunkSize}
            className="ui-touch-target inline-flex shrink-0 touch-manipulation items-center gap-2 rounded-xl border border-border-subtle bg-surface-muted px-3 text-left text-xs font-semibold text-foreground transition-colors hover:bg-surface-strong"
            aria-expanded={props.showChunkSize}
          >
            <span className="hidden max-w-40 truncate sm:inline">
              {describeChunk(props.currentChunk, t)}
            </span>
            <span>{t("sizeToggle")}</span>
            <svg
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${
                props.showChunkSize ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19 9-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        <div
          className="mt-4 grid grid-cols-4 gap-2"
          aria-label={t("stepAria", { step: props.currentStep })}
        >
          {STEPS.map((step) => {
            const complete = step.step < props.currentStep;
            const active = step.step === props.currentStep;
            return (
              <div key={step.step} className="min-w-0">
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    complete || active ? "bg-amber-500" : "bg-surface-strong"
                  }`}
                />
                <p
                  className={`mt-1 truncate text-[0.68rem] font-semibold ${
                    active ? "text-amber-700 dark:text-amber-300" : "text-muted"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  {step.step}. {step.label}
                </p>
              </div>
            );
          })}
        </div>

        {props.autoAdvancing ? (
          <p
            className="mt-3 animate-pulse text-center text-sm font-semibold text-warning"
            aria-live="polite"
          >
            {t("autoAdvancing")}
          </p>
        ) : null}

        {props.showChunkSize ? <ChunkSizeControls {...props} /> : null}

        {props.tasmiActive && props.tasmiExpectedText ? (
          <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-muted p-3">
            <TasmiSessionUI
              expectedText={props.tasmiExpectedText}
              surahNumber={props.tasmiSurahNumber}
              startAyah={props.tasmiStartAyah}
              endAyah={props.tasmiEndAyah}
              ayahRanges={props.tasmiAyahRanges}
              onSessionEnd={props.onTasmiEnd}
              onCancel={props.onTasmiCancel}
            />
          </div>
        ) : props.currentStep === 3 ? (
          <button
            type="button"
            disabled={props.tasmiLoading}
            onClick={props.onTasmiStart}
            className="ui-touch-target mt-4 w-full touch-manipulation rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-100 dark:hover:bg-rose-950/55"
          >
            {props.tasmiLoading
              ? t("tasmiPreparing")
              : t("tasmiCta")}
          </button>
        ) : null}

        {props.currentStep < 4 ? (
          <StepActions
            {...props}
            nextLabel={stepInfo.nextLabel}
            restartLabel={restartLabel}
          />
        ) : (
          <RatingButtons {...props} />
        )}
      </div>
    </div>
  );
}

function ChunkSizeControls(props: HifzMemorizePanelProps) {
  const t = useTranslations("hifz.memorizePanel");
  const CHUNK_SIZE_OPTIONS = buildChunkSizeOptions(t);
  return (
    <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-muted p-3">
      <p className="text-sm font-semibold text-foreground">
        {t("chunkSizePrompt")}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHUNK_SIZE_OPTIONS.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => props.onChunkSizeChange(option.value)}
            className={`ui-touch-target touch-manipulation rounded-xl px-3 text-xs font-semibold transition-colors ${
              props.chunkSize === option.value
                ? "bg-foreground text-background"
                : "border border-border-subtle bg-surface-solid text-foreground hover:bg-surface-strong"
            }`}
            aria-pressed={props.chunkSize === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      {props.chunkSuggestion && !props.suggestionDismissed ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
          <p className="min-w-0 flex-1 text-xs text-amber-900 dark:text-amber-100">
            {props.chunkSuggestion === "smaller"
              ? t("suggestionSmaller")
              : t("suggestionBigger")}
          </p>
          <button
            type="button"
            onClick={props.onApplySuggestion}
            className="ui-touch-target shrink-0 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
          >
            {t("suggestionApply")}
          </button>
          <button
            type="button"
            onClick={props.onDismissSuggestion}
            className="ui-touch-target inline-flex shrink-0 items-center justify-center rounded-lg text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
            aria-label={t("dismissSuggestionAria")}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StepActions(
  props: HifzMemorizePanelProps & {
    nextLabel: string;
    restartLabel: string;
  },
) {
  const t = useTranslations("hifz.memorizePanel");
  return (
    <div className="mt-4">
      <div
        className={`grid gap-2 ${
          props.currentStep > 1 ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        <button
          type="button"
          onClick={props.onChunkListen}
          className="ui-touch-target touch-manipulation rounded-xl border border-border-subtle bg-surface-solid px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
        >
          {props.restartLabel}
        </button>
        <button
          type="button"
          onClick={props.onChunkPause}
          className="ui-touch-target touch-manipulation rounded-xl border border-border-subtle bg-surface-solid px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          {t("pauseAudio")}
        </button>
        {props.currentStep > 1 ? (
          <button
            type="button"
            onClick={props.onBack}
            className="ui-touch-target touch-manipulation rounded-xl border border-border-subtle bg-surface-solid px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            {t("backStep")}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={props.onNext}
        className="ui-touch-target mt-2 w-full touch-manipulation rounded-xl bg-amber-600 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-700"
      >
        {props.nextLabel}
      </button>

      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2">
        <ArrowButton
          disabled={props.currentChunkIndex === 0}
          label={t("jumpPrevAria")}
          direction="back"
          onClick={() => props.onJumpToChunk(props.currentChunkIndex - 1)}
        />
        <a
          href="/hifz"
          className="ui-touch-target inline-flex items-center rounded-xl px-3 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          {t("exitSaveCta")}
        </a>
        <ArrowButton
          disabled={props.currentChunkIndex >= props.chunkCount - 1}
          label={t("jumpNextAria")}
          direction="forward"
          onClick={() => props.onJumpToChunk(props.currentChunkIndex + 1)}
        />
      </div>
    </div>
  );
}

function ArrowButton(props: {
  disabled: boolean;
  direction: "back" | "forward";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="ui-touch-target inline-flex touch-manipulation items-center justify-center rounded-xl border border-border-subtle bg-surface-solid px-3 text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      aria-label={props.label}
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={props.direction === "back" ? "m15 19-7-7 7-7" : "m9 5 7 7-7 7"}
        />
      </svg>
    </button>
  );
}

function RatingButtons(props: HifzMemorizePanelProps) {
  const t = useTranslations("hifz.memorizePanel");
  return (
    <div className="mt-4">
      <p className="text-center text-sm font-medium text-muted">
        {t("ratingPrompt")}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={props.submitting}
          onClick={() => props.onRate(true)}
          className="ui-touch-target touch-manipulation rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60 dark:text-slate-950"
        >
          {props.submitting ? t("ratingConfidentSaving") : t("ratingConfidentCta")}
        </button>
        <button
          type="button"
          disabled={props.submitting}
          onClick={() => props.onRate(false)}
          className="ui-touch-target touch-manipulation rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60"
        >
          {t("ratingUnsureCta")}
        </button>
      </div>
    </div>
  );
}

function CompletionPanel(props: HifzMemorizePanelProps) {
  const { bottomOffsetPx, setPanelElement } = props;
  const t = useTranslations("hifz.memorizePanel");
  return (
    <div
      ref={setPanelElement}
      className="ui-surface-solid fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain rounded-t-[2rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 text-center"
      style={{
        bottom: bottomOffsetPx,
        maxHeight: `calc(100dvh - ${bottomOffsetPx}px - 0.75rem)`,
      }}
    >
      <p className="ui-eyebrow">{t("completeEyebrow")}</p>
      <p className="mt-2 text-xl font-bold text-foreground">{t("completeHeading")}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        {t("completeBody")}
      </p>
      <a
        href="/hifz"
        className="ui-touch-target mt-4 inline-flex items-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
      >
        {t("completeCta")}
      </a>
    </div>
  );
}

function ErrorPanel(
  props: HifzMemorizePanelProps & { error: MemorizeFlowError },
) {
  const { bottomOffsetPx, error, setPanelElement } = props;
  const t = useTranslations("hifz.memorizePanel");
  const tErrors = useTranslations("hifz.errors");
  const tAuth = useTranslations("auth");
  return (
    <div
      ref={setPanelElement}
      className="ui-surface-solid fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain rounded-t-[2rem] border-t-rose-200 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 text-center dark:border-t-rose-900/40"
      style={{
        bottom: bottomOffsetPx,
        maxHeight: `calc(100dvh - ${bottomOffsetPx}px - 0.75rem)`,
      }}
    >
      <p className="text-sm font-semibold text-danger">{t("errorTitle")}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
        {error.message}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {error.continueHref ? (
          <a
            href={error.continueHref}
            className="ui-touch-target inline-flex items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
          >
            {error.continueLabel ?? tErrors("continueSessionDefault")}
          </a>
        ) : null}
        {error.requiresSignIn ? (
          <a
            href={buildSignInPath("/hifz")}
            className="ui-touch-target inline-flex items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
          >
            {tAuth("signIn")}
          </a>
        ) : null}
        <a
          href="/hifz"
          className="ui-touch-target inline-flex items-center rounded-xl border border-border-strong bg-surface-solid px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
        >
          {t("errorBackCta")}
        </a>
      </div>
    </div>
  );
}
