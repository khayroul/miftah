"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReadMode } from "@/lib/useReadMode";
import type { ReadMode } from "@/lib/readMode";
import { ModeNavigator } from "./ModeNavigator";

interface ReadModeToolsProps {
  themeSurahId: number;
  hifzRevealByThirdsEnabled: boolean;
  onHifzRevealByThirdsChange: (next: boolean) => void;
  showJumpControls: boolean;
  onToggleJumpControls: () => void;
}

export function ReadModeTools({
  themeSurahId,
  hifzRevealByThirdsEnabled,
  onHifzRevealByThirdsChange,
  showJumpControls,
  onToggleJumpControls,
}: ReadModeToolsProps) {
  const router = useRouter();
  const { mode, setMode } = useReadMode();

  const handleModeChange = (nextMode: ReadMode, e: React.MouseEvent) => {
    e.preventDefault();
    if (nextMode === "faham") {
      router.push("/faham");
      return;
    }

    if (nextMode === "tema") {
      router.push(`/read/surah/${themeSurahId}/themes`);
      return;
    }

    setMode(nextMode);
  };

  return (
    <section className="space-y-4">
      <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
        <ModeNavigator
          activeMode={mode}
          fallbackThemeSurahId={themeSurahId}
          onModeClick={handleModeChange}
          leftAccessory={
            <>
              <Link
                href="/"
                className="mr-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                title="Utama"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </Link>
              <span className="hidden sm:inline-block pr-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                Mode
              </span>
            </>
          }
        />
      </div>

      <div className="flex w-full items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggleJumpControls}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all shadow-sm ${
            showJumpControls
              ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
              : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          }`}
        >
          {showJumpControls ? "Tutup Pilih Halaman" : "Pilih Halaman"}
        </button>

        {mode === "hifz" ? (
          <button
            type="button"
            onClick={() =>
              onHifzRevealByThirdsChange(!hifzRevealByThirdsEnabled)
            }
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-all shadow-sm ${
              hifzRevealByThirdsEnabled
                ? "border-teal-900 bg-teal-900 text-teal-50 dark:border-teal-300 dark:bg-teal-300 dark:text-teal-950"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            }`}
          >
            {hifzRevealByThirdsEnabled
              ? "Paparan 1/3 aktif"
              : "Paparan 1/3 tidak aktif"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
