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
  reviewsToday: number;
  reviewsThisWeek: number;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  // Ayat by status
  const { data: spData, error: spErr } = await supabaseAdmin
    .from("study_progress")
    .select("hifz_status")
    .eq("user_id", userId);
  if (spErr) throw spErr;

  const ayatByStatus: Record<HifzStatus, number> = {
    not_started: 0,
    sabak: 0,
    sabqi: 0,
    manzil: 0,
  };
  for (const row of spData ?? []) {
    ayatByStatus[row.hifz_status as HifzStatus]++;
  }
  const totalAyatStarted =
    ayatByStatus.sabak + ayatByStatus.sabqi + ayatByStatus.manzil;

  // Vocab count
  const { count: totalVocab } = await supabaseAdmin
    .from("vocab_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  // Reviews
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const [reviewsToday, reviewsThisWeek] = await Promise.all([
    getReviewCount(userId, todayStart),
    getReviewCount(userId, weekStart),
  ]);

  return {
    totalAyatStarted,
    ayatByStatus,
    totalVocab: totalVocab ?? 0,
    reviewsToday,
    reviewsThisWeek,
  };
}
