import { supabaseAdmin } from "../supabase-admin.js";
import { newCardDbRow } from "../services/fsrs-bridge.js";
import type { FsrsFields, HifzStatus, StudyProgress } from "@/shared/types/database";

export async function getOrCreateProgress(
  userId: string,
  ayahId: number,
): Promise<StudyProgress> {
  const { data } = await supabaseAdmin
    .from("study_progress")
    .select("*")
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
  const { data: created, error } = await supabaseAdmin
    .from("study_progress")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return created as StudyProgress;
}

export async function getProgressById(
  id: number,
): Promise<StudyProgress | null> {
  const { data } = await supabaseAdmin
    .from("study_progress")
    .select("*")
    .eq("id", id)
    .single();
  return data as StudyProgress | null;
}

export async function updateFsrsFields(
  id: number,
  fields: FsrsFields,
): Promise<void> {
  const { error } = await supabaseAdmin
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

  const { error } = await supabaseAdmin
    .from("study_progress")
    .update(update)
    .eq("id", id);
  if (error) throw error;
}

export async function getByHifzStatus(
  userId: string,
  status: HifzStatus,
): Promise<StudyProgress[]> {
  const { data, error } = await supabaseAdmin
    .from("study_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("hifz_status", status)
    .order("ayah_id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StudyProgress[];
}

export async function getDueAyat(
  userId: string,
  status: HifzStatus,
  limit = 50,
): Promise<StudyProgress[]> {
  const { data, error } = await supabaseAdmin
    .from("study_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("hifz_status", status)
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as StudyProgress[];
}

export async function getSabqiAyat(
  userId: string,
  windowDays: number,
): Promise<StudyProgress[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const { data, error } = await supabaseAdmin
    .from("study_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("hifz_status", "sabqi")
    .gte("moved_to_sabqi_at", cutoff.toISOString())
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StudyProgress[];
}

export async function getManzilDue(
  userId: string,
  limit: number,
): Promise<StudyProgress[]> {
  const { data, error } = await supabaseAdmin
    .from("study_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("hifz_status", "manzil")
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as StudyProgress[];
}

export async function createSabakBatch(
  userId: string,
  ayahIds: number[],
): Promise<void> {
  const now = new Date().toISOString();
  const rows = ayahIds.map((ayahId) => ({
    user_id: userId,
    ayah_id: ayahId,
    hifz_status: "sabak" as HifzStatus,
    sabak_started_at: now,
    ...newCardDbRow(),
  }));

  const { error } = await supabaseAdmin.from("study_progress").insert(rows);
  if (error) throw error;
}

export async function promoteSabqiToManzil(
  userId: string,
  windowDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("study_progress")
    .update({
      hifz_status: "manzil",
      moved_to_manzil_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("hifz_status", "sabqi")
    .lt("moved_to_sabqi_at", cutoff.toISOString())
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function demoteManzilToSabqi(
  progressId: number,
  now: Date,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("study_progress")
    .update({
      hifz_status: "sabqi",
      moved_to_sabqi_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", progressId);
  if (error) throw error;
}
