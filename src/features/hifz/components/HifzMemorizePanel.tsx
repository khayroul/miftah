"use client";

import { TasmiSessionUI, type AyahRange, type TasmiRatingLabel, type TasmiSessionResult } from "@/features/tasmi";
import { buildSignInPath } from "@/features/auth";
import type { MemorizeChunk, MemorizeChunkSizeOption, ChunkSizeSuggestion } from "../domain/memorizeChunks";

export type MemorizeStep = 1 | 2 | 3 | 4;

export interface MemorizeFlowError {
  message: string;
  requiresSignIn?: boolean;
  continueHref?: string;
  continueLabel?: string;
}

const STEPS: Array<{ step: MemorizeStep; label: string; description: string }> = [
  { step: 1, label: "Dengar & Baca", description: "Dengar chunk ini sambil ikut mushaf." },
  { step: 2, label: "Cuba Sendiri", description: "Baca kuat bersama audio. Ulang chunk jika perlu." },
  { step: 3, label: "Tutup & Uji", description: "Jeda audio dan cuba baca tanpa melihat." },
  { step: 4, label: "Tandakan", description: "Nilai chunk ini sebelum bergerak ke chunk seterusnya." },
];

const CHUNK_SIZE_OPTIONS: Array<{ label: string; value: MemorizeChunkSizeOption }> = [
  { label: "Auto", value: "auto" },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
];

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
  onTasmiEnd: (result: TasmiSessionResult, label: TasmiRatingLabel) => void;
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

function describeChunk(chunk: MemorizeChunk | null): string {
  const first = chunk?.items[0];
  if (!first) return "Tiada ayat dalam chunk ini";
  const last = chunk.items[chunk.items.length - 1] ?? first;
  return first.ayahKey === last.ayahKey
    ? `Ayat ${first.ayahKey}`
    : `Ayat ${first.ayahKey} - ${last.ayahKey}`;
}

export function HifzMemorizePanel(props: HifzMemorizePanelProps) {
  const { setPanelElement } = props;
  if (props.complete) return <CompletionPanel {...props} />;
  if (props.error) return <ErrorPanel {...props} error={props.error} />;

  const stepInfo = STEPS[props.currentStep - 1];
  const restartLabel = props.currentStep === 3 ? "Semak Audio" : "Main Semula";
  return (
    <div
      ref={setPanelElement}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95"
      style={{ bottom: props.bottomOffsetPx }}
    >
      {props.autoAdvancing ? <div className="mb-2 flex items-center justify-center"><p className="animate-pulse text-sm font-medium text-amber-600 dark:text-amber-400">Seterusnya...</p></div> : null}

      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {STEPS.map((step) => (
            <div key={step.step} className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${step.step < props.currentStep ? "bg-amber-500 text-white" : step.step === props.currentStep ? "bg-amber-100 text-amber-800 ring-1.5 ring-amber-400 dark:bg-amber-900/50 dark:text-amber-200 dark:ring-amber-500" : "bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"}`}>
              {step.step < props.currentStep ? <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : step.step}
            </div>
          ))}
        </div>
        <button type="button" onClick={props.onToggleChunkSize} className="flex items-center gap-1.5 rounded-lg border border-amber-200/80 bg-amber-50/75 px-2.5 py-1 dark:border-amber-700/45 dark:bg-amber-900/20">
          <span className="text-xs font-semibold text-amber-900/80 dark:text-amber-100/80">Chunk {props.chunkCount > 0 ? props.currentChunkIndex + 1 : 0}/{props.chunkCount}</span>
          <span className="text-xs text-stone-600 dark:text-stone-300">{describeChunk(props.currentChunk)}</span>
          <svg className={`h-3 w-3 text-stone-400 transition-transform ${props.showChunkSize ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>

      {props.showChunkSize ? <ChunkSizeControls {...props} /> : null}
      <div className="mb-2 text-center">
        <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">{stepInfo.label}</span>
        <span className="mx-1.5 text-stone-300 dark:text-stone-600">·</span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{stepInfo.description}</span>
      </div>

      {props.tasmiActive && props.tasmiExpectedText ? (
        <div className="mb-2"><TasmiSessionUI expectedText={props.tasmiExpectedText} surahNumber={props.tasmiSurahNumber} startAyah={props.tasmiStartAyah} endAyah={props.tasmiEndAyah} ayahRanges={props.tasmiAyahRanges} onSessionEnd={props.onTasmiEnd} onCancel={props.onTasmiCancel} /></div>
      ) : props.currentStep === 3 ? (
        <div className="mb-2 flex justify-center"><button type="button" disabled={props.tasmiLoading} onClick={props.onTasmiStart} className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50">{props.tasmiLoading ? "Menyediakan..." : "Mula Tasmi’"}</button></div>
      ) : null}

      {props.currentStep < 4 ? <StepNavigation {...props} restartLabel={restartLabel} /> : <RatingButtons {...props} />}
    </div>
  );
}

function ChunkSizeControls(props: HifzMemorizePanelProps) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-center gap-1.5">
        {CHUNK_SIZE_OPTIONS.map((option) => (
          <button key={String(option.value)} type="button" onClick={() => props.onChunkSizeChange(option.value)} className={`rounded-lg px-3 py-1 text-xs font-medium transition ${props.chunkSize === option.value ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"}`}>{option.label}</button>
        ))}
      </div>
      {props.chunkSuggestion && !props.suggestionDismissed ? (
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">{props.chunkSuggestion === "smaller" ? "Susah? Cuba kecilkan" : "Bagus! Cuba besarkan"}</p>
          <button type="button" onClick={props.onApplySuggestion} className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white transition hover:bg-amber-600">{props.chunkSuggestion === "smaller" ? "Kecilkan" : "Besarkan"}</button>
          <button type="button" onClick={props.onDismissSuggestion} className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-200">✕</button>
        </div>
      ) : null}
    </div>
  );
}

function StepNavigation(props: HifzMemorizePanelProps & { restartLabel: string }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <ArrowButton disabled={props.currentChunkIndex === 0} label="Chunk sebelum" direction="back" onClick={() => props.onJumpToChunk(props.currentChunkIndex - 1)} />
      <button type="button" onClick={props.onChunkListen} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700">{props.restartLabel}</button>
      <button type="button" onClick={props.onChunkPause} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700">Jeda</button>
      {props.currentStep > 1 ? <button type="button" onClick={props.onBack} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700">Kembali</button> : null}
      <button type="button" onClick={props.onNext} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600">Seterusnya</button>
      <ArrowButton disabled={props.currentChunkIndex >= props.chunkCount - 1} label="Chunk seterusnya" direction="forward" onClick={() => props.onJumpToChunk(props.currentChunkIndex + 1)} />
      <a href="/hifz" className="ml-1 text-xs text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300">Keluar</a>
    </div>
  );
}

function ArrowButton(props: { disabled: boolean; direction: "back" | "forward"; label: string; onClick: () => void }) {
  return (
    <button type="button" disabled={props.disabled} onClick={props.onClick} className="rounded-lg border border-stone-300 p-2 text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700" title={props.label}>
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={props.direction === "back" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} /></svg>
    </button>
  );
}

function RatingButtons(props: HifzMemorizePanelProps) {
  return (
    <div className="flex justify-center gap-3">
      <button type="button" disabled={props.submitting} onClick={() => props.onRate(true)} className="flex-1 max-w-[160px] rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50">Yakin</button>
      <button type="button" disabled={props.submitting} onClick={() => props.onRate(false)} className="flex-1 max-w-[160px] rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200">Belum Yakin</button>
    </div>
  );
}

function CompletionPanel(props: HifzMemorizePanelProps) {
  const { bottomOffsetPx, setPanelElement } = props;
  return <div ref={setPanelElement} className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-6 text-center shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95" style={{ bottom: bottomOffsetPx }}><p className="mb-1 text-xl font-bold text-stone-900 dark:text-stone-100">Alhamdulillah</p><p className="mb-4 text-sm text-stone-500 dark:text-stone-400">Sesi hafalan baru selesai!</p><a href="/hifz" className="inline-flex items-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600">Kembali ke Hafal</a></div>;
}

function ErrorPanel(props: HifzMemorizePanelProps & { error: MemorizeFlowError }) {
  const { bottomOffsetPx, error, setPanelElement } = props;
  return (
    <div ref={setPanelElement} className="fixed inset-x-0 bottom-0 z-50 border-t border-rose-200 bg-white/95 px-4 py-5 text-center shadow-lg backdrop-blur-md dark:border-rose-900/40 dark:bg-stone-900/95" style={{ bottom: bottomOffsetPx }}>
      <p className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">Sesi tergendala</p>
      <p className="mx-auto mb-4 max-w-xl text-sm text-stone-600 dark:text-stone-300">{error.message}</p>
      <div className="flex justify-center gap-3">
        {error.continueHref ? <a href={error.continueHref} className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500">{error.continueLabel ?? "Teruskan Sesi"}</a> : null}
        {error.requiresSignIn ? <a href={buildSignInPath("/hifz")} className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500">Log Masuk</a> : null}
        <a href="/hifz" className="inline-flex items-center rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">Kembali ke Hafal</a>
      </div>
    </div>
  );
}
