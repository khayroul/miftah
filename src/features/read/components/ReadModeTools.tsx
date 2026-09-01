"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useReadMode } from "../domain/useReadMode";
import type { ReadMode } from "../domain/readMode";
import { ModeNavigator } from "./ModeNavigator";
import { navigateWithOfflineSupport } from "@/shared/pwa/navigation";

interface ReadModeToolsProps {
  themeSurahId: number;
  hifzRevealByThirdsEnabled: boolean;
  onHifzRevealByThirdsChange: (next: boolean) => void;
  showJumpControls: boolean;
  onToggleJumpControls: () => void;
  audioEnabled: boolean;
  isAudioVisible: boolean;
  onToggleAudio: () => void;
  showHifzRevealControl?: boolean;
}

export function ReadModeTools({
  themeSurahId,
  hifzRevealByThirdsEnabled,
  onHifzRevealByThirdsChange,
  showJumpControls,
  onToggleJumpControls,
  audioEnabled,
  isAudioVisible,
  onToggleAudio,
  showHifzRevealControl = true,
}: ReadModeToolsProps) {
  const router = useRouter();
  const t = useTranslations("read.modeTools");
  const { mode, setMode } = useReadMode();

  const handleModeChange = (nextMode: ReadMode, e: React.MouseEvent) => {
    if (nextMode === "read") {
      e.preventDefault();
      setMode(nextMode);
      return;
    }

    if (nextMode === "faham") {
      e.preventDefault();
      navigateWithOfflineSupport(router, "/faham");
      return;
    }

    if (nextMode === "tema") {
      e.preventDefault();
      navigateWithOfflineSupport(router, `/read/surah/${themeSurahId}/themes`);
      return;
    }

    if (nextMode === "hifz") {
      e.preventDefault();
      navigateWithOfflineSupport(router, "/hifz");
    }
  };

  return (
    <section className="space-y-3 sm:space-y-4">
      <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:items-center sm:gap-4">
        <ModeNavigator
          activeMode={mode}
          fallbackThemeSurahId={themeSurahId}
          onModeClick={handleModeChange}
          showUtilities
        />
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:gap-3">
        {audioEnabled ? (
          <button
            type="button"
            onClick={onToggleAudio}
            className={`ui-touch-target flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm font-medium shadow-sm transition-colors sm:px-4 sm:text-base ${
              isAudioVisible
                ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            {isAudioVisible ? t("audioOpenLabel") : t("audioLabel")}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleJumpControls}
          className={`ui-touch-target min-h-11 shrink-0 rounded-full border px-3 py-2 text-sm font-medium shadow-sm transition-colors sm:px-4 sm:text-base ${
            showJumpControls
              ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
              : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          }`}
        >
          {showJumpControls ? t("closePageButton") : t("choosePageButton")}
        </button>

        {mode === "hifz" && showHifzRevealControl ? (
          <button
            type="button"
            onClick={() =>
              onHifzRevealByThirdsChange(!hifzRevealByThirdsEnabled)
            }
            className={`ui-touch-target min-h-11 shrink-0 rounded-full border px-3 py-2 text-sm font-medium shadow-sm transition-colors sm:px-4 sm:text-base ${
              hifzRevealByThirdsEnabled
                ? "border-teal-900 bg-teal-900 text-teal-50 dark:border-teal-300 dark:bg-teal-300 dark:text-teal-950"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            }`}
          >
            {hifzRevealByThirdsEnabled
              ? t("thirdsRevealActive")
              : t("thirdsRevealInactive") }
          </button>
        ) : null}
      </div>
    </section>
  );
}
