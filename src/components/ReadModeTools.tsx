"use client";

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
  isAudioVisible: boolean;
  onToggleAudio: () => void;
}

export function ReadModeTools({
  themeSurahId,
  hifzRevealByThirdsEnabled,
  onHifzRevealByThirdsChange,
  showJumpControls,
  onToggleJumpControls,
  isAudioVisible,
  onToggleAudio,
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
        />
      </div>

      <div className="flex w-full items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggleAudio}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all shadow-sm ${
            isAudioVisible
              ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
              : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          {isAudioVisible ? "Audio Terbuka" : "Audio"}
        </button>

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
              : "Paparan 1/3 tidak aktif" }
          </button>
        ) : null}
      </div>
    </section>
  );
}
