"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MushafLayoutPage } from "@/types/mushafLayout";
import type { MushafPageManifest } from "@/types/mushaf";
import type { TasmiEvent, TasmiSessionResult } from "@/lib/tasmi/tasmi-session";
import type { TasmiRatingLabel } from "@/lib/tasmi/fsrs-bridge";
import type { FsrsRating } from "@/types/database";
import { TasmiSession } from "@/lib/tasmi/tasmi-session";
import { TasmiRecorder } from "@/lib/tasmi/tasmi-recorder";
import { TalqinPlayer } from "@/lib/tasmi/talqin-player";
import { buildUnveilState, revealUpTo } from "@/lib/hifz/progressive-unveil";
import type { UnveilState } from "@/lib/hifz/progressive-unveil";
import { getPageWords, buildAyahWordRanges } from "@/lib/hifz/page-words";
import {
  tasmiResultToLabel,
  tasmiResultToFsrsRating,
  getPerAyahRatings,
} from "@/lib/tasmi/fsrs-bridge";
import { normalizeArabic } from "@/lib/tasmi/arabic-normalizer";
import { VeilOverlay } from "@/components/hifz/VeilOverlay";
import { UnveilResultCard } from "@/components/hifz/UnveilResultCard";

type UnveilPhase = "prompting" | "reciting" | "complete";

export interface HifzUnveilSessionProps {
  layout: MushafLayoutPage;
  manifest: MushafPageManifest;
  pageNumber: number;
  tasmiServerUrl: string;
  tasmiApiKey: string;
  alignData: unknown[];
  children: React.ReactNode;
  onComplete: () => void;
  onExit: () => void;
}

interface AyahRating {
  ayahKey: string;
  rating: FsrsRating;
  label: TasmiRatingLabel;
}

export function HifzUnveilSession({
  layout,
  manifest,
  pageNumber,
  tasmiServerUrl,
  tasmiApiKey,
  alignData,
  children,
  onComplete,
  onExit,
}: HifzUnveilSessionProps) {
  const [phase, setPhase] = useState<UnveilPhase>("prompting");
  const [unveilState, setUnveilState] = useState<UnveilState>(() =>
    buildUnveilState(layout, manifest),
  );
  const [sessionResult, setSessionResult] = useState<TasmiSessionResult | null>(null);
  const [sessionLabel, setSessionLabel] = useState<TasmiRatingLabel>("ulang");
  const [ayahRatings, setAyahRatings] = useState<AyahRating[]>([]);
  const [vadError, setVadError] = useState<string | null>(null);

  const sessionRef = useRef<TasmiSession | null>(null);
  const recorderRef = useRef<TasmiRecorder | null>(null);
  const talqinRef = useRef<TalqinPlayer | null>(null);
  const sessionResultRef = useRef<TasmiSessionResult | null>(null);
  // Guards against React Strict Mode double-invocation
  const recitingActiveRef = useRef(false);

  // Mutable ref so TalqinPlayer's onPlaybackEnd always calls the latest handler
  const onPlaybackEndRef = useRef<() => void>(() => {});

  // Build page words once — used for talqin reverse mapping
  const pageWords = getPageWords(layout);

  // Build full page expected text for TasmiSession
  const pageExpectedText = normalizeArabic(pageWords.map((w) => w.text).join(" "));

  // Initialize TalqinPlayer once
  useEffect(() => {
    const player = new TalqinPlayer({
      wordsToPlay: 5,
      onPlaybackEnd: () => {
        onPlaybackEndRef.current();
      },
    });

    if (alignData && alignData.length > 0) {
      player.loadFromRawData(
        alignData as Parameters<typeof player.loadFromRawData>[0],
      );
    }

    talqinRef.current = player;

    return () => {
      player.stop();
      talqinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — player is shared across the session

  // Keep onPlaybackEnd ref in sync with current phase
  useEffect(() => {
    onPlaybackEndRef.current = () => {
      if (phase === "prompting") {
        // Initial prompt audio finished — start reciting
        setPhase("reciting");
      } else if (phase === "reciting") {
        // Mid-session talqin playback finished — resume recorder
        recorderRef.current?.resume();
      }
    };
  }, [phase]);

  // Play first 3 words of first ayah as initial prompt when mounting
  useEffect(() => {
    if (phase !== "prompting") return;

    const firstWord = pageWords[0];
    if (!firstWord || !talqinRef.current) {
      // No words on page — go straight to reciting
      setPhase("reciting");
      return;
    }

    const timer = setTimeout(() => {
      if (!talqinRef.current) return;
      // wordPosition is 1-based; TalqinPlayer.playRange expects 0-based indices
      const startIdx = firstWord.wordPosition - 1;
      const endIdx = startIdx + 3;
      talqinRef.current
        .playRange(firstWord.surah, firstWord.ayah, startIdx, endIdx)
        .catch(() => {
          // Audio failed — skip to reciting
          setPhase("reciting");
        });
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // Start VAD recorder when entering reciting phase
  useEffect(() => {
    if (phase !== "reciting") return;
    if (recitingActiveRef.current) return;
    recitingActiveRef.current = true;

    if (!tasmiServerUrl) {
      setVadError("Pelayan tasmi' belum dikonfigurasi.");
      return;
    }

    const session = new TasmiSession(
      pageExpectedText,
      {
        serverUrl: tasmiServerUrl,
        apiKey: tasmiApiKey,
        silenceThresholdSeconds: 6,
        errorThresholdCount: 2,
      },
      handleTasmiEvent,
    );

    const recorder = new TasmiRecorder({
      silenceTimeoutSeconds: 6,
      onSpeechEnd: (audioBlob: Blob) => {
        session.processAudioChunk(audioBlob);
      },
      onSilenceTimeout: () => {
        session.onSilenceTimeout();
      },
      onError: (err: Error) => {
        setVadError(err.message);
      },
    });

    sessionRef.current = session;
    recorderRef.current = recorder;

    session.start();
    void recorder.start();

    return () => {
      recitingActiveRef.current = false;
      recorder.stop();
      sessionRef.current = null;
      recorderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Reset reciting guard when leaving reciting phase
  useEffect(() => {
    if (phase !== "reciting") {
      recitingActiveRef.current = false;
    }
  }, [phase]);

  function handleTasmiEvent(event: TasmiEvent): void {
    switch (event.type) {
      case "match": {
        if (event.data?.matchResult?.lastCorrectIndex != null) {
          setUnveilState((prev) =>
            revealUpTo(prev, event.data!.matchResult!.lastCorrectIndex),
          );
        }
        break;
      }

      case "talqin": {
        recorderRef.current?.pause();
        const flatIndex = event.data?.talqinWordIndex;
        if (flatIndex != null && flatIndex < pageWords.length) {
          const word = pageWords[flatIndex];
          // wordPosition is 1-based; TalqinPlayer.play() expects 0-based index
          talqinRef.current
            ?.play(word.surah, word.ayah, word.wordPosition - 1)
            .catch(() => {
              // Talqin audio failed — resume recorder so student isn't stuck
              recorderRef.current?.resume();
            });
        } else {
          recorderRef.current?.resume();
        }
        break;
      }

      case "complete":
        finalizeSession();
        break;

      case "session-end":
        if (event.data?.result) {
          sessionResultRef.current = event.data.result;
        }
        break;

      default:
        break;
    }
  }

  function finalizeSession(): void {
    recorderRef.current?.stop();
    const result = sessionResultRef.current ?? sessionRef.current?.end();

    if (!result) return;

    const label = tasmiResultToLabel(result);
    const ranges = buildAyahWordRanges(pageWords);
    const perAyahRaw = getPerAyahRatings(result, ranges);

    // Merge ayahKey from ranges into per-ayah ratings
    const mergedAyahRatings: AyahRating[] = perAyahRaw.map((r, i) => ({
      ayahKey: ranges[i]?.ayahKey ?? `${r.ayah}`,
      rating: r.rating,
      label: r.label,
    }));

    sessionResultRef.current = null;
    recitingActiveRef.current = false;

    // Reveal entire page on completion
    setUnveilState((prev) => revealUpTo(prev, prev.totalWords - 1));
    setSessionResult(result);
    setSessionLabel(label);
    setAyahRatings(mergedAyahRatings);
    setPhase("complete");
  }

  const handleManualFinish = useCallback(() => {
    finalizeSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // VAD error state
  if (vadError) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            Mikrofon tidak dapat diakses
          </p>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            {vadError}
          </p>
          <button
            type="button"
            onClick={onExit}
            className="mt-6 w-full rounded-xl bg-stone-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-700"
          >
            Keluar
          </button>
        </div>
      </div>
    );
  }

  const imageWidth = manifest.image_width;
  const imageHeight = manifest.image_height;

  return (
    <>
      {/* Page image + veil overlay stacked */}
      <div className="relative w-full">
        {children}
        <VeilOverlay
          words={unveilState.words}
          revealedUpTo={unveilState.revealedUpTo}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
        />
      </div>

      {/* Session controls overlay */}
      {phase !== "complete" && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 backdrop-blur-[2px] sm:items-center">
          <div className="mx-4 mb-4 w-full max-w-sm sm:mb-0">
            <div className="flex flex-col gap-3">
              {/* Status bar */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      phase === "prompting"
                        ? "animate-pulse bg-teal-500"
                        : "animate-pulse bg-rose-500"
                    }`}
                  />
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    {phase === "prompting" ? "Mendengar..." : "Baca semula halaman..."}
                  </p>
                </div>

                {phase === "reciting" && (
                  <button
                    type="button"
                    onClick={handleManualFinish}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    Selesai baca
                  </button>
                )}
              </div>

              {/* Progress indicator */}
              <div className="rounded-xl border border-stone-200 bg-white px-4 py-2 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                  <span>
                    {unveilState.revealedUpTo + 1} / {unveilState.totalWords} patah
                  </span>
                  <span>
                    {unveilState.totalWords > 0
                      ? Math.round(
                          ((unveilState.revealedUpTo + 1) / unveilState.totalWords) * 100,
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all duration-300"
                    style={{
                      width: `${
                        unveilState.totalWords > 0
                          ? Math.round(
                              ((unveilState.revealedUpTo + 1) /
                                unveilState.totalWords) *
                                100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={onExit}
                className="text-center text-xs text-stone-400 underline-offset-2 hover:underline dark:text-stone-500"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result card */}
      {phase === "complete" && sessionResult && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/80 backdrop-blur-sm sm:items-center">
          <UnveilResultCard
            result={sessionResult}
            label={sessionLabel}
            ayahRatings={ayahRatings}
            pageNumber={pageNumber}
            onDone={handleDone}
          />
        </div>
      )}
    </>
  );
}
