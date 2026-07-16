import type { TasmiSessionResult } from "../domain/tasmi-session";
import { tasmiResultToLabel, type TasmiRatingLabel } from "../domain/fsrs-bridge";
import type { AyahRange } from "./TasmiSessionUI";

interface TasmiSessionResultViewProps {
  result: TasmiSessionResult;
  onRetry: () => void;
  onSave: () => void;
  saveState?: TasmiSaveState;
  saveError?: string | null;
  /**
   * True when the reciter tapped "Hentikan" before reaching the end of the
   * range. An early stop must NOT be graded/saved as a failed full-range
   * recitation (accuracy is computed over the WHOLE range), so saving is
   * disabled and an explanatory note is shown instead.
   */
  endedEarly?: boolean;
  /** When provided, error positions are resolved to surah:ayah for display */
  ayahRanges?: AyahRange[];
}

export type TasmiSaveState = "idle" | "saving" | "saved" | "error";

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const MAX_ERROR_LOCATIONS = 6;

/** Map matcher word positions to human "surah:ayah" locations (deduped, ordered). */
function describeErrorLocations(
  errorPositions: number[],
  ranges: AyahRange[],
): string[] {
  const seen = new Set<string>();
  const locations: string[] = [];
  for (const position of [...errorPositions].sort((a, b) => a - b)) {
    const range = ranges.find(
      r => position >= r.startWordIndex && position <= r.endWordIndex,
    );
    if (!range) continue;
    const key = `${range.surah}:${range.ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push(key);
  }
  return locations;
}

const LABEL_COLORS: Record<TasmiRatingLabel, string> = {
  ulang: "text-rose-500",
  tersangkut: "text-amber-500",
  lancar: "text-teal-500",
  mantap: "text-emerald-500",
};

const LABEL_TEXT: Record<TasmiRatingLabel, string> = {
  ulang: "Ulang",
  tersangkut: "Tersangkut",
  lancar: "Lancar",
  mantap: "Mantap",
};

export function TasmiSessionResultView({
  result,
  onRetry,
  onSave,
  saveState = "idle",
  saveError,
  endedEarly = false,
  ayahRanges,
}: TasmiSessionResultViewProps) {
  const label = tasmiResultToLabel(result);
  const errorLocations =
    ayahRanges && result.errorPositions.length > 0
      ? describeErrorLocations(result.errorPositions, ayahRanges)
      : [];

  return (
    <div className="ui-surface-solid flex flex-col items-center gap-5 rounded-3xl p-5 sm:p-6">
      <p className="ui-eyebrow">
        Keputusan Tasmi&apos;
      </p>
      <p className={`text-3xl font-bold ${LABEL_COLORS[label]}`}>
        {LABEL_TEXT[label]}
      </p>
      <div className="grid w-full max-w-md grid-cols-2 gap-3 text-center text-sm text-muted sm:grid-cols-4">
        <div className="rounded-2xl bg-surface-muted px-3 py-3">
          <p className="text-lg font-bold">{Math.round(result.accuracy)}%</p>
          <p>Ketepatan</p>
        </div>
        <div className="rounded-2xl bg-surface-muted px-3 py-3">
          <p className="text-lg font-bold">{result.wordsCorrect}/{result.totalWords}</p>
          <p>Perkataan</p>
        </div>
        <div
          className="rounded-2xl bg-surface-muted px-3 py-3"
          title="Bilangan kali app membacakan perkataan panduan ketika anda tersekat"
        >
          <p className="text-lg font-bold">{result.talqinCount}</p>
          <p>Talqin</p>
        </div>
        <div className="rounded-2xl bg-surface-muted px-3 py-3">
          <p className="text-lg font-bold">{formatDuration(result.durationSeconds)}</p>
          <p>Masa</p>
        </div>
      </div>
      {errorLocations.length > 0 ? (
        <p className="max-w-xs text-center text-xs text-stone-500 dark:text-stone-400">
          Perlu perhatian:{" "}
          <span className="font-medium text-rose-600 dark:text-rose-400">
            ayat {errorLocations.slice(0, MAX_ERROR_LOCATIONS).join("، ")}
            {errorLocations.length > MAX_ERROR_LOCATIONS
              ? ` (+${errorLocations.length - MAX_ERROR_LOCATIONS} lagi)`
              : ""}
          </span>
        </p>
      ) : null}
      {endedEarly ? (
        <p className="max-w-sm text-center text-sm text-muted">
          Sesi dihentikan sebelum tamat — keputusan ini tidak disimpan supaya
          rekod hafalan anda tidak terjejas. Cuba lagi bila bersedia.
        </p>
      ) : null}
      {!endedEarly && saveState !== "idle" ? (
        <div
          role={saveState === "error" ? "alert" : "status"}
          aria-live={saveState === "error" ? "assertive" : "polite"}
          className={`w-full max-w-md rounded-2xl border px-4 py-3 text-center text-sm ${
            saveState === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
              : saveState === "saved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-border-subtle bg-surface-muted text-muted"
          }`}
        >
          {saveState === "saving"
            ? "Sedang menyimpan keputusan..."
            : saveState === "saved"
              ? "Keputusan telah disimpan. Menyediakan langkah seterusnya..."
              : saveError ?? "Keputusan belum dapat disimpan. Cuba sekali lagi."}
        </div>
      ) : null}
      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        {!endedEarly ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saveState === "saving" || saveState === "saved"}
            className="ui-touch-target flex-1 cursor-pointer rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === "saving"
              ? "Menyimpan..."
              : saveState === "saved"
                ? "Sudah Disimpan"
                : saveState === "error"
                  ? "Cuba Simpan Semula"
                  : "Simpan & Teruskan"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          disabled={saveState === "saving" || saveState === "saved"}
          className="ui-touch-target flex-1 cursor-pointer rounded-xl border border-border-strong bg-surface-solid px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cuba Lagi
        </button>
      </div>
    </div>
  );
}
