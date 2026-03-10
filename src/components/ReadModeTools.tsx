"use client";

import Link from "next/link";
import { useReadMode } from "@/lib/useReadMode";
import type { ReadMode } from "@/lib/readMode";

interface ReadModeToolsProps {
  themeSurahId: number;
  hifzRevealByThirdsEnabled: boolean;
  onHifzRevealByThirdsChange: (next: boolean) => void;
  showJumpControls: boolean;
  onToggleJumpControls: () => void;
}

const MODES: Array<{ value: ReadMode; label: string }> = [
  { value: "read", label: "Baca" },
  { value: "faham", label: "Faham" },
  { value: "tema", label: "Tema" },
  { value: "hifz", label: "Hafal" },
];

export function ReadModeTools({
  themeSurahId,
  hifzRevealByThirdsEnabled,
  onHifzRevealByThirdsChange,
  showJumpControls,
  onToggleJumpControls,
}: ReadModeToolsProps) {
  const { mode, setMode } = useReadMode();

  return (
    <section className="space-y-4">
      <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center">
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
            Mushaf kekal minimal untuk tilawah.
          </p>
        ) : mode === "faham" ? (
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 sm:ml-2">
            Tap perkataan untuk makna segera, kemudian buka engine Faham untuk drill.
          </p>
        ) : mode === "tema" ? (
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 sm:ml-2">
            Fokus alur surah dan tema ayat melalui paparan chunk.
          </p>
        ) : (
          <p className="text-xs font-medium text-stone-400 dark:text-stone-500 sm:ml-2">
            Tap halaman mushaf untuk buka panel audio di bawah.
          </p>
        )}
      </div>

      <div className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleJumpControls}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all shadow-sm ${
            showJumpControls
              ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
              : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          }`}
        >
          {showJumpControls ? "Hide Jump-To" : "Show Jump-To"}
        </button>

        {mode === "read" ? (
          <Link
            href="/faham"
            className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/25 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            Masuk Faham
          </Link>
        ) : null}

        {mode === "faham" ? (
          <>
            <Link
              href="/faham"
              className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/25 dark:text-amber-100 dark:hover:bg-amber-900/40"
            >
              Faham Engine
            </Link>
            <Link
              href={`/read/surah/${themeSurahId}/themes`}
              className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Buka Tema
            </Link>
          </>
        ) : null}

        {mode === "tema" ? (
          <>
            <Link
              href={`/read/surah/${themeSurahId}/themes`}
              className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-700/40 dark:bg-indigo-900/25 dark:text-indigo-100 dark:hover:bg-indigo-900/40"
            >
              Tema Surah
            </Link>
            <Link
              href="/faham"
              className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/25 dark:text-amber-100 dark:hover:bg-amber-900/40"
            >
              Faham Engine
            </Link>
          </>
        ) : null}

        {mode === "hifz" ? (
          <>
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
                ? "Reveal 1/3: On"
                : "Reveal 1/3: Off"}
            </button>
            <Link
              href="/hifz"
              className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Papan Hafal
            </Link>
          </>
        ) : null}
      </div>
    </section>
  );
}
