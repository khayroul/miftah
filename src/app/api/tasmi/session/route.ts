import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalAuthUser } from "@/features/auth/server";
import { saveTasmiSession } from "@/data/repositories/tasmi";

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

  const saved = await saveTasmiSession(user.id, data);
  if (!saved) {
    return NextResponse.json(
      { error: "Gagal simpan sesi tasmi'" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
