import { supabase } from "./supabase";
import type { Surah, Ayah } from "@/types/database";

/**
 * Fetch all 114 surahs ordered by id.
 */
export async function getSurahs(): Promise<Surah[]> {
  const { data, error } = await supabase
    .from("surahs")
    .select("*")
    .order("id");
  if (error) throw error;
  return data;
}

/**
 * Fetch a single surah by id.
 */
export async function getSurah(id: number): Promise<Surah> {
  const { data, error } = await supabase
    .from("surahs")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch all ayat for a surah.
 */
export async function getAyatBySurah(surahId: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("surah_id", surahId)
    .order("ayah_number");
  if (error) throw error;
  return data;
}

/**
 * Fetch all ayat for a given page number.
 */
export async function getAyatByPage(pageNumber: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("page_number", pageNumber)
    .order("surah_id")
    .order("ayah_number");
  if (error) throw error;
  return data;
}

/**
 * Fetch a single ayah by surah and ayah number.
 */
export async function getAyah(
  surahId: number,
  ayahNumber: number,
): Promise<Ayah> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("surah_id", surahId)
    .eq("ayah_number", ayahNumber)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch word occurrences for an ayah with word details.
 */
export async function getWordsForAyah(ayahId: number) {
  const { data, error } = await supabase
    .from("word_occurrences")
    .select("*, words(*)")
    .eq("ayah_id", ayahId)
    .order("position");
  if (error) throw error;
  return data;
}
