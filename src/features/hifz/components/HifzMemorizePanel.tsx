"use client";

import {
  TasmiSessionUI,
  type AyahRange,
  type TasmiRatingLabel,
  type TasmiSessionResult,
} from "@/features/tasmi";
import { buildSignInPath } from "@/features/auth";
import type {
  ChunkSizeSuggestion,
  MemorizeChunk,
  MemorizeChunkSizeOption,
} from "../domain/memorizeChunks";

export type MemorizeStep = 1 | 2 | 3 | 4;

export interface MemorizeFlowError {
  message: string;
  requiresSignIn?: boolean;
  continueHref?: string;
  continueLabel?: string;
}

const STEPS: Array<{
  step: MemorizeStep;
  label: string;
  description: string;
  nextLabel: string;
}> = [
  {
    step: 1,
    label: "Dengar & baca",
    description: "Ikut mushaf sambil dengar chunk ini.",
    nextLabel: "Saya sudah dengar",
  },
  {
    step: 2,
    label: "Cuba sendiri",
    description: "Baca kuat bersama audio sehingga alirannya terasa biasa.",
    nextLabel: "Sedia uji tanpa melihat",
  },
  {
    step: 3,
    label: "Tutup & uji",
    description: "Baca tanpa melihat. Gunakan Tasmi’ jika mahu semakan suara.",
    nextLabel: "Saya sudah cuba",
  },
  {
    step: 4,
    label: "Nilai ingatan",
    description: "Jawab berdasarkan cubaan tanpa melihat tadi.",
    nextLabel: "",
  },
];

const CHUNK_SIZE_OPTIONS: Array<{
  label: string;
  value: MemorizeChunkSizeOption;
}> = [
  { label: "Auto", value: "auto" },
  { label: "1 ayat", value: 1 },
  { label: "2 ayat", value: 2 },
  { label: "3 ayat", value: 3 },
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
  onTasmiEnd: (
    result: TasmiSessionResult,
    label: TasmiRatingLabel,
  ) => void;
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
  if (!first) return "Tiada ayat";
  const last = chunk.items[chunk.items.length - 1] ?? first;
  return first.ayahKey === last.ayahKey
    ? `Ayat ${first.ayahKey}`
    : `Ayat ${first.ayahKey}–${last.ayahKey}`;
}

export function HifzMemorizePanel(props: HifzMemorizePanelProps) {
  const { setPanelElement } = props;
  if (props.complete) return <CompletionPanel {...props} />;
  if (props.error) return <ErrorPanel {...props} error={props.error} />;

  const stepInfo = STEPS[props.currentStep - 1];
  const restartLabel =
    props.currentStep === 3 ? "Dengar semula" : "Main semula";

  return (
    <div
      ref={setPanelElement}
      className="ui-surface-solid fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain rounded-t-[2rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
      style={{
        bottom: props.bottomOffsetPx,
        maxHeight: `calc(100dvh - ${props.bottomOffsetPx}px - 0.75rem)`,
      }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-strong sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ui-eyebrow">
              Chunk {props.chunkCount > 0 ? props.currentChunkIndex + 1 : 0}{" "}
              daripada {props.chunkCount}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {stepInfo.label}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {stepInfo.description}
            </p>
          </div>

          <button
            type="button"
            onClick={props.onToggleChunkSize}
            className="ui-touch-target inline-flex shrink-0 touch-manipulation items-center gap-2 rounded-xl border border-border-subtle bg-surface-muted px-3 text-left text-xs font-semibold text-foreground transition-colors hover:bg-surface-strong"
            aria-expanded={props.showChunkSize}
          >
            <span className="hidden max-w-40 truncate sm:inline">
              {describeChunk(props.currentChunk)}
            </span>
            <span>Saiz</span>
            <svg
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${
                props.showChunkSize ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19 9-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        <div
          className="mt-4 grid grid-cols-4 gap-2"
          aria-label={`Langkah ${props.currentStep} daripada 4`}
        >
          {STEPS.map((step) => {
            const complete = step.step < props.currentStep;
            const active = step.step === props.currentStep;
            return (
              <div key={step.step} className="min-w-0">
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    complete || active ? "bg-amber-500" : "bg-surface-strong"
                  }`}
                />
                <p
                  className={`mt-1 truncate text-[0.68rem] font-semibold ${
                    active ? "text-amber-700 dark:text-amber-300" : "text-muted"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  {step.step}. {step.label}
                </p>
              </div>
            );
          })}
        </div>

        {props.autoAdvancing ? (
          <p
            className="mt-3 animate-pulse text-center text-sm font-semibold text-warning"
            aria-live="polite"
          >
            Audio selesai. Membuka langkah seterusnya…
          </p>
        ) : null}

        {props.showChunkSize ? <ChunkSizeControls {...props} /> : null}

        {props.tasmiActive && props.tasmiExpectedText ? (
          <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-muted p-3">
            <TasmiSessionUI
              expectedText={props.tasmiExpectedText}
              surahNumber={props.tasmiSurahNumber}
              startAyah={props.tasmiStartAyah}
              endAyah={props.tasmiEndAyah}
              ayahRanges={props.tasmiAyahRanges}
              onSessionEnd={props.onTasmiEnd}
              onCancel={props.onTasmiCancel}
            />
          </div>
        ) : props.currentStep === 3 ? (
          <button
            type="button"
            disabled={props.tasmiLoading}
            onClick={props.onTasmiStart}
            className="ui-touch-target mt-4 w-full touch-manipulation rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-100 dark:hover:bg-rose-950/55"
          >
            {props.tasmiLoading
              ? "Menyediakan semakan suara…"
              : "Semak bacaan dengan Tasmi’"}
          </button>
        ) : null}

        {props.currentStep < 4 ? (
          <StepActions
            {...props}
            nextLabel={stepInfo.nextLabel}
            restartLabel={restartLabel}
          />
        ) : (
          <RatingButtons {...props} />
        )}
      </div>
    </div>
  );
}

function ChunkSizeControls(props: HifzMemorizePanelProps) {
  return (
    <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-muted p-3">
      <p className="text-sm font-semibold text-foreground">
        Berapa banyak ayat setiap chunk?
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHUNK_SIZE_OPTIONS.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => props.onChunkSizeChange(option.value)}
            className={`ui-touch-target touch-manipulation rounded-xl px-3 text-xs font-semibold transition-colors ${
              props.chunkSize === option.value
                ? "bg-foreground text-background"
                : "border border-border-subtle bg-surface-solid text-foreground hover:bg-surface-strong"
            }`}
            aria-pressed={props.chunkSize === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      {props.chunkSuggestion && !props.suggestionDismissed ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
          <p className="min-w-0 flex-1 text-xs text-amber-900 dark:text-amber-100">
            {props.chunkSuggestion === "smaller"
              ? "Nampak sukar? Cuba chunk lebih kecil."
              : "Aliran semakin baik. Cuba chunk lebih besar."}
          </p>
          <button
            type="button"
            onClick={props.onApplySuggestion}
            className="ui-touch-target shrink-0 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Cuba
          </button>
          <button
            type="button"
            onClick={props.onDismissSuggestion}
            className="ui-touch-target inline-flex shrink-0 items-center justify-center rounded-lg text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
            aria-label="Abaikan cadangan saiz chunk"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StepActions(
  props: HifzMemorizePanelProps & {
    nextLabel: string;
    restartLabel: string;
  },
) {
  return (
    <div className="mt-4">
      <div
        className={`grid gap-2 ${
          props.currentStep > 1 ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        <button
          type="button"
          onClick={props.onChunkListen}
          className="ui-touch-target touch-manipulation rounded-xl border border-border-subtle bg-surface-solid px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
        >
          {props.restartLabel}
        </button>
        <button
          type="button"
          onClick={props.onChunkPause}
          className="ui-touch-target touch-manipulation rounded-xl border border-border-subtle bg-surface-solid px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          Jeda audio
        </button>
        {props.currentStep > 1 ? (
          <button
            type="button"
            onClick={props.onBack}
            className="ui-touch-target touch-manipulation rounded-xl border border-border-subtle bg-surface-solid px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            Langkah lalu
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={props.onNext}
        className="ui-touch-target mt-2 w-full touch-manipulation rounded-xl bg-amber-600 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-700"
      >
        {props.nextLabel}
      </button>

      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2">
        <ArrowButton
          disabled={props.currentChunkIndex === 0}
          label="Chunk sebelum"
          direction="back"
          onClick={() => props.onJumpToChunk(props.currentChunkIndex - 1)}
        />
        <a
          href="/hifz"
          className="ui-touch-target inline-flex items-center rounded-xl px-3 text-xs font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          Simpan tempat & keluar
        </a>
        <ArrowButton
          disabled={props.currentChunkIndex >= props.chunkCount - 1}
          label="Chunk seterusnya"
          direction="forward"
          onClick={() => props.onJumpToChunk(props.currentChunkIndex + 1)}
        />
      </div>
    </div>
  );
}

function ArrowButton(props: {
  disabled: boolean;
  direction: "back" | "forward";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="ui-touch-target inline-flex touch-manipulation items-center justify-center rounded-xl border border-border-subtle bg-surface-solid px-3 text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      aria-label={props.label}
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={props.direction === "back" ? "m15 19-7-7 7-7" : "m9 5 7 7-7 7"}
        />
      </svg>
    </button>
  );
}

function RatingButtons(props: HifzMemorizePanelProps) {
  return (
    <div className="mt-4">
      <p className="text-center text-sm font-medium text-muted">
        Bagaimana cubaan tanpa melihat tadi?
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={props.submitting}
          onClick={() => props.onRate(true)}
          className="ui-touch-target touch-manipulation rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60 dark:text-slate-950"
        >
          {props.submitting ? "Menyimpan…" : "Yakin — simpan chunk"}
        </button>
        <button
          type="button"
          disabled={props.submitting}
          onClick={() => props.onRate(false)}
          className="ui-touch-target touch-manipulation rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60"
        >
          Belum yakin — ulang lagi
        </button>
      </div>
    </div>
  );
}

function CompletionPanel(props: HifzMemorizePanelProps) {
  const { bottomOffsetPx, setPanelElement } = props;
  return (
    <div
      ref={setPanelElement}
      className="ui-surface-solid fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain rounded-t-[2rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 text-center"
      style={{
        bottom: bottomOffsetPx,
        maxHeight: `calc(100dvh - ${bottomOffsetPx}px - 0.75rem)`,
      }}
    >
      <p className="ui-eyebrow">Disimpan</p>
      <p className="mt-2 text-xl font-bold text-foreground">Alhamdulillah</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        Sesi hafalan selesai. Kembali ke Hafal untuk lihat ulang kaji dan
        cadangan seterusnya.
      </p>
      <a
        href="/hifz"
        className="ui-touch-target mt-4 inline-flex items-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
      >
        Lihat langkah seterusnya
      </a>
    </div>
  );
}

function ErrorPanel(
  props: HifzMemorizePanelProps & { error: MemorizeFlowError },
) {
  const { bottomOffsetPx, error, setPanelElement } = props;
  return (
    <div
      ref={setPanelElement}
      className="ui-surface-solid fixed inset-x-0 bottom-0 z-50 overflow-y-auto overscroll-contain rounded-t-[2rem] border-t-rose-200 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 text-center dark:border-t-rose-900/40"
      style={{
        bottom: bottomOffsetPx,
        maxHeight: `calc(100dvh - ${bottomOffsetPx}px - 0.75rem)`,
      }}
    >
      <p className="text-sm font-semibold text-danger">Sesi tergendala</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
        {error.message}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {error.continueHref ? (
          <a
            href={error.continueHref}
            className="ui-touch-target inline-flex items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
          >
            {error.continueLabel ?? "Teruskan sesi"}
          </a>
        ) : null}
        {error.requiresSignIn ? (
          <a
            href={buildSignInPath("/hifz")}
            className="ui-touch-target inline-flex items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
          >
            Log masuk
          </a>
        ) : null}
        <a
          href="/hifz"
          className="ui-touch-target inline-flex items-center rounded-xl border border-border-strong bg-surface-solid px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
        >
          Kembali ke Hafal
        </a>
      </div>
    </div>
  );
}
