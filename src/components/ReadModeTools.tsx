"use client";

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

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
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
                    ? "bg-stone-900 text-stone-50"
                    : "border border-stone-300 text-stone-700 hover:bg-stone-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {mode === "read" ? (
          <p className="mt-2 text-xs text-stone-500">
            Read mode keeps UI minimal for focused tilawah.
          </p>
        ) : null}
      </div>

      {mode === "study" ? (
        <>
          <ReadJumpControls
            currentPage={currentPage}
            currentSurahId={currentSurahId}
            currentJuzNumber={currentJuzNumber}
            surahOptions={surahOptions}
            juzOptions={juzOptions}
          />
          <div className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4">
            <Link
              href={`/read/surah/${themeSurahId}/themes`}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Open Theme Chunks
            </Link>
          </div>
          <PageAudioControls
            tracks={audioTracks}
            onPlaybackAyahChange={onPlaybackAyahChange}
          />
          <ReadSessionActions currentPage={currentPage} />
        </>
      ) : null}

      {mode === "hifz" ? (
        <>
          <PageAudioControls
            tracks={audioTracks}
            onPlaybackAyahChange={onPlaybackAyahChange}
          />
          <ReadSessionActions currentPage={currentPage} />
          <ReadJumpControls
            currentPage={currentPage}
            currentSurahId={currentSurahId}
            currentJuzNumber={currentJuzNumber}
            surahOptions={surahOptions}
            juzOptions={juzOptions}
          />
        </>
      ) : null}
    </section>
  );
}
