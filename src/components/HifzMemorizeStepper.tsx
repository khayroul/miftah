"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadQueue,
  advanceQueue,
  markRated,
  getItemsForPage,
  isQueueComplete,
  clearQueue,
} from "@/lib/hifz/sessionQueue";

interface HifzMemorizeStepperProps {
  pageNumber: number;
  /** Callback to control mushaf visibility: true = hidden */
  onMushafHide: (hidden: boolean) => void;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: Array<{ step: Step; label: string; description: string }> = [
  { step: 1, label: "Dengar & Baca", description: "Dengar bacaan sambil ikut mushaf." },
  { step: 2, label: "Cuba Sendiri", description: "Baca kuat bersama audio. Ulang jika perlu." },
  { step: 3, label: "Tutup & Uji", description: "Cuba baca tanpa melihat. Ketuk untuk intip." },
  { step: 4, label: "Tandakan", description: "Adakah anda yakin dengan hafalan ini?" },
];

export function HifzMemorizeStepper({
  pageNumber,
  onMushafHide,
}: HifzMemorizeStepperProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  const goToStep = useCallback(
    (step: Step) => {
      setCurrentStep(step);
      // Steps 1-2: mushaf visible, Step 3: hidden, Step 4: visible again
      onMushafHide(step === 3);
    },
    [onMushafHide],
  );

  const handleNext = useCallback(() => {
    if (currentStep < 4) {
      goToStep((currentStep + 1) as Step);
    }
  }, [currentStep, goToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      goToStep((currentStep - 1) as Step);
    }
  }, [currentStep, goToStep]);

  const handleRate = useCallback(
    async (confident: boolean) => {
      setSubmitting(true);
      try {
        const queue = loadQueue("memorize");
        if (!queue) {
          setSubmitting(false);
          return;
        }

        const pageItems = getItemsForPage(queue, pageNumber);

        if (confident && pageItems.length > 0) {
          // Mark memorized + rate Good
          const ratings = pageItems.map((item) => ({
            progressId: item.progressId,
            rating: 3 as const,
            block: item.block,
          }));

          await fetch("/api/hifz/rate-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ratings }),
          });

          // Also mark as memorized (promotes sabak → sabqi)
          await fetch("/api/hifz/mark-memorized", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ayahIds: pageItems.map((item) => item.ayahId),
            }),
          });

          markRated(
            "memorize",
            pageItems.map((item) => item.progressId),
          );
        }

        // Advance to next page regardless of confidence
        const updated = advanceQueue("memorize");
        if (!updated || isQueueComplete(updated)) {
          clearQueue("memorize");
          setComplete(true);
          setSubmitting(false);
          onMushafHide(false);
          return;
        }

        const nextPage = updated.pageOrder[updated.currentPageIndex];
        router.push(`/read/${nextPage}?flow=memorize&qi=${updated.currentPageIndex}`);
      } catch {
        setSubmitting(false);
      }
    },
    [pageNumber, router, onMushafHide],
  );

  if (complete) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-6 text-center shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
        <p className="mb-1 text-xl font-bold text-stone-900 dark:text-stone-100">
          Alhamdulillah
        </p>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          Sesi hafalan baru selesai!
        </p>
        <a
          href="/hifz"
          className="inline-flex items-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          Kembali ke Hafal
        </a>
      </div>
    );
  }

  const stepInfo = STEPS[currentStep - 1];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
      {/* Step indicator */}
      <div className="mb-3 flex items-center justify-center gap-2">
        {STEPS.map((s) => (
          <div
            key={s.step}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              s.step < currentStep
                ? "bg-amber-500 text-white"
                : s.step === currentStep
                  ? "bg-amber-100 text-amber-800 ring-2 ring-amber-400 dark:bg-amber-900/50 dark:text-amber-200 dark:ring-amber-500"
                  : "bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"
            }`}
          >
            {s.step < currentStep ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              s.step
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="mb-3 text-center">
        <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
          {stepInfo.label}
        </p>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
          {stepInfo.description}
        </p>
      </div>

      {/* Actions */}
      {currentStep < 4 ? (
        <div className="flex justify-center gap-3">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Kembali
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            Seterusnya
          </button>
          <a
            href="/hifz"
            className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-500 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
          >
            Keluar
          </a>
        </div>
      ) : (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleRate(true)}
            className="flex-1 max-w-[200px] rounded-xl bg-teal-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
          >
            Yakin
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleRate(false)}
            className="flex-1 max-w-[200px] rounded-xl border border-stone-300 bg-white px-6 py-3 text-base font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Belum Yakin
          </button>
        </div>
      )}
    </div>
  );
}
