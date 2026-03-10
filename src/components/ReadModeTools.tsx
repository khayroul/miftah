"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const { mode, setMode } = useReadMode();

  const handleModeChange = (nextMode: ReadMode) => {
    if (nextMode === "faham") {
      setMode(nextMode);
      router.push("/faham");
      return;
    }

    if (nextMode === "tema") {
      setMode(nextMode);
      router.push(`/read/surah/${themeSurahId}/themes`);
      return;
    }

    setMode(nextMode);
  };

  return (
    <section className="space-y-4">
      <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
        <div className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-stone-200 bg-white p-1.5 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <span className="pl-3 pr-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Mode
          </span>
          {MODES.map((item) => {
            const active = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => handleModeChange(item.value)}
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
          {showJumpControls ? "Sembunyikan lompat" : "Buka lompat"}
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
