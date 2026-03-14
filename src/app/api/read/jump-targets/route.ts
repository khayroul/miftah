import { NextResponse } from "next/server";
import { getReadJumpTargets } from "@/lib/readNavigation";

export async function GET() {
  try {
    const jumpTargets = await getReadJumpTargets();
    return NextResponse.json(jumpTargets, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error: unknown) {
    console.error("[api/read/jump-targets] Failed to load jump targets", error);
    return NextResponse.json(
      { error: "Unable to load jump targets." },
      { status: 500 },
    );
  }
}
