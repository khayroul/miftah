import { NextResponse } from "next/server";

import {
  getThemeAppearanceChunksBySurah,
  type ThemeAppearanceChunk,
} from "@/data/repositories/tema";
import {
  getWordByWordForAyahIds,
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
    // The prev-surah fetch (for cross-surah back navigation) depends on
    // nothing computed from the current surah's chunks — fire both
    // concurrently instead of sequentially. Its error handling stays
    // non-critical (swallowed to null) exactly as the old try/catch did.
    const prevChunksPromise: Promise<ThemeAppearanceChunk[] | null> =
      surahId > 1
        ? getThemeAppearanceChunksBySurah(surahId - 1).catch(() => null)
        : Promise.resolve(null);

    const [chunks, prevChunks] = await Promise.all([
      getThemeAppearanceChunksBySurah(surahId),
      prevChunksPromise,
    ]);

    // Collect all ayah IDs across all chunks for WBW
    const allAyahIds = chunks.flatMap((chunk) =>
      chunk.ayat.map((a) => a.id),
    );
    const wbw =
      allAyahIds.length > 0
        ? await getWordByWordForAyahIds(allAyahIds)
        : {};

    // Previous surah chunk count for cross-surah back navigation
    const prevSurahChunkCount: number | null =
      prevChunks && prevChunks.length > 0 ? prevChunks.length : null;

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
