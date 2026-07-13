"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { navigateWithOfflineSupport } from "@/shared/pwa/navigation";

interface ThemeSurahOption {
  surah: number;
  nameBm: string;
  nameEn: string;
}

interface ThemeJumpControlsProps {
  currentSurahNumber: number;
  currentChunkIndex: number;
  currentChunkCount: number;
  surahOptions: ThemeSurahOption[];
}

export function ThemeJumpControls({
  currentSurahNumber,
  currentChunkIndex,
  currentChunkCount,
  surahOptions,
}: ThemeJumpControlsProps) {
  const router = useRouter();
  const [selectedSurah, setSelectedSurah] = useState(String(currentSurahNumber));

  return (
    <section className="rounded-2xl border border-stone-300 bg-white px-4 py-4 shadow-sm sm:px-5 dark:border-stone-600 dark:bg-stone-900">
      <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-stone-700 sm:text-sm dark:text-stone-300">
        Lompat Tema
      </p>
      <div className="grid gap-3">
        <label className="min-w-0 text-sm font-medium text-stone-600 dark:text-stone-300">
          Pilih Surah
          <select
            value={selectedSurah}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSelectedSurah(nextValue);
              const params = new URLSearchParams({ chunk: "1" });
              navigateWithOfflineSupport(
                router,
                `/read/surah/${nextValue}/themes?${params.toString()}`,
              );
            }}
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
          >
            {surahOptions.map((option) => (
              <option key={option.surah} value={option.surah}>
                {option.surah}. {option.nameBm} ({option.nameEn})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
        Sekarang: Surah {currentSurahNumber}, Tema {currentChunkIndex} daripada{" "}
        {Math.max(currentChunkCount, 1)}.
      </p>
    </section>
  );
}
