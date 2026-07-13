import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/features/auth/server";
import { loadDashboardWithDbCache } from "@/features/home/server";

export async function GET() {
  try {
    const user = await getOptionalAuthUser();
    const snapshot = await loadDashboardWithDbCache(user?.id ?? null);

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (error: unknown) {
    console.error("[api/home/dashboard] Failed to load snapshot", error);
    return NextResponse.json(
      { error: "Unable to load dashboard snapshot." },
      { status: 500 },
    );
  }
}
