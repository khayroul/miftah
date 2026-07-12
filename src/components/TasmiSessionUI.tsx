"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TasmiSession, type TasmiEvent, type TasmiSessionResult } from "@/lib/tasmi/tasmi-session";
import { TasmiRecorder } from "@/lib/tasmi/tasmi-recorder";
import { TalqinPlayer } from "@/lib/tasmi/talqin-player";
import { tasmiResultToLabel, type TasmiRatingLabel } from "@/lib/tasmi/fsrs-bridge";

type TasmiStatus = "idle" | "ready" | "listening" | "processing" | "error" | "talqin" | "complete";

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
  idle: "Sedia untuk mula",
  ready: "Menyediakan mikrofon...",
  listening: "Sedang mendengar...",
  processing: "Menyemak bacaan...",
  error: "Kesilapan dikesan",
  talqin: "Memainkan talqin...",
  complete: "Selesai!",
};

const TASMI_TRANSCRIBE_ENDPOINT = "/api/tasmi/transcribe";

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

export function TasmiSessionUI({
  expectedText,
  surahNumber,
  startAyah,
  endAyah,
  ayahRanges,
  onSessionEnd,
  onCancel,
}: TasmiSessionUIProps) {
  const [status, setStatus] = useState<TasmiStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TasmiSessionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sessionRef = useRef<TasmiSession | null>(null);
  const recorderRef = useRef<TasmiRecorder | null>(null);
  const talqinRef = useRef<TalqinPlayer | null>(null);

  // Keep refs for values used inside handleEvent to avoid stale closures
  const ayahRangesRef = useRef(ayahRanges);
  const surahRef = useRef(surahNumber);
  const startAyahRef = useRef(startAyah);
  useEffect(() => {
    ayahRangesRef.current = ayahRanges;
    surahRef.current = surahNumber;
    startAyahRef.current = startAyah;
  }, [ayahRanges, surahNumber, startAyah]);

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
        setProgress(event.data?.progress ?? 0);
        break;
      case "error":
        setStatus("error");
        setProgress(event.data?.progress ?? 0);
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
        break;
      case "session-end":
        if (event.data?.result) {
          setResult(event.data.result);
        }
        break;
    }
  }, []);

  const startSession = useCallback(async () => {
    try {
      const configResponse = await fetch(TASMI_TRANSCRIBE_ENDPOINT, {
        method: "GET",
        cache: "no-store",
      });
      const configPayload = (await configResponse.json().catch(() => null)) as
        | { configured?: boolean }
        | null;

      if (!configResponse.ok || configPayload?.configured !== true) {
        setErrorMsg("Pelayan tasmi' belum dikonfigurasikan.");
        setStatus("idle");
        return;
      }
    } catch {
      setErrorMsg("Pelayan tasmi' tak dapat dihubungi sekarang.");
      setStatus("idle");
      return;
    }

    setStatus("ready");
    setProgress(0);
    setResult(null);
    setErrorMsg(null);

    const session = new TasmiSession(expectedText, {
      serverUrl: TASMI_TRANSCRIBE_ENDPOINT,
      silenceThresholdSeconds: 6,
      errorThresholdCount: 2,
    }, handleEvent);

    const talqin = new TalqinPlayer({
      wordsToPlay: 5,
      onPlaybackEnd: () => {
        recorderRef.current?.resume();
        setStatus("listening");
      },
    });

    // Load word-level timestamps for precise talqin seeking
    const alignData = await fetchAlignData();
    if (alignData) {
      talqin.loadFromRawData(alignData);
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
        setErrorMsg(err.message);
        setStatus("idle");
      },
    });

    sessionRef.current = session;
    recorderRef.current = recorder;
    talqinRef.current = talqin;

    session.start();
    await recorder.start();
  }, [expectedText, handleEvent]);

  const stopSession = useCallback(() => {
    recorderRef.current?.stop();
    talqinRef.current?.stop();
    const sessionResult = sessionRef.current?.end();
    if (sessionResult) {
      setResult(sessionResult);
      setStatus("complete");
    }
  }, []);

  const hasStartedRef = useRef(false);

  // Auto-start session on mount (guard against React Strict Mode double-mount)
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    void startSession();
    return () => {
      recorderRef.current?.stop();
      talqinRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const label = tasmiResultToLabel(result);
    const labelColors: Record<TasmiRatingLabel, string> = {
      ulang: "text-rose-500",
      tersangkut: "text-amber-500",
      lancar: "text-teal-500",
      mantap: "text-emerald-500",
    };
    const labelText: Record<TasmiRatingLabel, string> = {
      ulang: "Ulang",
      tersangkut: "Tersangkut",
      lancar: "Lancar",
      mantap: "Mantap",
    };

    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-50 p-6 dark:bg-stone-800/50">
        <p className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Keputusan Tasmi&apos;
        </p>
        <p className={`text-3xl font-bold ${labelColors[label]}`}>
          {labelText[label]}
        </p>
        <div className="flex gap-6 text-center text-sm text-stone-600 dark:text-stone-300">
          <div>
            <p className="text-lg font-bold">{Math.round(result.accuracy)}%</p>
            <p>Ketepatan</p>
          </div>
          <div>
            <p className="text-lg font-bold">{result.wordsCorrect}/{result.totalWords}</p>
            <p>Perkataan</p>
          </div>
          <div>
            <p className="text-lg font-bold">{result.talqinCount}</p>
            <p>Talqin</p>
          </div>
          <div>
            <p className="text-lg font-bold">{Math.round(result.durationSeconds)}s</p>
            <p>Masa</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSaveResult}
            className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Simpan &amp; Teruskan
          </button>
          <button
            type="button"
            onClick={startSession}
            className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Cuba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-50 p-6 dark:bg-stone-800/50">
      {errorMsg ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>
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
        <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
          {STATUS_LABELS[status]}
        </p>
      </div>

      {/* Progress bar */}
      {status !== "idle" ? (
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
      ) : null}

      {/* Controls */}
      <div className="flex gap-3">
        {status === "idle" ? (
          <button
            type="button"
            onClick={startSession}
            className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Mula Tasmi&apos;
          </button>
        ) : status !== "complete" ? (
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
          onClick={() => {
            recorderRef.current?.stop();
            talqinRef.current?.stop();
            onCancel();
          }}
          className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
