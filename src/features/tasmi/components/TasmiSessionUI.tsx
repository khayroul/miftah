"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TasmiSession, type TasmiEvent, type TasmiSessionResult } from "../domain/tasmi-session";
import { TasmiRecorder, type TasmiRecorderError } from "../domain/tasmi-recorder";
import { TasmiStreamClient } from "../domain/tasmi-stream-client";
import { TASMI_STREAM_CAPACITY_FULL_CODE } from "../domain/tasmi-stream-protocol";
import { TalqinPlayer } from "../domain/talqin-player";
import { tasmiResultToLabel, type TasmiRatingLabel } from "../domain/fsrs-bridge";
import {
  TasmiSessionResultView,
  type TasmiSaveState,
} from "./TasmiSessionResultView";
import {
  TasmiActiveView,
  TasmiBusyView,
  TasmiCheckingView,
  TasmiIntroView,
  TasmiUnavailableView,
  type TasmiSessionMode,
  type TasmiStatus,
  type TasmiStreamMode,
} from "./TasmiSessionViews";

export type { TasmiSessionMode } from "./TasmiSessionViews";

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
  /**
   * Mode B exam/practice toggle: false suppresses talqin help (mistakes are
   * still tracked and scored). Default true (Mode A behaviour).
   */
  talqinEnabled?: boolean;
  /**
   * Practice shows word-follow and corrective help. Exam hides the expected
   * text and immediate mistake cues so the assessment remains authentic.
   */
  sessionMode?: TasmiSessionMode;
  /**
   * Mode B start prompt: when set, this ayah is read aloud after "Mula"
   * (recorder paused), and listening begins when playback ends.
   */
  startPromptAyah?: { surah: number; ayah: number };
}

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

type TasmiUiTranslator = (key: string, values?: Record<string, string | number>) => string;

function micErrorMessage(error: TasmiRecorderError, tRecorder: TasmiUiTranslator): string {
  switch (error.kind) {
    case "permission-denied":
      return tRecorder("permissionDenied");
    case "no-mic":
      return tRecorder("noMic");
    default:
      return tRecorder("genericError");
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
  talqinEnabled = true,
  sessionMode = "practice",
  startPromptAyah,
}: TasmiSessionUIProps) {
  const t = useTranslations("tasmi.session");
  const tRecorder = useTranslations("tasmi.recorder");
  const [status, setStatus] = useState<TasmiStatus>("checking");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TasmiSessionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [midSessionOutage, setMidSessionOutage] = useState(false);
  const [endedEarly, setEndedEarly] = useState(false);
  // Live word-follow state (Mode A): matcher cursor + accumulated error positions
  const [followIndex, setFollowIndex] = useState(-1);
  const [errorPositions, setErrorPositions] = useState<ReadonlySet<number>>(new Set());
  const [tentativeFollowIndex, setTentativeFollowIndex] = useState<number | null>(null);
  const [tentativeErrorPositions, setTentativeErrorPositions] = useState<ReadonlySet<number>>(new Set());
  const [streamMode, setStreamMode] = useState<TasmiStreamMode>("connecting");
  const [saveState, setSaveState] = useState<TasmiSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const effectiveTalqinEnabled = sessionMode === "practice" && talqinEnabled;

  const sessionRef = useRef<TasmiSession | null>(null);
  const recorderRef = useRef<TasmiRecorder | null>(null);
  const streamRef = useRef<TasmiStreamClient | null>(null);
  const talqinRef = useRef<TalqinPlayer | null>(null);
  const primedAudioRef = useRef<HTMLAudioElement | null>(null);
  // Set on unmount/cancel so an in-flight async start can abort cleanly
  // instead of leaking a live mic that nothing will ever stop.
  const cancelledRef = useRef(false);
  const progressRef = useRef(0);
  const activeStreamUtteranceRef = useRef<number | null>(null);
  const pendingStreamFallbacksRef = useRef<Map<number, Blob>>(new Map());
  const pendingRecognitionCountRef = useRef(0);
  const deferredSilenceRef = useRef(false);

  // Keep refs for values used inside handleEvent to avoid stale closures
  const ayahRangesRef = useRef(ayahRanges);
  const surahRef = useRef(surahNumber);
  const startAyahRef = useRef(startAyah);
  const sessionModeRef = useRef(sessionMode);
  useEffect(() => {
    ayahRangesRef.current = ayahRanges;
    surahRef.current = surahNumber;
    startAyahRef.current = startAyah;
    sessionModeRef.current = sessionMode;
  }, [ayahRanges, surahNumber, startAyah, sessionMode]);

  const teardown = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.close();
    streamRef.current = null;
    activeStreamUtteranceRef.current = null;
    pendingStreamFallbacksRef.current = new Map();
    pendingRecognitionCountRef.current = 0;
    deferredSilenceRef.current = false;
    talqinRef.current?.stop();
    talqinRef.current = null;
    sessionRef.current?.cancel();
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
            ? t("serverUnconfigured")
            : t("serverUnreachable"),
        );
        setStatus("unavailable");
      }
    })();
    return () => {
      stale = true;
      cancelledRef.current = true;
      // A Tasmi stream occupies one of the bounded VPS worker slots. Always
      // close it on route change/unmount, including during admission.
      teardown();
    };
  }, [checkServer, teardown, t]);

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
      case "hypothesis":
        setStatus("listening");
        if (event.data?.matchResult) {
          setTentativeFollowIndex(event.data.matchResult.lastCorrectIndex);
          setTentativeErrorPositions(new Set(
            event.data.matchResult.errors.map(error => error.position),
          ));
        }
        break;
      case "match":
        setStatus("listening");
        setHint(null);
        setTentativeFollowIndex(null);
        setTentativeErrorPositions(new Set());
        setProgress(event.data?.progress ?? 0);
        progressRef.current = event.data?.progress ?? 0;
        if (event.data?.matchResult) {
          setFollowIndex(event.data.matchResult.lastCorrectIndex);
        }
        break;
      case "no-speech":
        // Whisper heard nothing usable — NOT a mistake. Gentle nudge only.
        setHint(
          sessionModeRef.current === "practice"
            ? t("noSpeechHint")
            : null,
        );
        setStatus("listening");
        setTentativeFollowIndex(null);
        setTentativeErrorPositions(new Set());
        break;
      case "server-unavailable":
        // Transport failure mid-session — pause honestly, never fake a mistake.
        deferredSilenceRef.current = false;
        recorderRef.current?.pause();
        setMidSessionOutage(true);
        setErrorMsg(t("midSessionOutageMsg"));
        setStatus("unavailable");
        break;
      case "error":
        setStatus(sessionModeRef.current === "exam" ? "listening" : "error");
        setTentativeFollowIndex(null);
        setTentativeErrorPositions(new Set());
        setProgress(event.data?.progress ?? 0);
        progressRef.current = event.data?.progress ?? 0;
        if (event.data?.matchResult) {
          const { lastCorrectIndex, errors } = event.data.matchResult;
          if (sessionModeRef.current === "practice") {
            setFollowIndex(lastCorrectIndex);
          }
          if (sessionModeRef.current === "practice" && errors.length > 0) {
            // Immutable accumulate — error marks persist for the whole session
            setErrorPositions(prev => {
              const next = new Set(prev);
              for (const e of errors) next.add(e.position);
              return next;
            });
          }
        }
        break;
      case "talqin":
        // If recognition itself crossed the consecutive-error threshold, this
        // is already the intervention owed to the reciter. Do not immediately
        // fire a second talqin from a deferred silence timeout.
        deferredSilenceRef.current = false;
        setStatus("talqin");
        recorderRef.current?.pause();
        streamRef.current?.pause();
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
            streamRef.current?.resume();
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
        streamRef.current?.close();
        talqinRef.current?.stop();
        break;
      case "session-end":
        recorderRef.current?.stop();
        streamRef.current?.close();
        talqinRef.current?.stop();
        if (event.data?.result) {
          setResult(event.data.result);
        }
        break;
    }
  }, [t]);

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
    setFollowIndex(-1);
    setErrorPositions(new Set());
    setTentativeFollowIndex(null);
    setTentativeErrorPositions(new Set());
    setStreamMode("connecting");
    setSaveState("idle");
    setSaveError(null);
    deferredSilenceRef.current = false;

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
      silenceThresholdSeconds: 4,
      errorThresholdCount: 2,
      talqinEnabled: effectiveTalqinEnabled,
    }, handleEvent);

    const finishRecognition = () => {
      if (sessionRef.current !== session) return;
      pendingRecognitionCountRef.current = Math.max(
        0,
        pendingRecognitionCountRef.current - 1,
      );
      if (
        pendingRecognitionCountRef.current === 0 &&
        deferredSilenceRef.current
      ) {
        deferredSilenceRef.current = false;
        session.onSilenceTimeout();
      }
    };

    const talqin = new TalqinPlayer({
      wordsToPlay: 3, // spec (operator vision): talqin = 3 linked correct words
      onPlaybackEnd: () => {
        if (talqinRef.current !== talqin || sessionRef.current !== session) return;
        streamRef.current?.resume();
        recorderRef.current?.resume();
        setStatus("listening");
      },
    });
    if (primedAudioRef.current) {
      talqin.attachAudioElement(primedAudioRef.current);
    }

    const stream = new TasmiStreamClient({
      onHypothesis: hypothesis => {
        if (sessionRef.current !== session || streamRef.current !== stream) return;
        const recognitionId = `stream:${hypothesis.utterance_id}`;
        if (hypothesis.type === "partial") {
          session.previewRecognizedText(
            hypothesis.normalized_text,
            `${recognitionId}:partial:${hypothesis.revision}`,
            hypothesis.inference_ms,
          );
          return;
        }

        const wasPending = pendingStreamFallbacksRef.current.has(
          hypothesis.utterance_id,
        );
        pendingStreamFallbacksRef.current = new Map(
          [...pendingStreamFallbacksRef.current]
            .filter(([utteranceId]) => utteranceId !== hypothesis.utterance_id),
        );
        session.processRecognizedText(
          hypothesis.normalized_text,
          recognitionId,
          hypothesis.inference_ms,
        );
        if (wasPending) finishRecognition();
      },
      onUnavailable: (reason, pendingUtteranceIds) => {
        if (sessionRef.current !== session || streamRef.current !== stream) return;
        if (reason === TASMI_STREAM_CAPACITY_FULL_CODE) {
          setErrorMsg(null);
          setHint(null);
          setStatus("busy");
          teardown();
          return;
        }
        setStreamMode("fallback");
        setHint(t("streamFallbackHint"));
        for (const utteranceId of pendingUtteranceIds) {
          const fallbackBlob = pendingStreamFallbacksRef.current.get(utteranceId);
          if (fallbackBlob) {
            void session.processAudioChunk(
              fallbackBlob,
              `stream:${utteranceId}`,
            ).finally(finishRecognition);
          } else {
            finishRecognition();
          }
        }
        pendingStreamFallbacksRef.current = new Map(
          [...pendingStreamFallbacksRef.current]
            .filter(([utteranceId]) => !pendingUtteranceIds.includes(utteranceId)),
        );
      },
    });

    const recorder = new TasmiRecorder({
      silenceTimeoutSeconds: 4,
      silenceNudgeSeconds: 2.5,
      onSpeechEnd: (audioBlob) => {
        if (sessionRef.current !== session || recorderRef.current !== recorder) return;
        const utteranceId = activeStreamUtteranceRef.current;
        activeStreamUtteranceRef.current = null;
        let recognitionCounted = false;
        if (utteranceId !== null && stream.isReady) {
          pendingStreamFallbacksRef.current = new Map(
            pendingStreamFallbacksRef.current,
          ).set(utteranceId, audioBlob);
          // Count before speech_end is sent. A fast local/test socket can
          // deliver its final synchronously from send().
          pendingRecognitionCountRef.current += 1;
          recognitionCounted = true;
          if (stream.endUtterance(utteranceId)) {
            return;
          }
          const fallbackAlreadyStarted = !pendingStreamFallbacksRef.current.has(
            utteranceId,
          );
          pendingStreamFallbacksRef.current = new Map(
            [...pendingStreamFallbacksRef.current]
              .filter(([pendingId]) => pendingId !== utteranceId),
          );
          // A synchronous control-send failure reports the pending ID first;
          // onUnavailable has already launched its HTTP request in that case.
          if (fallbackAlreadyStarted) return;
        }
        // A stream can fail between speech_start and speech_end. Such an
        // utterance has an ID but has not yet been counted as pending.
        if (!recognitionCounted) pendingRecognitionCountRef.current += 1;
        void session.processAudioChunk(
          audioBlob,
          utteranceId === null ? undefined : `stream:${utteranceId}`,
        ).finally(finishRecognition);
      },
      onAudioFrame: frame => {
        if (sessionRef.current !== session || recorderRef.current !== recorder) return;
        stream.sendAudioFrame(frame);
      },
      onSpeechStart: () => {
        if (sessionRef.current !== session || recorderRef.current !== recorder) return;
        deferredSilenceRef.current = false;
        setStatus("listening");
        setHint(null);
        setTentativeFollowIndex(null);
        setTentativeErrorPositions(new Set());
        activeStreamUtteranceRef.current = stream.startUtterance();
      },
      onSilenceTimeout: () => {
        if (sessionRef.current !== session || recorderRef.current !== recorder) return;
        if (pendingRecognitionCountRef.current === 0) {
          session.onSilenceTimeout();
        } else {
          // Slow ASR delays the teacher prompt; it must not erase it forever.
          deferredSilenceRef.current = true;
        }
      },
      onSilenceNudge: () => {
        if (sessionRef.current !== session || recorderRef.current !== recorder) return;
        if (effectiveTalqinEnabled && pendingRecognitionCountRef.current === 0) {
          setHint(t("silenceNudgeHint"));
        }
      },
      onError: (err) => {
        if (sessionRef.current !== session || recorderRef.current !== recorder) return;
        setErrorMsg(micErrorMessage(err, tRecorder));
        setStatus("intro");
      },
    });

    // Assign refs BEFORE the awaits below so unmount/cancel can always stop them.
    sessionRef.current = session;
    recorderRef.current = recorder;
    streamRef.current = stream;
    talqinRef.current = talqin;

    // Begin mic permission and stream admission from the same user gesture.
    // Keep the recorder paused and the session inactive until admission is
    // decided, so a capacity rejection can never be graded or fall back.
    const recorderStartPromise = recorder.start().then(started => {
      if (started) recorder.pause();
      return started;
    });
    const streamConnectPromise = stream.connect();
    void fetchAlignData().then(alignData => {
      if (
        !cancelledRef.current &&
        talqinRef.current === talqin &&
        sessionRef.current === session &&
        alignData
      ) talqin.loadFromRawData(alignData);
    });

    const [recorderStarted, connected] = await Promise.all([
      recorderStartPromise,
      streamConnectPromise,
    ]);
    if (
      cancelledRef.current ||
      recorderRef.current !== recorder ||
      sessionRef.current !== session
    ) {
      recorder.stop();
      stream.close();
      talqin.stop();
      session.cancel();
      return;
    }
    if (!recorderStarted) { teardown(); return; }

    setStreamMode(connected ? "live" : "fallback");
    if (connected) setHint(null);
    session.start();

    // Mode B: read the test ayah aloud first (mic stays granted but paused),
    // then the shared onPlaybackEnd resumes the recorder into listening.
    if (startPromptAyah) {
      recorder.pause();
      stream.pause();
      setStatus("prompt");
      talqin.playAyah(startPromptAyah.surah, startPromptAyah.ayah).catch(() => {
        if (talqinRef.current !== talqin || sessionRef.current !== session) return;
        streamRef.current?.resume();
        recorderRef.current?.resume();
        setStatus("listening");
      });
    } else {
      recorder.resume();
    }
  }, [
    effectiveTalqinEnabled,
    expectedText,
    handleEvent,
    startPromptAyah,
    t,
    tRecorder,
    teardown,
  ]);

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
      setErrorMsg(t("serverStillUnreachable"));
      setStatus("unavailable");
    }
  }, [checkServer, t]);

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
          ? t("serverUnconfigured")
          : t("serverUnreachable"),
      );
      setStatus("unavailable");
    }
  }, [checkServer, t]);

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
    if (!result || saveState === "saving" || saveState === "saved") return;

    const label = tasmiResultToLabel(result);
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await fetch("/api/tasmi/session", {
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
          duration_seconds: Math.max(1, Math.round(result.durationSeconds)),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        const serverMessage =
          typeof payload?.error === "string" ? payload.error : null;
        setSaveError(
          response.status === 401
            ? t("saveAuthRequired")
            : serverMessage ?? t("saveGenericError"),
        );
        setSaveState("error");
        return;
      }
    } catch {
      setSaveError(t("saveNetworkError"));
      setSaveState("error");
      return;
    }

    setSaveState("saved");
    onSessionEnd(result, label);
  }, [
    endAyah,
    onSessionEnd,
    result,
    saveState,
    startAyah,
    surahNumber,
    t,
  ]);

  // ---------- Render ----------

  if (result && status === "complete") {
    return (
      <TasmiSessionResultView
        result={result}
        endedEarly={endedEarly}
        ayahRanges={ayahRanges}
        onRetry={startSession}
        onSave={handleSaveResult}
        saveState={saveState}
        saveError={saveError}
      />
    );
  }

  // Pre-flight probe in progress
  if (status === "checking") {
    return <TasmiCheckingView />;
  }

  // Capacity is a normal busy state, not an outage and never a recitation
  // failure. Retrying creates a fresh ticket and attempts admission again.
  if (status === "busy") {
    return <TasmiBusyView onRetry={startSession} onCancel={handleCancel} />;
  }

  // Server unavailable — honest state, never a fake "mistake"
  if (status === "unavailable") {
    return (
      <TasmiUnavailableView
        errorMsg={errorMsg}
        midSessionOutage={midSessionOutage}
        onRetry={midSessionOutage ? resumeAfterOutage : recheckServer}
        onCancel={handleCancel}
      />
    );
  }

  // Onboarding intro — the "Mula" tap is the iOS gesture unlock + mic start
  if (status === "intro" || status === "idle") {
    return (
      <TasmiIntroView
        errorMsg={errorMsg}
        sessionMode={sessionMode}
        hasStartPrompt={Boolean(startPromptAyah)}
        talqinEnabled={effectiveTalqinEnabled}
        onStart={startSession}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <TasmiActiveView
      errorMsg={errorMsg}
      hint={hint}
      sessionMode={sessionMode}
      streamMode={streamMode}
      status={status}
      expectedText={expectedText}
      followIndex={followIndex}
      tentativeFollowIndex={tentativeFollowIndex}
      errorPositions={errorPositions}
      tentativeErrorPositions={tentativeErrorPositions}
      progress={progress}
      onStop={stopSession}
      onCancel={handleCancel}
    />
  );
}
