import { supabaseServer } from "@/lib/supabase-server";
import { newCardDbRow } from "@/shared/fsrsBridge";
import { isUniqueViolation } from "@/shared/postgres";
import type { FsrsFields, HifzStatus, StudyProgress } from "@/types/database";

const SABQI_WINDOW_DAYS = 7;
const SABAK_SIZE = 10;
const MANZIL_DAILY_LIMIT = 30; // 2 pages × 15 ayat

const STUDY_PROGRESS_COLUMNS =
  "id, user_id, ayah_id, hifz_status, sabak_started_at, moved_to_sabqi_at, moved_to_manzil_at, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, created_at, updated_at";

export async function hasAnyHifzProgress(userId: string): Promise<boolean> {
  const { count, error } = await supabaseServer
    .from("study_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function getOrCreateProgress(
  userId: string,
  ayahId: number,
): Promise<StudyProgress> {
  const { data } = await supabaseServer
    .from("study_progress")
    .select(STUDY_PROGRESS_COLUMNS)
    .eq("user_id", userId)
    .eq("ayah_id", ayahId)
    .single();

  if (data) return data as StudyProgress;

  const row = {
    user_id: userId,
    ayah_id: ayahId,
    hifz_status: "not_started" as HifzStatus,
    ...newCardDbRow(),
  };
  const { data: created, error } = await supabaseServer
    .from("study_progress")
    .insert(row)
    .select(STUDY_PROGRESS_COLUMNS)
    .single();
  if (error) throw error;
  return created as StudyProgress;
}

export async function getProgressById(
  id: number,
): Promise<StudyProgress | null> {
  const { data } = await supabaseServer
    .from("study_progress")
    .select(STUDY_PROGRESS_COLUMNS)
    .eq("id", id)
    .single();
  return data as StudyProgress | null;
}

export async function getProgressByAyahIds(
  userId: string,
  ayahIds: number[],
): Promise<Map<number, StudyProgress>> {
  const uniqueAyahIds = Array.from(
    new Set(ayahIds.filter((ayahId) => Number.isInteger(ayahId) && ayahId > 0)),
  );
  if (uniqueAyahIds.length === 0) {
    return new Map<number, StudyProgress>();
  }

  const { data, error } = await supabaseServer
    .from("study_progress")
    .select(STUDY_PROGRESS_COLUMNS)
    .eq("user_id", userId)
    .in("ayah_id", uniqueAyahIds);
  if (error) throw error;

  const map = new Map<number, StudyProgress>();
  for (const row of (data ?? []) as StudyProgress[]) {
    map.set(row.ayah_id, row);
  }
  return map;
}

export async function updateFsrsFields(
  id: number,
  fields: FsrsFields,
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_progress")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateHifzStatus(
  id: number,
  status: HifzStatus,
  now: Date,
): Promise<void> {
  const update: Record<string, unknown> = {
    hifz_status: status,
    updated_at: now.toISOString(),
  };
  if (status === "sabak") update.sabak_started_at = now.toISOString();
  if (status === "sabqi") update.moved_to_sabqi_at = now.toISOString();
  if (status === "manzil") update.moved_to_manzil_at = now.toISOString();

  const { error } = await supabaseServer
    .from("study_progress")
    .update(update)
    .eq("id", id);
  if (error) throw error;
}

export async function demoteManzilToSabqi(
  progressId: number,
  now: Date,
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_progress")
    .update({
      hifz_status: "sabqi",
      moved_to_sabqi_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", progressId);
  if (error) throw error;
}

export async function promoteSabqiToManzil(userId: string): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SABQI_WINDOW_DAYS);
  const now = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("study_progress")
    .update({ hifz_status: "manzil", moved_to_manzil_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("hifz_status", "sabqi")
    .lt("moved_to_sabqi_at", cutoff.toISOString())
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

async function getSabqi(userId: string): Promise<StudyProgress[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SABQI_WINDOW_DAYS);

  const { data, error } = await supabaseServer
    .from("study_progress")
    .select(STUDY_PROGRESS_COLUMNS)
    .eq("user_id", userId)
    .eq("hifz_status", "sabqi")
    .gte("moved_to_sabqi_at", cutoff.toISOString())
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StudyProgress[];
}

async function getOrCreateSabak(userId: string): Promise<StudyProgress[]> {
  const { data: existing, error: e1 } = await supabaseServer
    .from("study_progress")
    .select(STUDY_PROGRESS_COLUMNS)
    .eq("user_id", userId)
    .eq("hifz_status", "sabak")
    .order("ayah_id", { ascending: true });
  if (e1) throw e1;
  if (existing && existing.length > 0) return existing as StudyProgress[];

  // Find the highest ayah_id the user has started, then pick the next batch
  const { data: lastRow } = await supabaseServer
    .from("study_progress")
    .select("ayah_id")
    .eq("user_id", userId)
    .order("ayah_id", { ascending: false })
    .limit(1)
    .single();

  const lastId = (lastRow as { ayah_id: number } | null)?.ayah_id ?? 0;

  const { data: nextAyat, error: e2 } = await supabaseServer
    .from("ayat")
    .select("id")
    .gt("id", lastId)
    .order("id", { ascending: true })
    .limit(SABAK_SIZE);
  if (e2) throw e2;

  const ayahIds = ((nextAyat ?? []) as { id: number }[]).map((r) => r.id);
  if (ayahIds.length === 0) return [];

  const now = new Date().toISOString();
  const rows = ayahIds.map((ayahId) => ({
    user_id: userId,
    ayah_id: ayahId,
    hifz_status: "sabak" as HifzStatus,
    sabak_started_at: now,
    ...newCardDbRow(),
  }));

  // B8: two concurrent daily-plan requests can both pass the "no sabak yet"
  // check above and race to insert the same next batch. UNIQUE(user_id, ayah_id)
  // makes one insert lose with a 23505 violation. Swallow ONLY that race and fall
  // through to re-select the winner's rows — a graceful degrade instead of an
  // unhandled 500. Any other error still propagates.
  const { error: e3 } = await supabaseServer.from("study_progress").insert(rows);
  if (e3 && !isUniqueViolation(e3)) throw e3;

  const { data: created, error: e4 } = await supabaseServer
    .from("study_progress")
    .select(STUDY_PROGRESS_COLUMNS)
    .eq("user_id", userId)
    .eq("hifz_status", "sabak")
    .order("ayah_id", { ascending: true });
  if (e4) throw e4;
  return (created ?? []) as StudyProgress[];
}

async function getManzil(userId: string): Promise<StudyProgress[]> {
  const { data, error } = await supabaseServer
    .from("study_progress")
    .select(STUDY_PROGRESS_COLUMNS)
    .eq("user_id", userId)
    .eq("hifz_status", "manzil")
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(MANZIL_DAILY_LIMIT);
  if (error) throw error;
  return (data ?? []) as StudyProgress[];
}

export interface RawDailyPlan {
  sabqi: StudyProgress[];
  sabak: StudyProgress[];
  manzil: StudyProgress[];
}

export async function getRawDailyPlan(userId: string): Promise<RawDailyPlan> {
  // Correctness-preserving defer: this remains on the read path until an
  // operator-approved scheduled job invokes promoteSabqiToManzil. Removing it
  // without that replacement would strand eligible sabqi rows indefinitely.
  await promoteSabqiToManzil(userId);
  const [sabqi, sabak, manzil] = await Promise.all([
    getSabqi(userId),
    getOrCreateSabak(userId),
    getManzil(userId),
  ]);
  return { sabqi, sabak, manzil };
}
