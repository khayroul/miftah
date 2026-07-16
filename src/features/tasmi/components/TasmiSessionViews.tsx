"use client";

import { TasmiTextFollow } from "./TasmiTextFollow";

export type TasmiStatus =
  | "checking"
  | "intro"
  | "busy"
  | "unavailable"
  | "idle"
  | "ready"
  | "prompt"
  | "listening"
  | "processing"
  | "error"
  | "talqin"
  | "complete";

export type TasmiStreamMode = "connecting" | "live" | "fallback";
export type TasmiSessionMode = "practice" | "exam";

const STATUS_LABELS: Record<TasmiStatus, string> = {
  checking: "Menyemak pelayan tasmi'...",
  intro: "Sedia untuk mula",
  busy: "Tasmi' sedang penuh",
  unavailable: "Pelayan tidak tersedia",
  idle: "Sedia untuk mula",
  ready: "Menyediakan mikrofon...",
  prompt: "Dengar ayat permulaan",
  listening: "Saya sedang mendengar",
  processing: "Sebentar, saya sedang menyemak",
  error: "Ada bahagian yang perlu diperbetulkan",
  talqin: "Saya bantu dengan tiga perkataan",
  complete: "Bacaan selesai",
};

const STATUS_DESCRIPTIONS: Partial<Record<TasmiStatus, string>> = {
  ready: "Kekal di halaman ini sementara mikrofon diaktifkan.",
  prompt: "Selepas audio berhenti, teruskan bacaan tanpa menekan apa-apa.",
  listening: "Baca secara semula jadi. Saya akan mengikuti bacaan anda.",
  processing: "Bacaan anda sudah diterima dan sedang diperiksa.",
  error: "Ulang dari bahagian terakhir yang betul, kemudian teruskan.",
  talqin: "Dengar panduan, kemudian sambung sendiri.",
  complete: "Mikrofon telah dihentikan.",
};

function getStatusLabel(status: TasmiStatus, sessionMode: TasmiSessionMode): string {
  if (sessionMode === "exam" && status === "error") {
    return STATUS_LABELS.listening;
  }
  return STATUS_LABELS[status];
}

function getStatusDescription(
  status: TasmiStatus,
  sessionMode: TasmiSessionMode,
): string | null {
  if (sessionMode === "exam" && status === "error") {
    return "Teruskan bacaan sehingga tamat. Keputusan akan ditunjukkan selepas sesi.";
  }
  if (sessionMode === "exam" && status === "listening") {
    return "Teruskan bacaan sehingga tamat. Teks dan bantuan kekal disembunyikan.";
  }
  return STATUS_DESCRIPTIONS[status] ?? null;
}

export function TasmiCheckingView() {
  return (
    <div className="ui-surface flex flex-col items-center gap-4 rounded-3xl p-6">
      <div className="h-3 w-3 animate-pulse rounded-full bg-brand" />
      <p role="status" aria-live="polite" className="text-center text-sm font-semibold text-foreground">
        {STATUS_LABELS.checking}
      </p>
    </div>
  );
}

interface TasmiBusyViewProps {
  onRetry: () => void;
  onCancel: () => void;
}

export function TasmiBusyView({ onRetry, onCancel }: TasmiBusyViewProps) {
  return (
    <div className="ui-surface-solid flex flex-col items-center gap-4 rounded-3xl p-5 sm:p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3m10-3v3M5 9h14M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 8h6m-6 3h4" />
        </svg>
      </div>
      <div className="max-w-sm space-y-2 text-center">
        <h2 className="text-base font-semibold text-foreground">Tasmi&apos; sedang penuh</h2>
        <p role="status" aria-live="assertive" className="text-sm leading-6 text-muted">
          Semua tempat sedang digunakan oleh pembaca lain. Sesi anda belum bermula dan bacaan tidak dinilai. Cuba semula sebentar lagi.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          Cuba Semula
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          Kembali
        </button>
      </div>
    </div>
  );
}

interface TasmiUnavailableViewProps {
  errorMsg: string | null;
  midSessionOutage: boolean;
  onRetry: () => void;
  onCancel: () => void;
}

export function TasmiUnavailableView({
  errorMsg,
  midSessionOutage,
  onRetry,
  onCancel,
}: TasmiUnavailableViewProps) {
  return (
    <div className="ui-surface-solid flex flex-col items-center gap-4 rounded-3xl p-5 sm:p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <p role="status" aria-live="assertive" className="max-w-sm text-center text-sm text-rose-700 dark:text-rose-300">
        {errorMsg ?? "Pelayan tasmi' tidak tersedia sekarang."}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          {midSessionOutage ? "Sambung Semula" : "Semak Semula"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          Keluar
        </button>
      </div>
    </div>
  );
}

interface TasmiIntroViewProps {
  errorMsg: string | null;
  sessionMode: TasmiSessionMode;
  hasStartPrompt: boolean;
  talqinEnabled: boolean;
  onStart: () => void;
  onCancel: () => void;
}

export function TasmiIntroView({
  errorMsg,
  sessionMode,
  hasStartPrompt,
  talqinEnabled,
  onStart,
  onCancel,
}: TasmiIntroViewProps) {
  return (
    <div className="ui-surface-solid flex flex-col items-center gap-5 rounded-3xl p-5 sm:p-6">
      {errorMsg ? (
        <p role="alert" className="max-w-sm text-center text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>
      ) : null}
      <div className="text-center">
        <p className="ui-eyebrow">
          {sessionMode === "exam" ? "Tasmi' · Mod Ujian" : "Tasmi' · Mod Latihan"}
        </p>
        <h2 className="mt-2 text-xl font-bold text-foreground">
          {sessionMode === "exam"
            ? "Baca seperti di hadapan guru"
            : "Saya akan dengar dan membantu"}
        </h2>
      </div>
      <ol className="max-w-sm list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
        {hasStartPrompt ? (
          <li>Saya akan <span className="font-semibold text-foreground">bacakan ayat permulaan</span>. Dengar, kemudian sambung hingga habis halaman.</li>
        ) : (
          <li>Baca dengan suara yang jelas, dari perkataan pertama.</li>
        )}
        <li>Baca secara semula jadi dan berterusan. Tidak perlu berhenti selepas setiap ayat.</li>
        {talqinEnabled ? (
          <li>Jika tersilap atau tersekat, saya akan <span className="font-semibold text-foreground">beri talqin tiga perkataan</span>, kemudian tunggu anda menyambung.</li>
        ) : (
          <li><span className="font-semibold text-foreground">Teks dan bantuan disembunyikan.</span> Kesilapan hanya ditunjukkan dalam keputusan selepas sesi.</li>
        )}
      </ol>
      <p className="max-w-sm text-center text-xs leading-5 text-muted">
        Audio diproses sementara semasa sesi ini dan tidak disimpan oleh pelayan tasmi&apos;.
      </p>
      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onStart}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          {sessionMode === "exam" ? "Mula Ujian" : "Mula Tasmi'"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          Kembali
        </button>
      </div>
    </div>
  );
}

export interface TasmiActiveViewProps {
  errorMsg: string | null;
  hint: string | null;
  sessionMode: TasmiSessionMode;
  streamMode: TasmiStreamMode;
  status: TasmiStatus;
  expectedText: string;
  followIndex: number;
  tentativeFollowIndex: number | null;
  errorPositions: ReadonlySet<number>;
  tentativeErrorPositions: ReadonlySet<number>;
  progress: number;
  onStop: () => void;
  onCancel: () => void;
}

export function TasmiActiveView({
  errorMsg,
  hint,
  sessionMode,
  streamMode,
  status,
  expectedText,
  followIndex,
  tentativeFollowIndex,
  errorPositions,
  tentativeErrorPositions,
  progress,
  onStop,
  onCancel,
}: TasmiActiveViewProps) {
  const statusDescription = getStatusDescription(status, sessionMode);
  const progressPercent = Math.round(progress * 100);

  return (
    <div className="ui-surface-solid flex flex-col items-center gap-5 rounded-3xl p-4 sm:p-6">
      {errorMsg ? (
        <p role="alert" className="w-full max-w-md rounded-2xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {errorMsg}
        </p>
      ) : null}
      {hint && (sessionMode === "practice" || streamMode === "fallback") ? (
        <p className="w-full max-w-md rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {hint}
        </p>
      ) : null}

      {sessionMode === "practice" ? (
        <TasmiTextFollow
          expectedText={expectedText}
          followIndex={followIndex}
          tentativeFollowIndex={tentativeFollowIndex}
          errorPositions={errorPositions}
          tentativeErrorPositions={tentativeErrorPositions}
        />
      ) : (
        <div className="flex min-h-44 w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface-muted px-5 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-solid text-brand shadow-sm">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path strokeLinecap="round" d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4m-3 0h6" />
            </svg>
          </div>
          <p className="font-semibold text-foreground">Teks disembunyikan semasa ujian</p>
          <p className="max-w-xs text-sm leading-6 text-muted">
            Teruskan dari ayat yang dibacakan. Bantuan dan tanda kesilapan hanya
            muncul selepas sesi tamat.
          </p>
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        className={`rounded-full px-3 py-1.5 text-center text-xs font-semibold ${
          streamMode === "live"
            ? "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
            : "bg-surface-muted text-muted"
        }`}
      >
        {streamMode === "connecting"
          ? "Menghubungkan maklum balas masa nyata..."
          : streamMode === "live"
            ? "Maklum balas masa nyata aktif"
            : "Masih mendengar — semakan mungkin mengambil sedikit masa"}
      </p>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`w-full max-w-md rounded-2xl border px-4 py-4 ${
          status === "error"
            ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30"
            : status === "processing"
              ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
              : "border-border-subtle bg-surface"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className={`mt-1 h-3 w-3 shrink-0 rounded-full transition-colors ${
              status === "listening"
                ? "animate-pulse bg-rose-500"
                : status === "processing"
                  ? "animate-pulse bg-amber-500"
                  : status === "talqin" || status === "prompt"
                    ? "animate-pulse bg-teal-500"
                    : status === "error"
                      ? "bg-rose-500"
                      : "bg-stone-400"
            }`}
          />
          <div>
            <p className="text-sm font-bold text-foreground">
              {getStatusLabel(status, sessionMode)}
            </p>
            {statusDescription ? (
              <p className="mt-1 text-sm leading-5 text-muted">{statusDescription}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
          <span>Kemajuan bacaan</span>
          <span>{progressPercent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Kemajuan bacaan Tasmi'"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          className="h-2.5 overflow-hidden rounded-full bg-surface-strong"
        >
          <div
            className="h-full rounded-full bg-teal-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        {status !== "complete" ? (
          <button
            type="button"
            onClick={onStop}
            className="ui-touch-target flex-1 cursor-pointer rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700"
          >
            Tamatkan Sesi
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          Keluar
        </button>
      </div>
    </div>
  );
}
