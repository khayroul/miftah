"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SUCCESS_VISIBILITY_MS = 5000;

export function FeedbackButton() {
  const feedbackHidden = false;
  const feedbackOffsetPx = 24;
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const successTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const syncViewport = () => {
      setIsMobileViewport(media.matches);
    };

    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => {
      media.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (feedbackHidden) {
      setIsOpen(false);
    }
  }, [feedbackHidden]);

  const isReadSurface = pathname.startsWith("/read/");
  const isMobileReadSurface = isMobileViewport && isReadSurface;
  const useBottomSheet = isMobileViewport;

  const clearSuccessTimeout = () => {
    if (successTimeoutRef.current !== null) {
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  };

  const showSuccessToast = () => {
    clearSuccessTimeout();
    setIsSuccessVisible(true);
    successTimeoutRef.current = window.setTimeout(() => {
      setIsSuccessVisible(false);
      successTimeoutRef.current = null;
    }, SUCCESS_VISIBILITY_MS);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleToggle = () => {
    setErrorMessage(null);
    setIsOpen((current) => !current);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!feedback.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: feedback.trim(),
          metadata: {
            screen: window.location.pathname,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send feedback");
      }

      setFeedback("");
      setIsOpen(false);
      showSuccessToast();
    } catch (error) {
      console.error(error);
      setErrorMessage("Maaf, ralat berlaku semasa menghantar maklum balas.");
    } finally {
      setIsSending(false);
    }
  };

  const formContent = (
    <>
      <h3 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
        Hantar Maklum Balas
      </h3>
      <form onSubmit={handleSubmit}>
        <textarea
          autoFocus
          className="mb-3 w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:border-stone-800 dark:bg-stone-800 dark:text-stone-100 dark:focus:ring-stone-600"
          placeholder="Ada pepijat atau cadangan?"
          rows={4}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
        {errorMessage ? (
          <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSending || !feedback.trim()}
            className="rounded-lg bg-stone-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            {isSending ? "Menghantar..." : "Hantar"}
          </button>
        </div>
      </form>
    </>
  );

  const triggerClassName = isMobileReadSurface
    ? "flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-3.5 text-sm font-medium text-stone-700 shadow-lg backdrop-blur transition hover:bg-white dark:border-stone-700 dark:bg-stone-900/92 dark:text-stone-100 dark:hover:bg-stone-900"
    : "flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 dark:bg-stone-100 dark:text-stone-900";

  const triggerWrapperClassName = `fixed z-50 transition-all duration-300 ${
    isMobileReadSurface ? "left-4" : "right-6"
  } ${
    feedbackHidden
      ? "pointer-events-none translate-y-6 opacity-0"
      : "translate-y-0 opacity-100"
  }`;

  const successToast = isSuccessVisible ? (
    <div
      aria-live="polite"
      className={`fixed z-[60] rounded-2xl border border-emerald-200 bg-white/96 p-4 shadow-2xl backdrop-blur dark:border-emerald-900/70 dark:bg-stone-900/96 ${
        isMobileViewport ? "left-4 right-4 top-4" : "right-6 w-80"
      }`}
      style={
        isMobileViewport
          ? { top: "calc(env(safe-area-inset-top) + 1rem)" }
          : {
              bottom: `calc(env(safe-area-inset-bottom) + ${feedbackOffsetPx + 72}px)`,
            }
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Maklum balas diterima
          </p>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            Terima kasih. Kami sudah simpan maklum balas anda.
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {successToast}

      {useBottomSheet && isOpen ? (
        <div
          className="fixed inset-0 z-[55] bg-black/30"
          onClick={handleClose}
        >
          <section
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-b-0 border-stone-200 bg-white/98 px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4 shadow-[0_-18px_48px_rgba(0,0,0,0.18)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/97"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  Maklum balas ringkas
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Kongsi pepijat atau cadangan tanpa tinggalkan bacaan.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex min-h-10 items-center rounded-full border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Tutup
              </button>
            </div>
            {formContent}
          </section>
        </div>
      ) : null}

      <div
        className={triggerWrapperClassName}
        style={{ bottom: `calc(env(safe-area-inset-bottom) + ${feedbackOffsetPx}px)` }}
      >
        {!useBottomSheet && isOpen ? (
          <div className="mb-4 w-72 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom-4 dark:border-stone-800 dark:bg-stone-900">
            {formContent}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleToggle}
          className={triggerClassName}
          title="Beri Maklum Balas"
        >
          <svg
            className={isMobileReadSurface ? "h-4 w-4" : "h-6 w-6"}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>
          {isMobileReadSurface ? <span>Maklum Balas</span> : null}
        </button>
      </div>
    </>
  );
}
