import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { supabaseServer } from "@/lib/supabase-server";

const TasmiSessionSchema = z.object({
  surah_number: z.number().int().min(1).max(114),
  start_ayah: z.number().int().min(1),
  end_ayah: z.number().int().min(1),
  total_words: z.number().int().min(1),
  words_correct: z.number().int().min(0),
  accuracy: z.number().min(0).max(100),
  talqin_count: z.number().int().min(0),
  error_positions: z.array(z.number().int().min(0)),
  duration_seconds: z.number().int().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getOptionalAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log masuk diperlukan untuk simpan sesi tasmi'" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = TasmiSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data } = parsed;

  const { error } = await supabaseServer
    .from("tasmi_sessions")
    .insert({
      user_id: user.id,
      surah_number: data.surah_number,
      start_ayah: data.start_ayah,
      end_ayah: data.end_ayah,
      total_words: data.total_words,
      words_correct: data.words_correct,
      accuracy: data.accuracy,
      talqin_count: data.talqin_count,
      error_positions: data.error_positions,
      duration_seconds: data.duration_seconds,
    });

  if (error) {
    return NextResponse.json(
      { error: "Gagal simpan sesi tasmi'" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
