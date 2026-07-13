"use client";

import dynamic from "next/dynamic";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { MushafPageView, ReadOnlyMushafPageView, type MushafAyahDetail, type MushafLayoutPage, type MushafPageManifest, type MushafWordTranslationMap } from "@/mushaf";
import type { HifzExerciseFlow, HifzFlowType } from "@/features/hifz";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";
import type { HifzQueueRecoveryError } from "./useReadHifzQueue";
import { ReadHifzOverlays } from "./ReadHifzOverlays";
import { ReadModeTools } from "./ReadModeTools";

const FahamExposureTracker = dynamic(() => import("@/features/faham").then((module) => module.FahamExposureTracker), { ssr: false, loading: () => null });
const ReadJumpControls = dynamic(() => import("./ReadJumpControls").then((module) => module.ReadJumpControls), { ssr: false, loading: () => null });
const HifzTasmiOverlay = dynamic(
  () => import("@/features/tasmi").then((module) => module.loadHifzTasmiOverlay()),
  { ssr: false, loading: () => null },
);

interface ReadPageCanvasProps {
  activePlaybackAyahKey: string | null;
  alignData: unknown[];
  audioDiscovered: boolean;
  audioEnabled: boolean;
  audioFinishedSignal: number;
  ayahDetails: MushafAyahDetail[];
  contentBottomPadding?: number;
  currentJuzNumber: number;
  currentSurahId: number;
  exercise: HifzExerciseFlow | null;
  flow: HifzFlowType | null;
  hifzRevealByThirdsEnabled: boolean;
  isAudioVisible: boolean;
  isRecovering: boolean;
  layout: MushafLayoutPage;
  memorizeHideMushaf: boolean;
  mushafHeader?: ReactNode;
  nextPageHref: string | null;
  pageManifest: MushafPageManifest | null;
  pageNumber: number;
  previousPageHref: string | null;
  queueIndex: number;
  queueRecoveryError: HifzQueueRecoveryError | null;
  queueTotalPages: number;
  readingAyahIds: number[];
  resolvedMemorizedAyahKeys: string[];
  sessionComplete: boolean;
  sessionElapsedMs: number;
  sessionPagesCompleted: number;
  sessionStartTime: number;
  shouldTrackExposure: boolean;
  showJumpControls: boolean;
  showTasmiOverlay: boolean;
  tasmiAllRevealed: boolean;
  tasmiRevealedLines: number;
  themeSurahId: number;
  totalLineCount: number;
  useLightweightViewer: boolean;
  wordTranslations: MushafWordTranslationMap;
  setHifzRevealByThirdsEnabled: Dispatch<SetStateAction<boolean>>;
  setMemorizeChunkAyahKeys: Dispatch<SetStateAction<string[] | null>>;
  setMemorizeHideMushaf: Dispatch<SetStateAction<boolean>>;
  setMemorizeViewportInset: Dispatch<SetStateAction<number>>;
  setPlayableAyahKeys: (keys: string[] | null) => void;
  setSessionComplete: Dispatch<SetStateAction<boolean>>;
  setSessionElapsedMs: Dispatch<SetStateAction<number>>;
  setSessionPagesCompleted: Dispatch<SetStateAction<number>>;
  setShowJumpControls: Dispatch<SetStateAction<boolean>>;
  setTasmiRevealedLines: Dispatch<SetStateAction<number>>;
  onAudioDiscovered: () => void;
  onAyahAudioTap: (ayahKey: string) => void;
  onCanvasTap: () => void;
  onChunkListen: () => void;
  onChunkPause: () => void;
  onExerciseExit: () => void;
  onNavigateNextPage: () => void;
  onNavigatePreviousPage: () => void;
  onReadyChange: (ready: boolean) => void;
  onTasmiTap: () => void;
  onToggleAudio: () => void;
}

function PageArrow({ direction, href, label }: { direction: "<" | ">"; href: string | null; label: string }) {
  const className = "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium";
  return href ? (
    <OfflineAwareLink href={href} title={label} aria-label={label} className={`${className} border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700`}>{direction}</OfflineAwareLink>
  ) : (
    <button type="button" disabled aria-label={label} className={`${className} border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600`}>{direction}</button>
  );
}

export function ReadPageCanvas(props: ReadPageCanvasProps) {
  const jumpControls = <ReadJumpControls currentPage={props.pageNumber} currentSurahId={props.currentSurahId} currentJuzNumber={props.currentJuzNumber} />;
  return (
    <div className="mx-auto max-w-lg" style={{ paddingBottom: props.contentBottomPadding, paddingTop: props.flow && props.queueTotalPages > 0 && !props.sessionComplete ? 44 : undefined }}>
      <ReadHifzOverlays alignData={props.alignData} audioFinishedSignal={props.audioFinishedSignal} exercise={props.exercise} flow={props.flow} isAudioVisible={props.isAudioVisible} isRecovering={props.isRecovering} layout={props.layout} pageManifest={props.pageManifest} pageNumber={props.pageNumber} queueIndex={props.queueIndex} recoveryError={props.queueRecoveryError} sessionComplete={props.sessionComplete} sessionElapsedMs={props.sessionElapsedMs} sessionPagesCompleted={props.sessionPagesCompleted} sessionStartTime={props.sessionStartTime} totalPages={props.queueTotalPages} tasmiAllRevealed={props.tasmiAllRevealed} totalLineCount={props.totalLineCount} onChunkAyahKeysChange={props.setMemorizeChunkAyahKeys} onChunkListen={props.onChunkListen} onChunkPause={props.onChunkPause} onExerciseExit={props.onExerciseExit} onMushafHide={props.setMemorizeHideMushaf} onPageComplete={() => props.setSessionPagesCompleted((count) => count + 1)} onSessionComplete={() => { props.setSessionElapsedMs(Date.now() - props.sessionStartTime); props.setSessionComplete(true); }} onTasmiRevealAll={() => props.setTasmiRevealedLines(props.totalLineCount)} onViewportInsetChange={props.setMemorizeViewportInset} />
      {props.shouldTrackExposure ? <FahamExposureTracker payload={{ ayahIds: props.readingAyahIds, pageNumber: props.pageNumber, sourceType: "reading_page", surahId: props.currentSurahId }} /> : null}
      {!props.flow ? <ReadModeTools themeSurahId={props.themeSurahId} hifzRevealByThirdsEnabled={props.hifzRevealByThirdsEnabled} onHifzRevealByThirdsChange={props.setHifzRevealByThirdsEnabled} showJumpControls={props.showJumpControls} onToggleJumpControls={() => props.setShowJumpControls((current) => !current)} audioEnabled={props.audioEnabled} isAudioVisible={props.isAudioVisible} onToggleAudio={props.onToggleAudio} /> : null}
      <div className="hidden sm:block"><div className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ${props.showJumpControls ? "max-h-[420px] translate-y-0 opacity-100" : "pointer-events-none max-h-0 -translate-y-1 opacity-0"}`} aria-hidden={!props.showJumpControls}><div className="pt-1">{props.showJumpControls ? jumpControls : null}</div></div></div>
      <div className="sm:hidden">{props.showJumpControls ? <div className="fixed inset-0 z-[55] bg-black/30" onClick={() => props.setShowJumpControls(false)}><section className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-[28px] border border-b-0 border-stone-200 bg-white/98 px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4 shadow-[0_-18px_48px_rgba(0,0,0,0.18)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/97" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Lompat di luar mushaf</p><p className="text-xs text-stone-500 dark:text-stone-400">Pilih halaman, surah, atau juz tanpa menyesakkan bacaan.</p></div><button type="button" onClick={() => props.setShowJumpControls(false)} className="inline-flex min-h-10 items-center rounded-full border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Tutup</button></div>{jumpControls}</section></div> : null}</div>
      {props.mushafHeader}
      <div className="mb-1 flex w-full justify-end gap-2"><PageArrow direction="<" href={props.nextPageHref} label="Halaman Seterusnya" /><PageArrow direction=">" href={props.previousPageHref} label="Halaman Sebelum" /></div>
      <div className="relative w-full">
        {props.showTasmiOverlay ? <HifzTasmiOverlay totalLines={props.totalLineCount} revealedLines={props.tasmiRevealedLines} onTap={props.onTasmiTap} onRevealTo={props.setTasmiRevealedLines} /> : null}
        {props.memorizeHideMushaf ? <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-stone-900/80 backdrop-blur-md"><p className="text-center text-lg font-semibold text-white/90">Cuba baca tanpa melihat</p></div> : null}
        {props.useLightweightViewer ? (
          <ReadOnlyMushafPageView key={props.pageNumber} pageNumber={props.pageNumber} layout={props.layout} onNavigatePrevPage={props.onNavigatePreviousPage} onNavigateNextPage={props.onNavigateNextPage} onCanvasTap={props.onCanvasTap} onAyahAudioTap={props.audioEnabled ? props.onAyahAudioTap : undefined} audioDiscovered={props.audioDiscovered} onAudioDiscovered={props.onAudioDiscovered} onReadyChange={props.onReadyChange} activePlaybackAyahKey={props.activePlaybackAyahKey} />
        ) : (
          <MushafPageView key={props.pageNumber} pageNumber={props.pageNumber} layout={props.layout} wordTranslations={props.wordTranslations} ayahDetails={props.ayahDetails} memorizedAyahKeys={props.resolvedMemorizedAyahKeys} hifzRevealByThirdsEnabled={!props.flow && props.hifzRevealByThirdsEnabled} onNavigatePrevPage={props.onNavigatePreviousPage} onNavigateNextPage={props.onNavigateNextPage} onCanvasTap={props.onCanvasTap} onAyahAudioTap={props.audioEnabled ? props.onAyahAudioTap : undefined} audioDiscovered={props.audioDiscovered} onAudioDiscovered={props.onAudioDiscovered} onReadyChange={props.onReadyChange} activePlaybackAyahKey={props.activePlaybackAyahKey} isAudioDockVisible={props.isAudioVisible} onPlayableAyahKeysChange={props.flow === "memorize" ? undefined : props.setPlayableAyahKeys} />
        )}
      </div>
    </div>
  );
}
