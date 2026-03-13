"use client";

import { useEffect, useState } from "react";
import { useReadAudio } from "@/components/ReadAudioProvider";
import { usePathname } from "next/navigation";

export function FeedbackButton() {
  const { feedbackHidden, feedbackOffsetPx } = useReadAudio();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

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
    if (feedbackHidden) {
      setIsOpen(false);
    }
  }, [feedbackHidden]);

  const isMobileReadSurface =
    isMobileViewport && pathname.startsWith("/read/");

  useEffect(() => {
    if (isMobileReadSurface) {
      setIsOpen(false);
    }
  }, [isMobileReadSurface]);

  if (isMobileReadSurface) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: feedback,
          metadata: {
            screen: window.location.pathname,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to send feedback");

      setSent(true);
      setTimeout(() => {
        setSent(false);
        setIsOpen(false);
        setFeedback("");
      }, 2000);
    } catch (err) {
      console.error(err);
      alert("Maaf, ralat berlaku semasa menghantar maklum balas.");
    } finally {
      setIsSending(false);
    }

  };

  return (
    <div
      className={`fixed right-6 z-50 transition-all duration-300 ${
        feedbackHidden ? "pointer-events-none translate-y-6 opacity-0" : "translate-y-0 opacity-100"
      }`}
      style={{ bottom: `calc(env(safe-area-inset-bottom) + ${feedbackOffsetPx}px)` }}
    >
      {isOpen ? (
        <div className="mb-4 w-72 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom-4 dark:border-stone-800 dark:bg-stone-900">
          <h3 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
            Hantar Maklum Balas
          </h3>
          {sent ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="mb-2 h-10 w-10 rounded-full bg-green-100 p-2 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400">Terima kasih! Maklum balas anda telah direkod.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <textarea
                autoFocus
                className="mb-3 w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:border-stone-800 dark:bg-stone-800 dark:text-stone-100 dark:focus:ring-stone-600"
                placeholder="Ada pepijat atau cadangan?"
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
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
          )}
        </div>
      ) : null}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 dark:bg-stone-100 dark:text-stone-900"
        title="Beri Maklum Balas"
      >
        <svg
          className="h-6 w-6"
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
      </button>
    </div>
  );
}
