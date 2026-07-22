"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TasmiSessionUI } from "./TasmiSessionUI";
import { buildExamRound, type JuzukExamRoundContract } from "../domain/juzuk-exam";

/**
 * Mode B — Juzuk exam (operator vision):
 * pick a juz → the app reads a RANDOM test ayah aloud → the reciter continues
 * from that ayah to the end of its mushaf page → NEXT loops with a new test
 * ayah. Per-session exam/practice toggle gates talqin help (clarifier #1).
 */

type ExamMode = "exam" | "practice";

interface RoundState extends JuzukExamRoundContract {
  testAyahId: number;
  pageNumber: number;
  /** Remount key so each round gets a fresh session lifecycle */
  roundKey: number;
}

interface JuzukRoundResponse {
  round?: {
    juz: number;
    pageNumber: number;
    testAyah: { id: number; surahId: number; ayahNumber: number; textSimple: string };
    ayahs: Array<{ id: number; surahId: number; ayahNumber: number; textSimple: string }>;
  };
  error?: string;
}

const JUZ_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);
/** Avoid repeating recent test ayat within a sitting (server re-pools when exhausted). */
const RECENT_LIMIT = 20;

export function TasmiJuzukExam() {
  const t = useTranslations("tasmi.juzukExam");
  const strong = (chunks: ReactNode) => (
    <strong className="font-semibold text-foreground">{chunks}</strong>
  );
  const [juz, setJuz] = useState(1);
  const [mode, setMode] = useState<ExamMode>("exam");
  const [round, setRound] = useState<RoundState | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recentIdsRef = useRef<number[]>([]);
  const roundCounterRef = useRef(0);

  const fetchRound = useCallback(async (targetJuz: number) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const exclude = recentIdsRef.current.join(",");
      const response = await fetch(
        `/api/tasmi/juzuk-round?juz=${targetJuz}${exclude ? `&exclude=${exclude}` : ""}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as JuzukRoundResponse | null;
      if (!response.ok || !payload?.round) {
        setErrorMsg(
          response.status === 401
            ? t("authRequired")
            : payload?.error ?? t("genericStartError"),
        );
        setRound(null);
        return;
      }

      const contract = buildExamRound(payload.round.ayahs);
      if (!contract) {
        setErrorMsg(t("noAyahFound"));
        setRound(null);
        return;
      }

      recentIdsRef.current = [
        ...recentIdsRef.current.slice(-(RECENT_LIMIT - 1)),
        payload.round.testAyah.id,
      ];
      roundCounterRef.current += 1;
      setRound({
        ...contract,
        testAyahId: payload.round.testAyah.id,
        pageNumber: payload.round.pageNumber,
        roundKey: roundCounterRef.current,
      });
    } catch {
      setErrorMsg(t("connectionError"));
      setRound(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleSessionEnd = useCallback(() => {
    // NEXT loop: result saved (via the session UI) -> new random test ayah.
    void fetchRound(juz);
  }, [fetchRound, juz]);

  const handleCancel = useCallback(() => {
    setRound(null);
  }, []);

  // ---------- Setup card ----------
  if (!round) {
    return (
      <div className="ui-surface-solid flex flex-col items-center gap-5 rounded-3xl p-5 sm:p-6">
        <p className="ui-eyebrow">
          {t("eyebrow")}
        </p>
        <p className="max-w-sm text-center text-sm leading-6 text-muted">
          {t.rich("introText", { strong })}
        </p>

        {errorMsg ? (
          <p role="alert" className="max-w-sm text-center text-sm text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        ) : null}

        <label className="flex w-full max-w-sm items-center justify-between gap-3 text-sm font-semibold text-foreground">
          {t("chooseJuzukLabel")}
          <select
            value={juz}
            onChange={e => setJuz(Number(e.target.value))}
            className="ui-touch-target cursor-pointer rounded-xl border border-border-strong bg-surface-solid px-3 py-2 text-foreground"
          >
            {JUZ_OPTIONS.map(j => (
              <option key={j} value={j}>{t("juzukOption", { juz: j })}</option>
            ))}
          </select>
        </label>

        <fieldset className="w-full max-w-sm">
          <legend className="mb-2 text-sm font-semibold text-foreground">{t("chooseModeLegend")}</legend>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-muted p-1.5">
            <button
              type="button"
              onClick={() => setMode("exam")}
              aria-pressed={mode === "exam"}
              className={`ui-touch-target cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                mode === "exam"
                  ? "bg-teal-600 text-white"
                  : "text-muted hover:bg-surface-solid"
              }`}
            >
              {t("modeExamButton")}
            </button>
            <button
              type="button"
              onClick={() => setMode("practice")}
              aria-pressed={mode === "practice"}
              className={`ui-touch-target cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                mode === "practice"
                  ? "bg-teal-600 text-white"
                  : "text-muted hover:bg-surface-solid"
              }`}
            >
              {t("modePracticeButton")}
            </button>
          </div>
        </fieldset>
        <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-sm leading-6 text-muted">
          {mode === "exam"
            ? t("examModeDescription")
            : t("practiceModeDescription")}
        </div>

        <button
          type="button"
          onClick={() => void fetchRound(juz)}
          disabled={loading}
          className="ui-touch-target w-full max-w-sm cursor-pointer rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? t("preparingButton")
            : mode === "exam"
              ? t("startExamButton")
              : t("startPracticeButton")}
        </button>
      </div>
    );
  }

  // ---------- Exam round ----------
  return (
    <div className="flex flex-col gap-3">
      <p className="ui-eyebrow text-center">
        {t("roundHeader", { juz, page: round.pageNumber })}
        {mode === "practice" ? ` · ${t("roundHeaderStarted", { surah: round.surahNumber, ayah: round.startAyah })}` : ""}
        {" · "}{mode === "exam" ? t("modeExamLabel") : t("modePracticeLabel")}
      </p>
      <TasmiSessionUI
        key={round.roundKey}
        expectedText={round.expectedText}
        surahNumber={round.surahNumber}
        startAyah={round.startAyah}
        endAyah={round.endAyah}
        ayahRanges={round.ayahRanges}
        talqinEnabled={mode === "practice"}
        sessionMode={mode}
        startPromptAyah={{ surah: round.surahNumber, ayah: round.startAyah }}
        onSessionEnd={handleSessionEnd}
        onCancel={handleCancel}
      />
    </div>
  );
}
