"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TasmiSession, type TasmiEvent, type TasmiSessionResult } from "../domain/tasmi-session";
import { TasmiRecorder, type TasmiRecorderError } from "../domain/tasmi-recorder";
import { TalqinPlayer } from "../domain/talqin-player";
import { tasmiResultToLabel, type TasmiRatingLabel } from "../domain/fsrs-bridge";
import { TasmiSessionResultView } from "./TasmiSessionResultView";

type TasmiStatus =
  | "checking"      // Pre-flight: probing server availability (mount)
  | "intro"         // Onboarding card — waiting for the user's "Mula" tap
  | "unavailable"   // Server not configured/reachable (pre-session or mid-session)
  | "idle"          // Mic error fallback — can retry via intro
  | "ready"         // Mic/VAD warming up
  | "listening"     // Live: waiting for speech
  | "processing"    // Chunk sent, awaiting transcription
  | "error"         // Genuine recitation mistake detected
  | "talqin"        // Playing corrective talqin audio
  | "complete";     // Range finished

export interface AyahRange {
  surah: number;
  ayah: number;
  /** First word index in the concatenated expected text */
  startWordIndex: number;
  /** Last word index (inclusive) in the concatenated expected text */
  endWordIndex: number;
}

interface TasmiSessionUIProps {
  /** Expected Quran text (uthmani) for the recitation range */
  expectedText: string;
  /** Surah number for talqin audio */
  surahNumber: number;
  /** Starting ayah number */
  startAyah: number;
  /** Ending ayah number */
  endAyah: number;
  /** Per-ayah word ranges for mapping word index → surah:ayah */
  ayahRanges?: AyahRange[];
  /** Called when session ends — provides FSRS rating label */
  onSessionEnd: (result: TasmiSessionResult, label: TasmiRatingLabel) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

const STATUS_LABELS: Record<TasmiStatus, string> = {
  checking: "Menyemak pelayan tasmi'...",
  intro: "Sedia untuk mula",
  unavailable: "Pelayan tidak tersedia",
  idle: "Sedia untuk mula",
  ready: "Menyediakan mikrofon...",
  listening: "Sedang mendengar...",
  processing: "Menyemak bacaan...",
  error: "Cuba ulang bahagian itu",
  talqin: "Dengar talqin, kemudian sambung...",
  complete: "Selesai!",
};

const TASMI_TRANSCRIBE_ENDPOINT = "/api/tasmi/transcribe";

// Minimal valid silent WAV (44-byte header, zero samples). Played inside the
// "Mula" tap to gesture-unlock the shared HTMLAudioElement for iOS Safari —
// talqin later reuses that unlocked element (see TalqinPlayer.attachAudioElement).
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

// Module-level cache for quran-align timestamp data (fetched once per page load)
let alignDataCache: Array<{ surah: number; ayah: number; segments: [number, number, number, number][] }> | null = null;
let alignDataPromise: Promise<typeof alignDataCache> | null = null;

function fetchAlignData(): Promise<typeof alignDataCache> {
  if (alignDataCache) return Promise.resolve(alignDataCache);
  if (alignDataPromise) return alignDataPromise;
  alignDataPromise = fetch("/data/quran-align-alafasy.json")
    .then(r => r.ok ? r.json() : null)
    .then(data => { alignDataCache = data; return data; })
    .catch(() => null);
  return alignDataPromise;
}

function resolveAyahFromWordIndex(
  wordIndex: number,
  ranges: AyahRange[],
  fallbackSurah: number,
  fallbackAyah: number,
): { surah: number; ayah: number; localWordIndex: number } {
  for (const r of ranges) {
    if (wordIndex >= r.startWordIndex && wordIndex <= r.endWordIndex) {
      return { surah: r.surah, ayah: r.ayah, localWordIndex: wordIndex - r.startWordIndex };
    }
  }
  return { surah: fallbackSurah, ayah: fallbackAyah, localWordIndex: 0 };
}

function micErrorMessage(error: TasmiRecorderError): string {
  switch (error.kind) {
    case "permission-denied":
      return "Akses mikrofon ditolak. Benarkan mikrofon untuk aplikasi ini dalam tetapan pelayar atau telefon anda, kemudian cuba lagi.";
    case "no-mic":
      return "Tiada mikrofon dikesan pada peranti ini.";
    default:
      return "Mikrofon tidak dapat dimulakan. Muat semula halaman dan cuba lagi.";
  }
}

export function TasmiSessionUI({
  expectedText,
  surahNumber,
  startAyah,
  endAyah,
  ayahRanges,
  onSessionEnd,
  onCancel,
}: TasmiSessionUIProps) {
  const [status, setStatus] = useState<TasmiStatus>("checking");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TasmiSessionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [midSessionOutage, setMidSessionOutage] = useState(false);
  const [endedEarly, setEndedEarly] = useState(false);

  const sessionRef = useRef<TasmiSession | null>(null);
  const recorderRef = useRef<TasmiRecorder | null>(null);
  const talqinRef = useRef<TalqinPlayer | null>(null);
  const primedAudioRef = useRef<HTMLAudioElement | null>(null);
  // Set on unmount/cancel so an in-flight async start can abort cleanly
  // instead of leaking a live mic that nothing will ever stop.
  const cancelledRef = useRef(false);
  const progressRef = useRef(0);

  // Keep refs for values used inside handleEvent to avoid stale closures
  const ayahRangesRef = useRef(ayahRanges);
  const surahRef = useRef(surahNumber);
  const startAyahRef = useRef(startAyah);
  useEffect(() => {
    ayahRangesRef.current = ayahRanges;
    surahRef.current = surahNumber;
    startAyahRef.current = startAyah;
  }, [ayahRanges, surahNumber, startAyah]);

  const teardown = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    talqinRef.current?.stop();
    talqinRef.current = null;
    sessionRef.current = null;
  }, []);

  /**
   * Server pre-flight: {configured, reachable} from the Next route (which
   * probes the transcription server's /health). Returns a status verdict.
   */
  const checkServer = useCallback(async (): Promise<"ok" | "unconfigured" | "unreachable"> => {
    try {
      const response = await fetch(TASMI_TRANSCRIBE_ENDPOINT, { method: "GET", cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { configured?: boolean; reachable?: boolean }
        | null;
      if (!response.ok || payload?.configured !== true) return "unconfigured";
      if (payload?.reachable !== true) return "unreachable";
      return "ok";
    } catch {
      return "unreachable";
    }
  }, []);

  // Mount: probe availability, then show the intro (never auto-start the mic).
  useEffect(() => {
    cancelledRef.current = false;
    let stale = false;
    void (async () => {
      const verdict = await checkServer();
      if (stale || cancelledRef.current) return;
      if (verdict === "ok") {
        setStatus("intro");
      } else {
        setErrorMsg(
          verdict === "unconfigured"
            ? "Pelayan tasmi' belum dikonfigurasikan."
            : "Pelayan tasmi' tidak dapat dihubungi sekarang. Cuba sebentar lagi.",
        );
        setStatus("unavailable");
      }
    })();
    return () => {
      stale = true;
      cancelledRef.current = true;
      recorderRef.current?.stop();
      talqinRef.current?.stop();
    };
  }, [checkServer]);

  const handleEvent = useCallback((event: TasmiEvent) => {
    switch (event.type) {
      case "ready":
        setStatus("ready");
        break;
      case "listening":
        setStatus("listening");
        break;
      case "processing":
        setStatus("processing");
        break;
      case "match":
        setStatus("listening");
        setHint(null);
        setProgress(event.data?.progress ?? 0);
        progressRef.current = event.data?.progress ?? 0;
        break;
      case "no-speech":
        // Whisper heard nothing usable — NOT a mistake. Gentle nudge only.
        setHint("Tiada bacaan dikesan — teruskan membaca dengan jelas.");
        setStatus("listening");
        break;
      case "server-unavailable":
        // Transport failure mid-session — pause honestly, never fake a mistake.
        recorderRef.current?.pause();
        setMidSessionOutage(true);
        setErrorMsg("Pelayan tasmi' terputus. Bacaan anda tidak dikira salah — sambung bila pelayan kembali.");
        setStatus("unavailable");
        break;
      case "error":
        setStatus("error");
        setProgress(event.data?.progress ?? 0);
        progressRef.current = event.data?.progress ?? 0;
        break;
      case "talqin":
        setStatus("talqin");
        recorderRef.current?.pause();
        if (event.data?.talqinWordIndex != null) {
          const ranges = ayahRangesRef.current;
          const surah = surahRef.current;
          const ayah = startAyahRef.current;
          const resolved = ranges?.length
            ? resolveAyahFromWordIndex(event.data.talqinWordIndex, ranges, surah, ayah)
            : { surah, ayah, localWordIndex: event.data.talqinWordIndex };
          talqinRef.current?.play(
            resolved.surah,
            resolved.ayah,
            resolved.localWordIndex,
          ).catch(() => {
            recorderRef.current?.resume();
            setStatus("listening");
          });
        }
        break;
      case "complete":
        setStatus("complete");
        setProgress(1);
        progressRef.current = 1;
        // Natural completion: the mic must not stay live under the result view.
        recorderRef.current?.stop();
        talqinRef.current?.stop();
        break;
      case "session-end":
        recorderRef.current?.stop();
        talqinRef.current?.stop();
        if (event.data?.result) {
          setResult(event.data.result);
        }
        break;
    }
  }, []);

  /**
   * Start (or restart) a live session. MUST be invoked from a user tap —
   * the tap is what unlocks audio + mic on iOS Safari.
   */
  const startSession = useCallback(async () => {
    // Clean slate: tear down any previous run so a retry can never stack a
    // second live recorder/talqin on top of the first.
    teardown();
    setResult(null);
    setErrorMsg(null);
    setHint(null);
    setProgress(0);
    progressRef.current = 0;
    setEndedEarly(false);
    setMidSessionOutage(false);

    // Gesture-unlock ONE shared audio element (inside this tap) and reuse it
    // for every talqin playback. Without this, iOS blocks talqin audio.
    if (!primedAudioRef.current && typeof Audio !== "undefined") {
      const el = new Audio(SILENT_WAV_DATA_URI);
      el.play().then(() => el.pause()).catch(() => { /* priming is best-effort */ });
      primedAudioRef.current = el;
    }

    setStatus("ready");

    const session = new TasmiSession(expectedText, {
      serverUrl: TASMI_TRANSCRIBE_ENDPOINT,
      silenceThresholdSeconds: 6,
      errorThresholdCount: 2,
    }, handleEvent);

    const talqin = new TalqinPlayer({
      wordsToPlay: 3, // spec (operator vision): talqin = 3 linked correct words
      onPlaybackEnd: () => {
        recorderRef.current?.resume();
        setStatus("listening");
      },
    });
    if (primedAudioRef.current) {
      talqin.attachAudioElement(primedAudioRef.current);
    }

    const recorder = new TasmiRecorder({
      silenceTimeoutSeconds: 6,
      onSpeechEnd: (audioBlob) => {
        session.processAudioChunk(audioBlob);
      },
      onSilenceTimeout: () => {
        session.onSilenceTimeout();
      },
      onError: (err) => {
        setErrorMsg(micErrorMessage(err));
        setStatus("intro");
      },
    });

    // Assign refs BEFORE the awaits below so unmount/cancel can always stop them.
    sessionRef.current = session;
    recorderRef.current = recorder;
    talqinRef.current = talqin;

    // Load word-level timestamps for precise talqin seeking
    const alignData = await fetchAlignData();
    if (cancelledRef.current) { teardown(); return; }
    if (alignData) {
      talqin.loadFromRawData(alignData);
    }

    session.start();
    await recorder.start();
    if (cancelledRef.current) { teardown(); return; }
  }, [expectedText, handleEvent, teardown]);

  /** Mid-session outage recovery: re-probe, then resume where the reciter left off. */
  const resumeAfterOutage = useCallback(async () => {
    setStatus("checking");
    const verdict = await checkServer();
    if (cancelledRef.current) return;
    if (verdict === "ok") {
      setErrorMsg(null);
      setMidSessionOutage(false);
      recorderRef.current?.resume();
      setStatus("listening");
    } else {
      setErrorMsg("Pelayan tasmi' masih tidak dapat dihubungi. Cuba sebentar lagi.");
      setStatus("unavailable");
    }
  }, [checkServer]);

  /** Pre-session unavailable → re-probe and enter intro when healthy. */
  const recheckServer = useCallback(async () => {
    setStatus("checking");
    setErrorMsg(null);
    const verdict = await checkServer();
    if (cancelledRef.current) return;
    if (verdict === "ok") {
      setStatus("intro");
    } else {
      setErrorMsg(
        verdict === "unconfigured"
          ? "Pelayan tasmi' belum dikonfigurasikan."
          : "Pelayan tasmi' tidak dapat dihubungi sekarang. Cuba sebentar lagi.",
      );
      setStatus("unavailable");
    }
  }, [checkServer]);

  const stopSession = useCallback(() => {
    const stoppedBeforeEnd = progressRef.current < 1;
    recorderRef.current?.stop();
    talqinRef.current?.stop();
    const sessionResult = sessionRef.current?.end();
    if (sessionResult) {
      setEndedEarly(stoppedBeforeEnd);
      setResult(sessionResult);
      setStatus("complete");
    }
  }, []);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    teardown();
    onCancel();
  }, [teardown, onCancel]);

  const handleSaveResult = useCallback(async () => {
    if (!result) return;

    const label = tasmiResultToLabel(result);

    try {
      await fetch("/api/tasmi/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surah_number: surahNumber,
          start_ayah: startAyah,
          end_ayah: endAyah,
          total_words: result.totalWords,
          words_correct: result.wordsCorrect,
          accuracy: Math.round(result.accuracy * 100) / 100,
          talqin_count: result.talqinCount,
          error_positions: result.errorPositions,
          duration_seconds: Math.round(result.durationSeconds),
        }),
      });
    } catch {
      // Non-critical — session result is still usable for FSRS
    }

    onSessionEnd(result, label);
  }, [result, surahNumber, startAyah, endAyah, onSessionEnd]);

  // ---------- Render ----------

  if (result && status === "complete") {
    return (
      <TasmiSessionResultView
        result={result}
        endedEarly={endedEarly}
        onRetry={startSession}
        onSave={handleSaveResult}
      />
    );
  }

  // Pre-flight probe in progress
  if (status === "checking") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-50 p-6 dark:bg-stone-800/50">
        <div className="h-3 w-3 animate-pulse rounded-full bg-stone-400" />
        <p role="status" aria-live="polite" className="text-sm font-medium text-stone-700 dark:text-stone-300">
          {STATUS_LABELS.checking}
        </p>
      </div>
    );
  }

  // Server unavailable — honest state, never a fake "mistake"
  if (status === "unavailable") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-50 p-6 dark:bg-stone-800/50">
        <p role="status" aria-live="assertive" className="max-w-sm text-center text-sm text-rose-600 dark:text-rose-400">
          {errorMsg ?? "Pelayan tasmi' tidak tersedia sekarang."}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={midSessionOutage ? resumeAfterOutage : recheckServer}
            className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            {midSessionOutage ? "Sambung Semula" : "Semak Semula"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  // Onboarding intro — the "Mula" tap is the iOS gesture unlock + mic start
  if (status === "intro" || status === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-50 p-6 dark:bg-stone-800/50">
        {errorMsg ? (
          <p role="alert" className="max-w-sm text-center text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>
        ) : null}
        <p className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Tasmi&apos; — Semak Bacaan Dengan Suara
        </p>
        <ol className="max-w-sm list-decimal space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">
          <li>Baca dengan suara yang jelas, dari perkataan pertama.</li>
          <li>Berhenti seketika selepas setiap bahagian — app akan semak bacaan anda.</li>
          <li>Jika tersilap atau tersekat, app akan <span className="font-medium">bacakan beberapa perkataan panduan (talqin)</span>, kemudian tunggu anda menyambung.</li>
        </ol>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Mikrofon hanya digunakan semasa sesi ini.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={startSession}
            className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Mula Tasmi&apos;
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-50 p-6 dark:bg-stone-800/50">
      {errorMsg ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>
      ) : null}
      {hint ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{hint}</p>
      ) : null}

      {/* Status indicator */}
      <div className="flex items-center gap-3">
        <div
          className={`h-3 w-3 rounded-full transition-colors ${
            status === "listening"
              ? "animate-pulse bg-rose-500"
              : status === "processing"
                ? "animate-pulse bg-amber-500"
                : status === "talqin"
                  ? "animate-pulse bg-teal-500"
                  : status === "error"
                    ? "bg-rose-500"
                    : "bg-stone-400"
          }`}
        />
        <p role="status" aria-live="polite" className="text-sm font-medium text-stone-700 dark:text-stone-300">
          {STATUS_LABELS[status]}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
          <div
            className="h-full rounded-full bg-teal-500 transition-all duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-center text-xs text-stone-500 dark:text-stone-400">
          {Math.round(progress * 100)}%
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {status !== "complete" ? (
          <button
            type="button"
            onClick={stopSession}
            className="rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
          >
            Hentikan
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
