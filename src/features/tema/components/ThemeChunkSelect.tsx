"use client";

import { useRouter } from "next/navigation";
import { navigateWithOfflineSupport } from "@/shared/pwa/navigation";

interface ThemeChunkSelectProps {
  surahNumber: number;
  selectedChunkIndex: number;
  chunks: Array<{ chunk_index: number; label: string }>;
}

export function ThemeChunkSelect({
  surahNumber,
  selectedChunkIndex,
  chunks,
}: ThemeChunkSelectProps) {
  const router = useRouter();

  return (
    <select
      name="chunk"
      defaultValue={String(selectedChunkIndex)}
      onChange={(e) => {
        const value = e.target.value;
        const params = new URLSearchParams({ chunk: value });
        navigateWithOfflineSupport(
          router,
          `/read/surah/${surahNumber}/themes?${params.toString()}`,
        );
      }}
      className="max-w-[12rem] h-10 truncate rounded-full border border-stone-200 bg-white px-3 pr-8 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 cursor-pointer"
    >
      {chunks.map((chunk) => (
        <option key={chunk.chunk_index} value={chunk.chunk_index}>
          {chunk.chunk_index}. {chunk.label}
        </option>
      ))}
    </select>
  );
}
