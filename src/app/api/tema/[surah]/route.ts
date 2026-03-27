import { NextResponse } from "next/server";

import {
  getThemeAppearanceChunksBySurah,
  getWordByWordForAyahIds,
  type ThemeAppearanceChunk,
  type AyahWordByWordEntry,
} from "@/lib/queries";

interface TemaApiResponse {
  readonly surahId: number;
  readonly chunks: ThemeAppearanceChunk[];
  readonly wbw: Record<number, AyahWordByWordEntry[]>;
  readonly prevSurahChunkCount: number | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surah: string }> },
): Promise<NextResponse> {
  const { surah } = await params;
  const surahId = Number.parseInt(surah, 10);

  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) {
    return NextResponse.json(
      { error: "Invalid surah number (must be 1-114)" },
      { status: 400 },
    );
  }

  try {
    const chunks = await getThemeAppearanceChunksBySurah(surahId);

    // Collect all ayah IDs across all chunks for WBW
    const allAyahIds = chunks.flatMap((chunk) =>
      chunk.ayat.map((a) => a.id),
    );
    const wbw =
      allAyahIds.length > 0
        ? await getWordByWordForAyahIds(allAyahIds)
        : {};

    // Previous surah chunk count for cross-surah back navigation
    let prevSurahChunkCount: number | null = null;
    if (surahId > 1) {
      try {
        const prevChunks = await getThemeAppearanceChunksBySurah(
          surahId - 1,
        );
        prevSurahChunkCount =
          prevChunks.length > 0 ? prevChunks.length : null;
      } catch {
        // Non-critical — fall back to no cross-surah link
      }
    }

    const response: TemaApiResponse = {
      surahId,
      chunks,
      wbw,
      prevSurahChunkCount,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-transform" },
    });
  } catch (error) {
    console.error(`Failed to load tema for surah ${surahId}:`, error);
    return NextResponse.json(
      { error: "Failed to load tema data" },
      { status: 500 },
    );
  }
}
