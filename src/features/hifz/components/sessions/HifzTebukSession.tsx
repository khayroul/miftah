"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MushafLayoutPage } from "@/mushaf/types/mushafLayout";
import type { TebukPrompt, TebukRoundResult } from "../../domain/types";
import {
  TalqinPlayer,
  TasmiRecorder,
  TasmiSession,
  tasmiResultToFsrsRating,
  tasmiResultToLabel,
  type TasmiEvent,
  type TasmiRatingLabel,
  type TasmiSessionResult,
} from "@/features/tasmi";
import { pickTebukPrompts } from "../../domain/tebuk";
import { TebukPromptCard } from "./TebukPromptCard";
import { TebukResultCard } from "./TebukResultCard";
import { TebukSessionSummary } from "./TebukSessionSummary";

const ROUNDS_PER_SESSION = 3;
const PROMPT_WORD_COUNT = 4;

type TebukPhase = "prompt" | "playing" | "reciting" | "result" | "complete";

export interface HifzTebukSessionProps {
  layout: MushafLayoutPage;
  pageNumber: number;
  alignData: unknown[];
  onComplete: (rounds: TebukRoundResult[]) => void;
  onExit: () => void;
}

const TASMI_TRANSCRIBE_ENDPOINT = "/api/tasmi/transcribe";

function buildAggregateLabel(rounds: TebukRoundResult[]): TasmiRatingLabel {
  if (rounds.length === 0) return "ulang";
  const minRating = Math.min(...rounds.map((r) => r.rating));
  const labelMap: Record<number, TasmiRatingLabel> = {
    1: "ulang",
    2: "tersangkut",
    3: "lancar",
    4: "mantap",
  };
  return labelMap[minRating] ?? "ulang";
}

export function HifzTebukSession({
  layout,
  pageNumber,
  alignData,
  onComplete,
  onExit,
}: HifzTebukSessionProps) {
  // Pick prompts once on mount via useState initializer
  const [prompts] = useState<TebukPrompt[]>(() =>
    pickTebukPrompts(layout, ROUNDS_PER_SESSION),
  );
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [phase, setPhase] = useState<TebukPhase>("prompt");
  const [isPromptRevealed, setIsPromptRevealed] = useState(false);
  const [completedRounds, setCompletedRounds] = useState<TebukRoundResult[]>([]);
  const [vadError, setVadError] = useState<string | null>(null);

  const sessionRef = useRef<TasmiSession | null>(null);
  const recorderRef = useRef<TasmiRecorder | null>(null);
  const talqinRef = useRef<TalqinPlayer | null>(null);
  const roundResultRef = useRef<TasmiSessionResult | null>(null);
  // Guards against React Strict Mode double-invocation in useEffect
  const recitingActiveRef = useRef(false);

  // Mutable ref so TalqinPlayer's onPlaybackEnd always calls the latest phase handler
  const onPlaybackEndRef = useRef<() => void>(() => {});

  const currentPrompt = prompts[currentRoundIndex] ?? null;

  // Initialize TalqinPlayer once — uses ref-backed callback to avoid stale closures
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
  }, []); // intentionally empty — player is shared across rounds

  // Keep onPlaybackEnd ref in sync with current phase
  useEffect(() => {
    onPlaybackEndRef.current = () => {
      if (phase === "playing") {
        // Initial prompt audio finished — start reciting
        setPhase("reciting");
      } else if (phase === "reciting") {
        // Mid-session talqin playback finished — resume recorder
        recorderRef.current?.resume();
      }
    };
  }, [phase]);

  // Auto-play prompt audio when entering prompt phase for a new round
  useEffect(() => {
    if (phase !== "prompt" || !currentPrompt) return;

    setIsPromptRevealed(false);

    const timer = setTimeout(() => {
      if (!talqinRef.current || !currentPrompt) return;
      setPhase("playing");
      const endIdx = currentPrompt.startWordIdx + PROMPT_WORD_COUNT;
      talqinRef.current
        .playRange(
          currentPrompt.surah,
          currentPrompt.ayah,
          currentPrompt.startWordIdx,
          endIdx,
        )
        .catch(() => {
          // Audio failed — skip to reciting
          setPhase("reciting");
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [phase, currentRoundIndex, currentPrompt]);

  // Start VAD recorder when entering reciting phase
  useEffect(() => {
    if (phase !== "reciting" || !currentPrompt) return;
    if (recitingActiveRef.current) return;
    recitingActiveRef.current = true;

    let disposed = false;
    let recorder: TasmiRecorder | null = null;

    void (async () => {
      try {
        const configResponse = await fetch(TASMI_TRANSCRIBE_ENDPOINT, {
          method: "GET",
          cache: "no-store",
        });
        const configPayload = (await configResponse.json().catch(() => null)) as
          | { configured?: boolean }
          | null;

        if (!configResponse.ok || configPayload?.configured !== true) {
          if (!disposed) {
            setVadError("Pelayan tasmi' belum dikonfigurasikan.");
            recitingActiveRef.current = false;
          }
          return;
        }
      } catch {
        if (!disposed) {
          setVadError("Pelayan tasmi' tak dapat dihubungi sekarang.");
          recitingActiveRef.current = false;
        }
        return;
      }

      if (disposed) {
        recitingActiveRef.current = false;
        return;
      }

      const session = new TasmiSession(
        currentPrompt.continuationText,
        {
          serverUrl: TASMI_TRANSCRIBE_ENDPOINT,
          apiKey: "",
          silenceThresholdSeconds: 6,
          errorThresholdCount: 2,
        },
        handleTasmiEvent,
      );

      recorder = new TasmiRecorder({
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
      await recorder.start();
    })();

    return () => {
      disposed = true;
      recitingActiveRef.current = false;
      recorder?.stop();
      // session.end() is called in finalizeRound; only stop recorder on cleanup
      sessionRef.current = null;
      recorderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentRoundIndex]);

  // Reset the reciting guard when moving to a new round or phase
  useEffect(() => {
    if (phase !== "reciting") {
      recitingActiveRef.current = false;
    }
  }, [phase, currentRoundIndex]);

  function handleTasmiEvent(event: TasmiEvent): void {
    switch (event.type) {
      case "talqin":
        recorderRef.current?.pause();
        if (event.data?.talqinWordIndex != null && currentPrompt) {
          // Talqin plays from the stuck position; onPlaybackEnd ref resumes recorder
          talqinRef.current
            ?.play(
              currentPrompt.surah,
              currentPrompt.ayah,
              event.data.talqinWordIndex,
            )
            .catch(() => {
              // Talqin audio failed — resume recorder so student isn't stuck
              recorderRef.current?.resume();
            });
        } else {
          recorderRef.current?.resume();
        }
        break;

      case "complete":
        finalizeRound();
        break;

      case "session-end":
        if (event.data?.result) {
          roundResultRef.current = event.data.result;
        }
        break;

      default:
        break;
    }
  }

  function finalizeRound(): void {
    recorderRef.current?.stop();
    const sessionResult = roundResultRef.current ?? sessionRef.current?.end();

    if (!sessionResult || !currentPrompt) return;

    const label = tasmiResultToLabel(sessionResult);
    const rating = tasmiResultToFsrsRating(sessionResult);

    const roundResult: TebukRoundResult = {
      prompt: currentPrompt,
      tasmiResult: sessionResult,
      rating,
      label,
    };

    roundResultRef.current = null;
    recitingActiveRef.current = false;
    setIsPromptRevealed(true);
    setCompletedRounds((prev) => [...prev, roundResult]);
    setPhase("result");
  }

  const handleNextRound = useCallback(() => {
    const nextIndex = currentRoundIndex + 1;
    if (nextIndex >= prompts.length) {
      setPhase("complete");
    } else {
      setCurrentRoundIndex(nextIndex);
      setPhase("prompt");
    }
  }, [currentRoundIndex, prompts.length]);

  const handleReplay = useCallback(() => {
    if (!currentPrompt || !talqinRef.current) return;
    const endIdx = currentPrompt.startWordIdx + PROMPT_WORD_COUNT;
    talqinRef.current
      .playRange(
        currentPrompt.surah,
        currentPrompt.ayah,
        currentPrompt.startWordIdx,
        endIdx,
      )
      .catch(() => {});
  }, [currentPrompt]);

  const handleDone = useCallback(() => {
    onComplete(completedRounds);
  }, [completedRounds, onComplete]);

  // Edge case: no eligible prompts on this page
  if (prompts.length === 0) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Halaman ini tidak cukup ayat untuk tebuk.
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

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/80 backdrop-blur-sm sm:items-center">
      <div className="mx-4 mb-4 w-full max-w-sm sm:mb-0">
        {/* Prompt / Playing / Reciting phases */}
        {(phase === "prompt" || phase === "playing" || phase === "reciting") &&
          currentPrompt && (
            <div className="flex flex-col gap-3">
              <TebukPromptCard
                prompt={currentPrompt}
                pageNumber={pageNumber}
                roundNumber={currentRoundIndex + 1}
                totalRounds={prompts.length}
                isRevealed={isPromptRevealed}
                onReplay={handleReplay}
              />

              {/* Phase status indicator */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      phase === "playing"
                        ? "animate-pulse bg-teal-500"
                        : phase === "reciting"
                          ? "animate-pulse bg-rose-500"
                          : "bg-stone-400"
                    }`}
                  />
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    {phase === "playing"
                      ? "Mendengar..."
                      : phase === "reciting"
                        ? "Sambung bacaan..."
                        : "Sedia..."}
                  </p>
                </div>

                {phase === "reciting" && (
                  <button
                    type="button"
                    onClick={finalizeRound}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    Selesai baca
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onExit}
                className="text-center text-xs text-stone-400 underline-offset-2 hover:underline dark:text-stone-500"
              >
                Keluar
              </button>
            </div>
          )}

        {/* Result phase */}
        {phase === "result" && completedRounds.length > 0 && (
          <TebukResultCard
            result={completedRounds[completedRounds.length - 1]}
            roundNumber={currentRoundIndex + 1}
            isLastRound={currentRoundIndex + 1 >= prompts.length}
            onNext={handleNextRound}
          />
        )}

        {/* Complete phase */}
        {phase === "complete" && (
          <TebukSessionSummary
            rounds={completedRounds}
            aggregateLabel={buildAggregateLabel(completedRounds)}
            pageNumber={pageNumber}
            onDone={handleDone}
          />
        )}
      </div>
    </div>
  );
}
