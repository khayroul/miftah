import { supabaseServer } from "@/lib/supabase-server";
import { getRawDailyPlan } from "./study-progress";
import type { StudyProgress } from "@/types/database";

export interface AyahDetail {
  id: number;
  surahId: number;
  ayahNumber: number;
  pageNumber: number;
  textUthmani: string;
  displayBm: string | null;
  surahNameEn: string;
  surahNameTranslit: string;
}

export interface PlanItem {
  progress: StudyProgress;
  ayah: AyahDetail;
}

export interface DailyPlanWithDetails {
  sabqi: PlanItem[];
  sabak: PlanItem[];
  manzil: PlanItem[];
}

async function enrichWithAyahDetails(
  items: StudyProgress[],
): Promise<PlanItem[]> {
  if (items.length === 0) return [];

  const ayahIds = items.map((i) => i.ayah_id);

  const { data, error } = await supabaseServer
    .from("ayat")
    .select("id, surah_id, ayah_number, page_number, text_uthmani, display_bm, surahs!inner(name_en, name_transliteration)")
    .in("id", ayahIds);
  if (error) throw error;

  type RawRow = {
    id: number;
    surah_id: number;
    ayah_number: number;
    page_number: number;
    text_uthmani: string;
    display_bm: string | null;
    surahs:
      | { name_en: string; name_transliteration: string }
      | { name_en: string; name_transliteration: string }[];
  };

  const byId = new Map<number, AyahDetail>();
  for (const row of (data ?? []) as RawRow[]) {
    const surahRel = Array.isArray(row.surahs) ? row.surahs[0] : row.surahs;
    byId.set(row.id, {
      id: row.id,
      surahId: row.surah_id,
      ayahNumber: row.ayah_number,
      pageNumber: row.page_number,
      textUthmani: row.text_uthmani,
      displayBm: row.display_bm,
      surahNameEn: surahRel?.name_en ?? "",
      surahNameTranslit: surahRel?.name_transliteration ?? "",
    });
  }

  return items
    .map((progress) => {
      const ayah = byId.get(progress.ayah_id);
      if (!ayah) return null;
      return { progress, ayah };
    })
    .filter((item): item is PlanItem => item !== null);
}

export async function getDailyPlanPageNumbers(
  userId: string,
): Promise<number[]> {
  const raw = await getRawDailyPlan(userId);
  const ayahIds = [...raw.sabqi, ...raw.sabak, ...raw.manzil].map(
    (item) => item.ayah_id,
  );
  if (ayahIds.length === 0) return [];

  const { data, error } = await supabaseServer
    .from("ayat")
    .select("page_number")
    .in("id", ayahIds);
  if (error) throw error;

  return Array.from(
    new Set((data ?? []).map((row: { page_number: number }) => row.page_number)),
  );
}

export async function buildDailyPlanWithDetails(
  userId: string,
): Promise<DailyPlanWithDetails> {
  const raw = await getRawDailyPlan(userId);

  const [sabqi, sabak, manzil] = await Promise.all([
    enrichWithAyahDetails(raw.sabqi),
    enrichWithAyahDetails(raw.sabak),
    enrichWithAyahDetails(raw.manzil),
  ]);

  return { sabqi, sabak, manzil };
}
