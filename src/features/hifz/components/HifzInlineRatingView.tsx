"use client";

import { useTranslations } from "next-intl";
import { buildSignInPath } from "@/features/auth";
import {
  TasmiSessionUI,
  type AyahRange,
  type TasmiRatingLabel,
  type TasmiSessionResult,
} from "@/features/tasmi";
import type { HifzFlowType } from "../domain/sessionQueue";

export interface HifzInlineRatingError {
  message: string;
  requiresSignIn?: boolean;
  continueHref?: string;
  continueLabel?: string;
}

interface HifzInlineRatingViewProps {
  bottomOffsetPx: number;
  complete: boolean;
  error: HifzInlineRatingError | null;
  flowType: HifzFlowType;
  handleRate: (rating: 1 | 3) => void;
  handleTasmiCancel: () => void;
  handleTasmiEnd: (
    result: TasmiSessionResult,
    label: TasmiRatingLabel,
  ) => void;
  startTasmi: () => void;
  submitting: boolean;
  tasmiActive: boolean;
  tasmiAyahRanges: AyahRange[];
  tasmiEndAyah: number;
  tasmiExpectedText: string | null;
  tasmiLoading: boolean;
  tasmiStartAyah: number;
  tasmiSurahNumber: number;
  visible: boolean;
}

export function HifzInlineRatingView(props: HifzInlineRatingViewProps) {
  const t = useTranslations("hifz.inlineRatingView");
  const tAuth = useTranslations("auth");
  const tErrors = useTranslations("hifz.errors");
  const bottomStyle = {
    bottom: props.bottomOffsetPx,
    maxHeight: `calc(100dvh - ${props.bottomOffsetPx}px - 0.75rem)`,
  };
  const panelClasses =
    "ui-surface-solid fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain rounded-t-[2rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5";

  if (props.complete) {
    return (
      <div
        className={`${panelClasses} text-center`}
        style={bottomStyle}
        role="status"
      >
        <p className="text-sm font-semibold text-muted">{t("savedEyebrow")}</p>
        <p className="mt-2 text-xl font-bold text-foreground">{t("savedHeading")}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          {t("savedBody", {
            flow: props.flowType === "memorize" ? t("flowMemorizeWord") : t("flowReviewWord"),
          })}
        </p>
        <a
          href="/hifz"
          className="ui-touch-target mt-4 inline-flex items-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-teal-950"
        >
          {t("viewNextCta")}
        </a>
      </div>
    );
  }

  if (props.error) {
    return (
      <div
        className={`${panelClasses} border-t-rose-200 text-center dark:border-t-rose-900/40`}
        style={bottomStyle}
        role="alert"
      >
        <p className="text-sm font-semibold text-danger">{t("errorTitle")}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {props.error.message}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {props.error.continueHref ? (
            <a
              href={props.error.continueHref}
              className="ui-touch-target inline-flex items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-teal-950"
            >
              {props.error.continueLabel ?? tErrors("continueSessionDefault")}
            </a>
          ) : null}
          {props.error.requiresSignIn ? (
            <a
              href={buildSignInPath("/hifz")}
              className="ui-touch-target inline-flex items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-teal-950"
            >
              {tAuth("signIn")}
            </a>
          ) : null}
          <a
            href="/hifz"
            className="ui-touch-target inline-flex items-center rounded-xl border border-border-strong bg-surface-solid px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
          >
            {t("backCta")}
          </a>
        </div>
      </div>
    );
  }

  if (props.tasmiActive && props.tasmiExpectedText) {
    return (
      <div className={panelClasses} style={bottomStyle}>
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-center text-sm font-semibold text-muted">{t("tasmiEyebrow")}</p>
          <TasmiSessionUI
            expectedText={props.tasmiExpectedText}
            surahNumber={props.tasmiSurahNumber}
            startAyah={props.tasmiStartAyah}
            endAyah={props.tasmiEndAyah}
            ayahRanges={props.tasmiAyahRanges}
            onSessionEnd={props.handleTasmiEnd}
            onCancel={props.handleTasmiCancel}
          />
        </div>
      </div>
    );
  }

  const tasmiOnly = !props.visible && !props.tasmiActive;
  return (
    <div className={panelClasses} style={bottomStyle}>
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <p className="text-sm font-semibold text-muted">
            {tasmiOnly ? t("testOnlyEyebrow") : t("rateEyebrow")}
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {tasmiOnly
              ? t("testOnlyPrompt")
              : t("ratePrompt")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {tasmiOnly
              ? t("testOnlyHint")
              : t("rateHint")}
          </p>
        </div>

        {!tasmiOnly ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={props.submitting}
              onClick={() => props.handleRate(3)}
              className="ui-touch-target touch-manipulation rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60 dark:text-teal-950"
            >
              {props.submitting ? t("rateFluentSaving") : t("rateFluentCta")}
            </button>
            <button
              type="button"
              disabled={props.submitting}
              onClick={() => props.handleRate(1)}
              className="ui-touch-target touch-manipulation rounded-xl border border-rose-300 bg-rose-50 px-6 py-3 text-base font-semibold text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-100"
            >
              {t("rateForgotCta")}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          disabled={props.tasmiLoading || props.submitting}
          onClick={props.startTasmi}
          className={`ui-touch-target w-full touch-manipulation rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60 ${
            tasmiOnly ? "mt-4" : "mt-2"
          }`}
        >
          {props.tasmiLoading
            ? t("tasmiPreparing")
            : t("tasmiCta")}
        </button>
      </div>
    </div>
  );
}
