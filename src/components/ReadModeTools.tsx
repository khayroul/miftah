"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageAudioControls, type PageAudioTrack } from "@/components/PageAudioControls";
import { ReadJumpControls } from "@/components/ReadJumpControls";
import { ReadSessionActions } from "@/components/ReadSessionActions";
import { useReadMode } from "@/lib/useReadMode";
import type { ReadMode } from "@/lib/readMode";

interface SurahOption {
  surah: number;
  name: string;
  page: number;
}

interface JuzOption {
  juz: number;
  page: number;
}

interface ReadModeToolsProps {
  currentPage: number;
  currentSurahId: number;
  currentJuzNumber: number;
  themeSurahId: number;
  surahOptions: SurahOption[];
  juzOptions: JuzOption[];
  audioTracks: PageAudioTrack[];
  onPlaybackAyahChange?: (ayahKey: string | null) => void;
  hifzRevealByThirdsEnabled: boolean;
  onHifzRevealByThirdsChange: (next: boolean) => void;
}

const MODES: Array<{ value: ReadMode; label: string }> = [
  { value: "read", label: "Read" },
  { value: "study", label: "Study" },
  { value: "hifz", label: "Hifz" },
];
const JUMP_PANEL_STORAGE_KEY = "miftah:read:show-jump";
const AUDIO_PANEL_STORAGE_KEY = "miftah:read:show-audio";

export function ReadModeTools({
  currentPage,
  currentSurahId,
  currentJuzNumber,
  themeSurahId,
  surahOptions,
  juzOptions,
  audioTracks,
  onPlaybackAyahChange,
  hifzRevealByThirdsEnabled,
  onHifzRevealByThirdsChange,
}: ReadModeToolsProps) {
  const { mode, setMode } = useReadMode();
  const [showJumpControls, setShowJumpControls] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(JUMP_PANEL_STORAGE_KEY) === "1";
  });
  const [showAudioControls, setShowAudioControls] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(AUDIO_PANEL_STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(JUMP_PANEL_STORAGE_KEY, showJumpControls ? "1" : "0");
  }, [showJumpControls]);

  useEffect(() => {
    window.localStorage.setItem(AUDIO_PANEL_STORAGE_KEY, showAudioControls ? "1" : "0");
  }, [showAudioControls]);

  return (
    <section className="space-y-4">
      <div className="flex w-full flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Mode Selector */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-stone-200 bg-white p-1.5 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <span className="pl-3 pr-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Mode
          </span>
          {MODES.map((item) => {
            const active = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-stone-900 text-stone-50 shadow-md dark:bg-stone-100 dark:text-stone-900"
                    : "text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {mode === "read" ? (
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 sm:ml-2">
            Minimal UI for tilawah.
          </p>
        ) : null}
      </div>

      {mode !== "read" ? (
        <div className="inline-flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowJumpControls((current) => !current)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-all shadow-sm ${
              showJumpControls
                ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            }`}
          >
            {showJumpControls ? "Hide Jump-To" : "Show Jump-To"}
          </button>
          <button
            type="button"
            onClick={() => setShowAudioControls((current) => !current)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-all shadow-sm ${
              showAudioControls
                ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            }`}
          >
            {showAudioControls ? "Hide Audio" : "Show Audio"}
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
                ? "1/3 Hifz Reveal: On"
                : "1/3 Hifz Reveal: Off"}
            </button>
          ) : null}

          {mode === "study" && (
            <Link
              href={`/read/surah/${themeSurahId}/themes`}
              className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Open Theme Chunks &rarr;
            </Link>
          )}
        </div>
      ) : null}

      {mode === "study" ? (
        <>
          {showJumpControls ? (
            <ReadJumpControls
              currentPage={currentPage}
              currentSurahId={currentSurahId}
              currentJuzNumber={currentJuzNumber}
              surahOptions={surahOptions}
              juzOptions={juzOptions}
            />
          ) : null}
          {showAudioControls ? (
            <PageAudioControls
              tracks={audioTracks}
              onPlaybackAyahChange={onPlaybackAyahChange}
            />
          ) : null}
          <ReadSessionActions currentPage={currentPage} />
        </>
      ) : null}

      {mode === "hifz" ? (
        <>
          {showAudioControls ? (
            <PageAudioControls
              tracks={audioTracks}
              onPlaybackAyahChange={onPlaybackAyahChange}
            />
          ) : null}
          <ReadSessionActions currentPage={currentPage} />
          {showJumpControls ? (
            <ReadJumpControls
              currentPage={currentPage}
              currentSurahId={currentSurahId}
              currentJuzNumber={currentJuzNumber}
              surahOptions={surahOptions}
              juzOptions={juzOptions}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
