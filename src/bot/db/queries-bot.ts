import { supabaseAdmin } from "../supabase-admin.js";
import type { Ayah, HifzStatus, Surah, Word } from "@/types/database";
import { getReviewCount } from "./review-log.js";

// ── Ayah queries with joins ──

export interface AyahWithDetails {
  id: number;
  ayah_id: number;
  hifz_status: HifzStatus;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  ayah: Ayah;
  surah_name: string;
}

export async function getDueAyatWithDetails(
  userId: string,
  status: HifzStatus,
  limit: number,
): Promise<AyahWithDetails[]> {
  const { data, error } = await supabaseAdmin
    .from("study_progress")
    .select("*, ayat!inner(*, surahs!inner(name_arabic, name_transliteration))")
    .eq("user_id", userId)
    .eq("hifz_status", status)
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    ayah: row.ayat,
    surah_name: row.ayat?.surahs?.name_transliteration ?? "",
  }));
}

// ── Vocab queries with joins ──

export interface VocabWithDetails {
  id: number;
  word_id: number;
  due: string;
  state: number;
  reps: number;
  word: Word;
}

export async function getDueVocabWithDetails(
  userId: string,
  limit: number,
): Promise<VocabWithDetails[]> {
  const { data, error } = await supabaseAdmin
    .from("vocab_progress")
    .select("*, words!inner(*)")
    .eq("user_id", userId)
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    word: row.words,
  }));
}

export async function getNewVocabByFrequency(
  userId: string,
  limit: number,
): Promise<Word[]> {
  // Get words the user hasn't learned yet, ordered by frequency (most common first)
  const { data: existingIds } = await supabaseAdmin
    .from("vocab_progress")
    .select("word_id")
    .eq("user_id", userId);

  const knownIds = new Set((existingIds ?? []).map((r: any) => r.word_id));

  const { data, error } = await supabaseAdmin
    .from("words")
    .select("*")
    .order("frequency", { ascending: false })
    .limit(limit + knownIds.size);
  if (error) throw error;

  return ((data ?? []) as Word[])
    .filter((w) => !knownIds.has(w.id))
    .slice(0, limit);
}

// ── Sabak sequencing ──

export async function getNextSabakAyahIds(
  userId: string,
  count: number,
): Promise<number[]> {
  // Find the highest ayah_id user has started
  const { data: lastRow } = await supabaseAdmin
    .from("study_progress")
    .select("ayah_id")
    .eq("user_id", userId)
    .order("ayah_id", { ascending: false })
    .limit(1)
    .single();

  const lastId = lastRow?.ayah_id ?? 0;

  const { data, error } = await supabaseAdmin
    .from("ayat")
    .select("id")
    .gt("id", lastId)
    .order("id", { ascending: true })
    .limit(count);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id);
}

// ── Ayah word details ──

export interface AyahWord {
  wordId: number;
  position: number;
  textUthmani: string;
  translationBm: string | null;
  translationEn: string | null;
}

export async function getAyahWordsWithTranslations(
  ayahId: number,
): Promise<AyahWord[]> {
  const { data, error } = await supabaseAdmin
    .from("word_occurrences")
    .select("position, word_id, words!inner(id, text_uthmani, translation_bm, translation_en)")
    .eq("ayah_id", ayahId)
    .order("position", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    wordId: row.words.id,
    position: row.position,
    textUthmani: row.words.text_uthmani,
    translationBm: row.words.translation_bm,
    translationEn: row.words.translation_en,
  }));
}

// ── Ayah lookup ──

export async function getAyahById(ayahId: number): Promise<Ayah | null> {
  const { data } = await supabaseAdmin
    .from("ayat")
    .select("*")
    .eq("id", ayahId)
    .single();
  return data as Ayah | null;
}

export async function getSurahById(surahId: number): Promise<Surah | null> {
  const { data } = await supabaseAdmin
    .from("surahs")
    .select("*")
    .eq("id", surahId)
    .single();
  return data as Surah | null;
}

// ── Stats ──

export interface UserStats {
  totalAyatStarted: number;
  ayatByStatus: Record<HifzStatus, number>;
  totalVocab: number;
  vocabByState: Record<number, number>; // 0=New 1=Learning 2=Review 3=Relearning
  reviewsToday: number;
  reviewsThisWeek: number;
  reviewsAllTime: number;
  dueAyatToday: number;
  dueVocabToday: number;
  retentionRate: number; // 0-100%
  streak: number; // consecutive days with reviews
  juzProgress: { juz: number; count: number }[]; // ayat started per juz
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  // Parallel queries
  const [
    spData,
    vocabCount,
    vocabStates,
    reviewsToday,
    reviewsThisWeek,
    reviewsAllTime,
    dueAyatToday,
    dueVocabToday,
    retentionData,
    streakDays,
    juzData,
  ] = await Promise.all([
    // Ayat by hifz status
    supabaseAdmin
      .from("study_progress")
      .select("hifz_status")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    // Vocab total
    supabaseAdmin
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .then(({ count }) => count ?? 0),
    // Vocab by state
    supabaseAdmin
      .from("vocab_progress")
      .select("state")
      .eq("user_id", userId)
      .then(({ data }) => data ?? []),
    // Review counts
    getReviewCount(userId, todayStart),
    getReviewCount(userId, weekStart),
    getReviewCount(userId, new Date(0)),
    // Due today
    supabaseAdmin
      .from("study_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due", now.toISOString())
      .neq("hifz_status", "not_started")
      .then(({ count }) => count ?? 0),
    supabaseAdmin
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due", now.toISOString())
      .then(({ count }) => count ?? 0),
    // Retention: count Again(1) vs total in last 30 days
    (() => {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return Promise.all([
        supabaseAdmin
          .from("review_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("reviewed_at", thirtyDaysAgo.toISOString())
          .then(({ count }) => count ?? 0),
        supabaseAdmin
          .from("review_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("reviewed_at", thirtyDaysAgo.toISOString())
          .eq("rating", 1)
          .then(({ count }) => count ?? 0),
      ]);
    })(),
    // Streak: get distinct review dates (last 60 days)
    (() => {
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      return supabaseAdmin
        .from("review_log")
        .select("reviewed_at")
        .eq("user_id", userId)
        .gte("reviewed_at", sixtyDaysAgo.toISOString())
        .order("reviewed_at", { ascending: false })
        .then(({ data }) => {
          const dates = new Set(
            (data ?? []).map((r: any) =>
              new Date(r.reviewed_at).toISOString().slice(0, 10),
            ),
          );
          // Count consecutive days from today backwards
          let streak = 0;
          const d = new Date(now);
          // Check today first; if no reviews today, check if yesterday had reviews (still counts)
          const todayStr = d.toISOString().slice(0, 10);
          if (!dates.has(todayStr)) {
            d.setDate(d.getDate() - 1);
          }
          while (dates.has(d.toISOString().slice(0, 10))) {
            streak++;
            d.setDate(d.getDate() - 1);
          }
          return streak;
        });
    })(),
    // Juz progress: join study_progress → ayat for juz numbers
    supabaseAdmin
      .from("study_progress")
      .select("ayah_id, ayat!inner(juz_number)")
      .eq("user_id", userId)
      .neq("hifz_status", "not_started")
      .then(({ data }) => {
        const juzCounts = new Map<number, number>();
        for (const row of data ?? []) {
          const juz = (row as any).ayat?.juz_number;
          if (juz) juzCounts.set(juz, (juzCounts.get(juz) ?? 0) + 1);
        }
        return [...juzCounts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([juz, count]) => ({ juz, count }));
      }),
  ]);

  // Compute derived values
  const ayatByStatus: Record<HifzStatus, number> = {
    not_started: 0,
    sabak: 0,
    sabqi: 0,
    manzil: 0,
  };
  for (const row of spData) {
    ayatByStatus[row.hifz_status as HifzStatus]++;
  }
  const totalAyatStarted =
    ayatByStatus.sabak + ayatByStatus.sabqi + ayatByStatus.manzil;

  const vocabByState: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const row of vocabStates) {
    vocabByState[row.state] = (vocabByState[row.state] ?? 0) + 1;
  }

  const [totalReviews30d, againCount] = retentionData;
  const retentionRate =
    totalReviews30d > 0
      ? Math.round(((totalReviews30d - againCount) / totalReviews30d) * 100)
      : 0;

  return {
    totalAyatStarted,
    ayatByStatus,
    totalVocab: vocabCount,
    vocabByState,
    reviewsToday,
    reviewsThisWeek,
    reviewsAllTime,
    dueAyatToday,
    dueVocabToday,
    retentionRate,
    streak: streakDays,
    juzProgress: juzData,
  };
}
