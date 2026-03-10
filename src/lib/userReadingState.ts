import { supabaseServer } from "@/lib/supabase-server";
import type { UserReadingState } from "@/types/database";

export async function getUserReadingState(
  userId: string,
): Promise<UserReadingState | null> {
  const { data, error } = await supabaseServer
    .from("user_reading_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as UserReadingState | null;
}

export async function saveUserReadingState(
  userId: string,
  page: number,
): Promise<UserReadingState> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("user_reading_state")
    .upsert(
      {
        user_id: userId,
        last_page: page,
        last_read_at: now,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as UserReadingState;
}
