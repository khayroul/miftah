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
    <section className="space-y-3">
      <div className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Mode
          </span>
          {MODES.map((item) => {
            const active = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900"
                    : "border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {mode === "read" ? (
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            Read mode keeps UI minimal for focused tilawah.
          </p>
        ) : null}
      </div>

      {mode !== "read" ? (
        <div className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Panels
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowJumpControls((current) => !current)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              {showJumpControls ? "Hide Jump-To" : "Show Jump-To"}
            </button>
            <button
              type="button"
              onClick={() => setShowAudioControls((current) => !current)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              {showAudioControls ? "Hide Audio" : "Show Audio"}
            </button>
          </div>
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
          <div className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
            <Link
              href={`/read/surah/${themeSurahId}/themes`}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Open Theme Chunks
            </Link>
          </div>
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
