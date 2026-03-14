import { supabaseServer } from "@/lib/supabase-server";

export type ActivityEventType =
  | "faham_word_reviewed"
  | "hifz_ayah_memorized"
  | "hifz_ayah_reviewed"
  | "read_page_viewed"
  | "theme_chunk_completed"
  | "theme_chunk_started";

export type ActivityEntityType = "ayah" | "page" | "theme_chunk" | "word";

export interface RecordActivityEventInput {
  activityType: ActivityEventType;
  entityId?: number | null;
  entityKey: string;
  entityType: ActivityEntityType;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  userId: string;
}

export interface DailyActivityEventSummary {
  activityDate: string;
  fahamWordsCount: number;
  hifzAyatCount: number;
  readPagesCount: number;
  themeChunksCount: number;
  totalEvents: number;
}

function toActivityDateKey(value: string): string {
  return value.slice(0, 10);
}

function buildIdempotencyKey(input: {
  activityDate: string;
  activityType: ActivityEventType;
  entityKey: string;
}): string {
  return `${input.activityType}:${input.activityDate}:${input.entityKey}`;
}

export function todayActivityDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordActivityEvent(
  input: RecordActivityEventInput,
): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const activityDate = toActivityDateKey(occurredAt);
  const idempotencyKey = buildIdempotencyKey({
    activityDate,
    activityType: input.activityType,
    entityKey: input.entityKey,
  });

  const { error } = await supabaseServer.from("activity_events").upsert(
    {
      activity_date: activityDate,
      activity_type: input.activityType,
      entity_id: input.entityId ?? null,
      entity_key: input.entityKey,
      entity_type: input.entityType,
      idempotency_key: idempotencyKey,
      metadata: input.metadata ?? null,
      occurred_at: occurredAt,
      user_id: input.userId,
    },
    { onConflict: "user_id,idempotency_key" },
  );

  if (error) {
    throw error;
  }
}

export async function getDailyActivityEventSummary(
  userId: string,
  activityDate: string,
): Promise<DailyActivityEventSummary | null> {
  const { data, error } = await supabaseServer
    .from("v_daily_activity_summary")
    .select(
      "activity_date, faham_words_count, hifz_ayat_count, read_pages_count, theme_chunks_count, total_events",
    )
    .eq("user_id", userId)
    .eq("activity_date", activityDate)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  return {
    activityDate: data.activity_date as string,
    fahamWordsCount: Number(data.faham_words_count ?? 0),
    hifzAyatCount: Number(data.hifz_ayat_count ?? 0),
    readPagesCount: Number(data.read_pages_count ?? 0),
    themeChunksCount: Number(data.theme_chunks_count ?? 0),
    totalEvents: Number(data.total_events ?? 0),
  };
}

export async function getActivityEventDateKeys(userId: string): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("activity_events")
    .select("activity_date")
    .eq("user_id", userId)
    .order("activity_date", { ascending: false })
    .limit(3650);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ activity_date: string }>)
    .map((row) => row.activity_date)
    .filter((value) => typeof value === "string" && value.length >= 10);
}

export async function getReadPageActivityRows(
  userId: string,
): Promise<Array<{ activityDate: string; entityId: number | null }>> {
  const { data, error } = await supabaseServer
    .from("activity_events")
    .select("activity_date, entity_id")
    .eq("user_id", userId)
    .eq("activity_type", "read_page_viewed")
    .order("activity_date", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    activity_date: string;
    entity_id: number | null;
  }>).map((row) => ({
    activityDate: row.activity_date,
    entityId: typeof row.entity_id === "number" ? row.entity_id : null,
  }));
}

export async function getDailyHifzPageCountFromEvents(
  userId: string,
  activityDate: string,
): Promise<number> {
  const { data, error } = await supabaseServer
    .from("activity_events")
    .select("entity_id")
    .eq("user_id", userId)
    .eq("activity_date", activityDate)
    .in("activity_type", ["hifz_ayah_memorized", "hifz_ayah_reviewed"]);

  if (error) {
    throw error;
  }

  const ayahIds = ((data ?? []) as Array<{ entity_id: number | null }>)
    .map((row) => row.entity_id)
    .filter((value): value is number => typeof value === "number");

  if (ayahIds.length === 0) {
    return 0;
  }

  const { data: ayatRows, error: ayatError } = await supabaseServer
    .from("ayat")
    .select("page_number")
    .in("id", ayahIds);

  if (ayatError) {
    throw ayatError;
  }

  return new Set(
    ((ayatRows ?? []) as Array<{ page_number: number | null }>)
      .map((row) => row.page_number)
      .filter((value): value is number => typeof value === "number"),
  ).size;
}

export async function getLegacyActivityDateKeys(
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("user_activity_log")
    .select("activity_date")
    .eq("user_id", userId)
    .order("activity_date", { ascending: false })
    .limit(3650);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ activity_date: string }>)
    .map((row) => row.activity_date)
    .filter((value) => typeof value === "string" && value.length >= 10);
}
