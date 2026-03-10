import { NextResponse } from "next/server";
import { getOrCreateProgress, updateHifzStatus } from "@/lib/hifz/study-progress";
import { createSupabaseServerClient } from "@/lib/supabase-auth-server";
import type { HifzStatus } from "@/types/database";

interface MarkMemorizedBody {
  ayahId?: number;
  ayahIds?: number[];
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: MarkMemorizedBody;
  try {
    body = (await request.json()) as MarkMemorizedBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromSingle =
    typeof body.ayahId === "number" && Number.isInteger(body.ayahId)
      ? [body.ayahId]
      : [];
  const fromMany = Array.isArray(body.ayahIds)
    ? body.ayahIds.filter(
        (value): value is number =>
          typeof value === "number" && Number.isInteger(value),
      )
    : [];
  const candidateIds = [...fromSingle, ...fromMany];
  const ayahIds = Array.from(
    new Set(candidateIds.filter((value) => value > 0)),
  );
  if (ayahIds.length === 0) {
    return NextResponse.json({ error: "Invalid ayah id(s)" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const now = new Date();
    for (const ayahId of ayahIds) {
      const progress = await getOrCreateProgress(userId, ayahId);
      const currentStatus: HifzStatus = progress.hifz_status;
      if (currentStatus !== "sabqi" && currentStatus !== "manzil") {
        await updateHifzStatus(progress.id, "sabqi", now);
      }
    }

    return NextResponse.json({
      ok: true,
      ayahIds,
      count: ayahIds.length,
    });
  } catch (error) {
    console.error("[hifz/mark-memorized] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
