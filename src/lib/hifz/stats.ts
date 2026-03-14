import { supabaseServer } from "@/lib/supabase-server";

const TOTAL_QURAN_PAGES = 604;
const JUZ_BOUNDARY_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
] as const;

const JUZ_PAGE_COUNTS: Record<number, number> = Object.fromEntries(
  JUZ_BOUNDARY_PAGES.map((startPage, index) => {
    const nextStartPage = JUZ_BOUNDARY_PAGES[index + 1] ?? (TOTAL_QURAN_PAGES + 1);
    return [index + 1, nextStartPage - startPage];
  }),
);

export interface JuzStat {
  juz: number;
  totalPages: number;
  manzilPages: number;
  sabqiPages: number;
  sabakPages: number;
  notStartedPages: number;
  manzilPagePct: number;
}

export interface HifzStats {
  totalManzilPages: number;
  dueTodayPages: number;
  streak: number;
}

interface AyahPageRef {
  juz_number: number;
  page_number: number;
}

function extractAyahPageRef(value: unknown): AyahPageRef | null {
  if (Array.isArray(value)) {
    return extractAyahPageRef(value[0] ?? null);
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const juzNumber = Reflect.get(value, "juz_number");
  const pageNumber = Reflect.get(value, "page_number");
  if (typeof juzNumber !== "number" || typeof pageNumber !== "number") {
    return null;
  }

  return {
    juz_number: juzNumber,
    page_number: pageNumber,
  };
}

export async function getJuzProgress(userId: string): Promise<JuzStat[]> {
  const { data, error } = await supabaseServer
    .from("study_progress")
    .select("hifz_status, ayat!inner(juz_number, page_number)")
    .eq("user_id", userId)
    .not("hifz_status", "is", null);
  if (error) throw error;

  const startedPagesByJuz = new Map<number, Set<number>>();
  const manzilPagesByJuz = new Map<number, Set<number>>();
  const sabqiPagesByJuz = new Map<number, Set<number>>();
  const sabakPagesByJuz = new Map<number, Set<number>>();

  for (const row of (data ?? []) as Array<{ ayat: unknown; hifz_status: string | null }>) {
    const ayah = extractAyahPageRef(row.ayat);
    if (!ayah) {
      continue;
    }

    if (!startedPagesByJuz.has(ayah.juz_number)) {
      startedPagesByJuz.set(ayah.juz_number, new Set<number>());
    }
    startedPagesByJuz.get(ayah.juz_number)!.add(ayah.page_number);

    const targetMap =
      row.hifz_status === "manzil"
        ? manzilPagesByJuz
        : row.hifz_status === "sabqi"
          ? sabqiPagesByJuz
          : row.hifz_status === "sabak"
            ? sabakPagesByJuz
            : null;

    if (!targetMap) {
      continue;
    }

    if (!targetMap.has(ayah.juz_number)) {
      targetMap.set(ayah.juz_number, new Set<number>());
    }
    targetMap.get(ayah.juz_number)!.add(ayah.page_number);
  }

  return Array.from({ length: 30 }, (_, i) => {
    const juzNum = i + 1;
    const totalPages = JUZ_PAGE_COUNTS[juzNum] ?? 0;
    const startedPages = startedPagesByJuz.get(juzNum)?.size ?? 0;
    const manzilPages = manzilPagesByJuz.get(juzNum)?.size ?? 0;
    const sabqiPages = sabqiPagesByJuz.get(juzNum)?.size ?? 0;
    const sabakPages = sabakPagesByJuz.get(juzNum)?.size ?? 0;

    return (
      {
        juz: juzNum,
        totalPages,
        manzilPages,
        sabqiPages,
        sabakPages,
        notStartedPages: Math.max(totalPages - startedPages, 0),
        manzilPagePct: totalPages > 0 ? (manzilPages / totalPages) * 100 : 0,
      }
    );
  });
}

export async function getHifzStats(userId: string): Promise<HifzStats> {
  const now = new Date().toISOString();

  const [manzilResult, dueResult, reviewDatesResult] = await Promise.all([
    supabaseServer
      .from("study_progress")
      .select("ayat!inner(page_number)")
      .eq("user_id", userId)
      .eq("hifz_status", "manzil"),
    supabaseServer
      .from("study_progress")
      .select("ayat!inner(page_number)")
      .eq("user_id", userId)
      .in("hifz_status", ["sabqi", "manzil"])
      .lte("due", now),
    supabaseServer
      .from("review_log")
      .select("reviewed_at")
      .eq("user_id", userId)
      .eq("review_type", "ayah")
      .order("reviewed_at", { ascending: false })
      .limit(365),
  ]);

  if (manzilResult.error) {
    throw manzilResult.error;
  }
  if (dueResult.error) {
    throw dueResult.error;
  }
  if (reviewDatesResult.error) {
    throw reviewDatesResult.error;
  }

  const totalManzilPages = new Set(
    ((manzilResult.data ?? []) as Array<{ ayat: unknown }>)
      .map((row) => extractAyahPageRef(row.ayat)?.page_number ?? null)
      .filter((value): value is number => typeof value === "number"),
  ).size;
  const dueTodayPages = new Set(
    ((dueResult.data ?? []) as Array<{ ayat: unknown }>)
      .map((row) => extractAyahPageRef(row.ayat)?.page_number ?? null)
      .filter((value): value is number => typeof value === "number"),
  ).size;
  const streak = calcStreak(
    (reviewDatesResult.data ?? []).map((r: { reviewed_at: string }) =>
      r.reviewed_at.slice(0, 10),
    ),
  );

  return {
    totalManzilPages,
    dueTodayPages,
    streak,
  };
}

function calcStreak(dates: string[]): number {
  if (dates.length === 0) return 0;

  const unique = [...new Set(dates)].sort().reverse();
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Streak only counts if reviewed today or yesterday
  if (unique[0] !== todayStr && unique[0] !== yesterdayStr) return 0;

  let streak = 0;
  let expected = unique[0] === todayStr ? todayStr : yesterdayStr;

  for (const date of unique) {
    if (date === expected) {
      streak++;
      const d = new Date(expected);
      d.setDate(d.getDate() - 1);
      expected = d.toISOString().slice(0, 10);
    } else {
      break;
    }
  }

  return streak;
}
