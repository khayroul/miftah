import { buildSignInPath } from "@/lib/auth";
import { TasmiSessionUI, type AyahRange, type TasmiRatingLabel, type TasmiSessionResult } from "@/features/tasmi";
import type { HifzFlowType } from "../domain/sessionQueue";

export interface HifzInlineRatingError {
  message: string;
  requiresSignIn?: boolean;
  continueHref?: string;
  continueLabel?: string;
}

interface HifzInlineRatingViewProps {
  bottomOffsetPx: number;
  complete: boolean;
  error: HifzInlineRatingError | null;
  flowType: HifzFlowType;
  handleRate: (rating: 1 | 3) => void;
  handleTasmiCancel: () => void;
  handleTasmiEnd: (result: TasmiSessionResult, label: TasmiRatingLabel) => void;
  startTasmi: () => void;
  submitting: boolean;
  tasmiActive: boolean;
  tasmiAyahRanges: AyahRange[];
  tasmiEndAyah: number;
  tasmiExpectedText: string | null;
  tasmiLoading: boolean;
  tasmiStartAyah: number;
  tasmiSurahNumber: number;
  visible: boolean;
}

export function HifzInlineRatingView(props: HifzInlineRatingViewProps) {
  const bottomStyle = props.bottomOffsetPx > 0
    ? { bottom: props.bottomOffsetPx }
    : undefined;

  if (props.complete) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-6 text-center shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95" style={bottomStyle}>
        <p className="mb-1 text-xl font-bold text-stone-900 dark:text-stone-100">Alhamdulillah</p>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          Sesi {props.flowType === "memorize" ? "hafalan" : "ulangan"} selesai!
        </p>
        <a href="/hifz" className="inline-flex items-center rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500">
          Kembali ke Hafal
        </a>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-rose-200 bg-white/95 px-4 py-5 text-center shadow-lg backdrop-blur-md dark:border-rose-900/40 dark:bg-stone-900/95" style={bottomStyle}>
        <p className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">Sesi tergendala</p>
        <p className="mx-auto mb-4 max-w-xl text-sm text-stone-600 dark:text-stone-300">{props.error.message}</p>
        <div className="flex justify-center gap-3">
          {props.error.continueHref ? (
            <a href={props.error.continueHref} className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500">
              {props.error.continueLabel ?? "Teruskan Sesi"}
            </a>
          ) : null}
          {props.error.requiresSignIn ? (
            <a href={buildSignInPath("/hifz")} className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500">
              Log Masuk
            </a>
          ) : null}
          <a href="/hifz" className="inline-flex items-center rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
            Kembali ke Hafal
          </a>
        </div>
      </div>
    );
  }

  if (props.tasmiActive && props.tasmiExpectedText) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95" style={bottomStyle}>
        <TasmiSessionUI
          expectedText={props.tasmiExpectedText}
          surahNumber={props.tasmiSurahNumber}
          startAyah={props.tasmiStartAyah}
          endAyah={props.tasmiEndAyah}
          ayahRanges={props.tasmiAyahRanges}
          onSessionEnd={props.handleTasmiEnd}
          onCancel={props.handleTasmiCancel}
        />
      </div>
    );
  }

  const tasmiOnly = !props.visible && !props.tasmiActive;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95" style={bottomStyle}>
      <p className="mb-3 text-center text-sm font-medium text-stone-600 dark:text-stone-400">
        {tasmiOnly ? "Baca tanpa melihat, atau mulakan tasmi’" : "Bagaimana hafalan halaman ini?"}
      </p>
      {!tasmiOnly ? (
        <div className="flex justify-center gap-3">
          <button type="button" disabled={props.submitting} onClick={() => props.handleRate(3)} className="flex-1 max-w-[200px] rounded-xl bg-teal-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500">Hafal</button>
          <button type="button" disabled={props.submitting} onClick={() => props.handleRate(1)} className="flex-1 max-w-[200px] rounded-xl bg-red-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500">Lupa</button>
        </div>
      ) : null}
      <div className={tasmiOnly ? "flex justify-center" : "mt-3 flex justify-center"}>
        <button type="button" disabled={props.tasmiLoading || props.submitting} onClick={props.startTasmi} className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50">
          {props.tasmiLoading ? "Menyediakan..." : "Mula Tasmi’"}
        </button>
      </div>
    </div>
  );
}
