import { supabaseServer } from "@/data/supabase/server";
import type { UserReadingState } from "@/shared/types/database";

const READING_STATE_COLUMNS =
  "user_id,last_page,last_read_at,created_at,updated_at";

function toUserReadingState(row: UserReadingState): UserReadingState {
  return {
    user_id: row.user_id,
    last_page: row.last_page,
    last_read_at: row.last_read_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getUserReadingState(
  userId: string,
): Promise<UserReadingState | null> {
  const { data, error } = await supabaseServer
    .from("user_reading_state")
    .select(READING_STATE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toUserReadingState(data) : null;
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
    .select(READING_STATE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toUserReadingState(data);
}
