import { supabaseServer } from "@/data/supabase/server";
import type { Word } from "@/shared/types/database";
import { buildFahamSourceKey } from "@/features/faham/domain/source-key";
import { isRecentExposure } from "@/features/faham/domain/idempotency";
import { isUniqueViolation } from "@/shared/postgres";
import type { FahamExposureInput } from "@/features/faham/domain/types";
import {
  firstRelation,
  type RepoWordWithOccurrences,
} from "./faham-vocabulary";

interface WordOccurrenceJoinRow {
  ayah_id: number;
  page_number: number | null;
  position: number;
  word_id: number;
  words: RepoWordWithOccurrences | RepoWordWithOccurrences[] | null;
}
export interface FahamRecentExposureSource {
  exposedAt: string;
  pageNumber: number | null;
  sourceKey: string | null;
  sourceType: "reading_page" | "theme_chunk" | "hifz_ayah";
  surahId: number | null;
  themeChunkIndex: number | null;
  wordId: number;
}
async function getUniqueWordOccurrencesForAyahIds(
  ayahIds: number[],
): Promise<
  Array<{
    occurrenceCount: number;
    word: Word;
  }>
> {
  const uniqueAyahIds = Array.from(
    new Set(ayahIds.filter((ayahId) => Number.isInteger(ayahId) && ayahId > 0)),
  );
  if (uniqueAyahIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("word_occurrences")
    .select(
      "ayah_id, page_number, position, word_id, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency)",
    )
    .in("ayah_id", uniqueAyahIds)
    .order("ayah_id", { ascending: true })
    .order("position", { ascending: true });
  if (error) {
    throw error;
  }

  const counts = new Map<number, { occurrenceCount: number; word: Word }>();

  for (const row of (data ?? []) as WordOccurrenceJoinRow[]) {
    const word = firstRelation(row.words);
    if (!word) {
      continue;
    }

    const current = counts.get(row.word_id);
    if (current) {
      counts.set(row.word_id, {
        occurrenceCount: current.occurrenceCount + 1,
        word: current.word,
      });
      continue;
    }

    counts.set(row.word_id, {
      occurrenceCount: 1,
      word,
    });
  }

  return Array.from(counts.values());
}

/**
 * Build the per-row event id for an exposure word (B6).
 *
 * One exposure event fans out to one row per exposed word. To keep every word
 * row unique under the (user_id, event_id) index while letting them coexist, the
 * stable per-event token is namespaced by word: `${eventId}#${wordId}`. A retry
 * with the same base eventId regenerates the identical composite for each word,
 * so the re-insert aborts on the unique index and is a true no-op. Returns null
 * for legacy clients that send no event id (those rows are window-guarded).
 */
export function buildExposureRowEventId(
  eventId: string | null | undefined,
  wordId: number,
): string | null {
  return typeof eventId === "string" && eventId.length > 0
    ? `${eventId}#${wordId}`
    : null;
}

export async function recordVocabExposureEvents(
  userId: string,
  input: FahamExposureInput,
  eventId?: string | null,
): Promise<{ recordedWordCount: number; sourceKey: string; deduped?: boolean }> {
  const sourceKey = buildFahamSourceKey(input);
  const now = new Date();
  const hasEventId = typeof eventId === "string" && eventId.length > 0;

  // Idempotency (B6). When the client stamps a stable per-event id
  // (X-Miftah-Exposure-Event-Id), robust dedup is handled by the partial UNIQUE
  // index (user_id, event_id) plus the retry-abort catch below: each word row
  // carries a composite `${eventId}#${word_id}`, so a retried event re-inserts
  // the identical row set and aborts on 23505, which we treat as a true no-op.
  //
  // The best-effort natural-key window guard is kept ONLY as a fallback for
  // LEGACY clients that send no event id (event_id IS NULL rows, which the
  // partial unique index does not cover). It cannot distinguish a network retry
  // from a genuine re-exposure, which is exactly why the event-id path exists.
  if (!hasEventId) {
    const { data: recentRow } = await supabaseServer
      .from("vocab_exposure_events")
      .select("exposed_at")
      .eq("user_id", userId)
      .eq("source_key", sourceKey)
      .order("exposed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      recentRow &&
      isRecentExposure((recentRow as { exposed_at: string }).exposed_at, now)
    ) {
      return {
        deduped: true,
        recordedWordCount: 0,
        sourceKey,
      };
    }
  }

  const words = await getUniqueWordOccurrencesForAyahIds(input.ayahIds);
  if (words.length === 0) {
    return {
      recordedWordCount: 0,
      sourceKey,
    };
  }

  const exposedAt = now.toISOString();
  const ayahId =
    input.sourceType === "hifz_ayah" && input.ayahIds.length === 1
      ? input.ayahIds[0]
      : null;

  const rows = words.map(({ occurrenceCount, word }) => ({
    user_id: userId,
    word_id: word.id,
    source_type: input.sourceType,
    source_key: sourceKey,
    // Per-word composite so one exposure event yields many coexisting rows while
    // remaining unique under (user_id, event_id); a retry regenerates identical
    // ids and no-ops on the index. Null for legacy clients (window-guarded).
    event_id: buildExposureRowEventId(eventId, word.id),
    ayah_id: ayahId,
    page_number: input.sourceType === "reading_page" ? input.pageNumber : null,
    surah_id:
      input.sourceType === "reading_page" || input.sourceType === "theme_chunk"
        ? input.surahId ?? null
        : input.surahId ?? null,
    theme_chunk_index:
      input.sourceType === "theme_chunk" ? input.themeChunkIndex : null,
    occurrence_count: occurrenceCount,
    exposed_at: exposedAt,
  }));

  const { error } = await supabaseServer
    .from("vocab_exposure_events")
    .insert(rows);
  if (error) {
    // B6: a retry carrying the same event_id set aborts the INSERT with a 23505
    // unique_violation on the partial (user_id, event_id) index. Treat it as an
    // idempotent no-op rather than surfacing a 500. Only when an event id was
    // supplied — a legacy null-event insert has no per-event guarantee.
    if (hasEventId && isUniqueViolation(error)) {
      return {
        deduped: true,
        recordedWordCount: 0,
        sourceKey,
      };
    }
    throw error;
  }

  return {
    recordedWordCount: rows.length,
    sourceKey,
  };
}


export async function getRecentFahamExposureSources(
  userId: string,
  wordIds: number[],
): Promise<FahamRecentExposureSource[]> {
  const uniqueWordIds = Array.from(
    new Set(wordIds.filter((wordId) => Number.isInteger(wordId) && wordId > 0)),
  );
  if (uniqueWordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("vocab_exposure_events")
    .select(
      "word_id, source_type, source_key, page_number, surah_id, theme_chunk_index, exposed_at",
    )
    .eq("user_id", userId)
    .in("word_id", uniqueWordIds)
    .order("exposed_at", { ascending: false });
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    exposed_at: string;
    page_number: number | null;
    source_key: string | null;
    source_type: "reading_page" | "theme_chunk" | "hifz_ayah";
    surah_id: number | null;
    theme_chunk_index: number | null;
    word_id: number;
  }>).map((row) => ({
    exposedAt: row.exposed_at,
    pageNumber: row.page_number,
    sourceKey: row.source_key,
    sourceType: row.source_type,
    surahId: row.surah_id,
    themeChunkIndex: row.theme_chunk_index,
    wordId: row.word_id,
  }));
}
