"use client";

import dynamic from "next/dynamic";
import type { MushafLayoutPage, MushafPageManifest } from "@/mushaf";
import type { HifzExerciseFlow, HifzFlowType } from "@/features/hifz/read-runtime";
import { buildSignInPath } from "@/features/auth/navigation";
import type { HifzQueueRecoveryError } from "./useReadHifzQueue";

const HifzInlineRating = dynamic(() => import("@/features/hifz/read-overlays/inline-rating").then((module) => module.HifzInlineRating), { ssr: false, loading: () => null });
const HifzMemorizeStepper = dynamic(() => import("@/features/hifz/read-overlays/memorize-stepper").then((module) => module.HifzMemorizeStepper), { ssr: false, loading: () => null });
const HifzSessionBar = dynamic(() => import("@/features/hifz/read-overlays/session-bar").then((module) => module.HifzSessionBar), { ssr: false, loading: () => null });
const HifzSessionComplete = dynamic(() => import("@/features/hifz/read-overlays/session-complete").then((module) => module.HifzSessionComplete), { ssr: false, loading: () => null });
const HifzTebukSession = dynamic(() => import("@/features/hifz/read-overlays/tebuk-session").then((module) => module.HifzTebukSession), { ssr: false, loading: () => null });
const HifzUnveilSession = dynamic(() => import("@/features/hifz/read-overlays/unveil-session").then((module) => module.HifzUnveilSession), { ssr: false, loading: () => null });

interface ReadHifzOverlaysProps {
  alignData: unknown[];
  audioFinishedSignal: number;
  exercise: HifzExerciseFlow | null;
  flow: HifzFlowType | null;
  isAudioVisible: boolean;
  isRecovering: boolean;
  layout: MushafLayoutPage;
  pageManifest: MushafPageManifest | null;
  pageNumber: number;
  queueIndex: number;
  recoveryError: HifzQueueRecoveryError | null;
  sessionComplete: boolean;
  sessionElapsedMs: number;
  sessionPagesCompleted: number;
  sessionStartTime: number;
  totalPages: number;
  tasmiAllRevealed: boolean;
  totalLineCount: number;
  onChunkAyahKeysChange: (keys: string[] | null) => void;
  onChunkListen: () => void;
  onChunkPause: () => void;
  onExerciseExit: () => void;
  onMushafHide: (hidden: boolean) => void;
  onPageComplete: () => void;
  onSessionComplete: () => void;
  onTasmiRevealAll: () => void;
  onViewportInsetChange: (inset: number) => void;
}

function RecoveryPanel({ title, message, bottomOffsetPx = 0, requiresSignIn = false }: { title: string; message: string; bottomOffsetPx?: number; requiresSignIn?: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-5 text-center shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95" style={{ bottom: bottomOffsetPx }}>
      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{message}</p>
      <div className="mt-4 flex justify-center gap-3">
        {requiresSignIn ? <a href={buildSignInPath("/hifz")} className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500">Log Masuk</a> : null}
        <a href="/hifz" className="inline-flex items-center rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">Kembali ke Hafal</a>
      </div>
    </div>
  );
}

export function ReadHifzOverlays(props: ReadHifzOverlaysProps) {
  const bottomOffsetPx = props.isAudioVisible ? 112 : 0;
  const recovery = (title: string, message: string, offset = bottomOffsetPx) => (
    <RecoveryPanel title={title} message={message} bottomOffsetPx={offset} requiresSignIn={props.recoveryError?.requiresSignIn} />
  );
  return (
    <>
      {props.flow && props.totalPages > 0 && !props.sessionComplete ? (
        <HifzSessionBar flow={props.flow} totalPages={props.totalPages} completedPages={props.sessionPagesCompleted} startTime={props.sessionStartTime} />
      ) : null}
      {props.sessionComplete && props.flow ? (
        <HifzSessionComplete flow={props.flow} pagesCompleted={props.sessionPagesCompleted} timeElapsedMs={props.sessionElapsedMs} />
      ) : null}
      {props.flow === "review" ? (
        props.isRecovering
          ? recovery("Menyambung sesi uji hafalan...", "Kami sedang bina semula susunan halaman semasa.", 0)
          : props.recoveryError
            ? recovery("Sesi tergendala", props.recoveryError.message, 0)
            : <HifzInlineRating flowType="review" pageNumber={props.pageNumber} queueIndex={props.queueIndex} visible={props.tasmiAllRevealed} bottomOffsetPx={bottomOffsetPx} onTasmiSuccess={props.onTasmiRevealAll} onSessionComplete={props.onSessionComplete} onPageComplete={props.onPageComplete} />
      ) : null}
      {props.flow === "memorize" ? (
        props.isRecovering
          ? recovery("Menyambung sesi hafalan...", "Kami sedang bina semula chunk dan susunan halaman semasa.")
          : props.recoveryError
            ? recovery("Sesi tergendala", props.recoveryError.message)
            : <HifzMemorizeStepper bottomOffsetPx={bottomOffsetPx} pageNumber={props.pageNumber} queueIndex={props.queueIndex} audioFinishedSignal={props.audioFinishedSignal} onChunkAyahKeysChange={props.onChunkAyahKeysChange} onChunkListen={props.onChunkListen} onChunkPause={props.onChunkPause} onMushafHide={props.onMushafHide} onViewportInsetChange={props.onViewportInsetChange} onSessionComplete={props.onSessionComplete} onPageComplete={props.onPageComplete} />
      ) : null}
      {props.exercise === "tebuk" ? (
        <HifzTebukSession layout={props.layout} pageNumber={props.pageNumber} alignData={props.alignData} onComplete={(rounds) => console.info("[ReadPageWorkspace] tebuk complete — ratings logged (no progressIds):", rounds.map((round) => ({ rating: round.rating, label: round.label })))} onExit={props.onExerciseExit} />
      ) : null}
      {props.exercise === "unveil" && props.pageManifest ? (
        <HifzUnveilSession layout={props.layout} manifest={props.pageManifest} pageNumber={props.pageNumber} alignData={props.alignData} onComplete={() => console.info("[ReadPageWorkspace] unveil complete — FSRS rate-batch pending progressId wiring")} onExit={props.onExerciseExit}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/mushaf/page/${props.pageNumber}?v=qcfv2`} alt={`Mushaf halaman ${props.pageNumber}`} width={props.pageManifest.image_width} height={props.pageManifest.image_height} className="w-full" />
        </HifzUnveilSession>
      ) : null}
    </>
  );
}
