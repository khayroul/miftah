import { supabaseServer } from "@/lib/supabase-server";
import { TOTAL_QURAN_PAGES, JUZ_BOUNDARY_PAGES, JUZ_PAGE_COUNTS, pageToJuz } from "@/lib/hifz/constants";

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

interface HifzPageProgressRow {
  is_complete_manzil: boolean | null;
  is_due: boolean | null;
  is_started: boolean | null;
  juz_number: number;
  page_number: number;
  sabak_ayat: number | null;
  sabqi_ayat: number | null;
}

export async function getJuzProgress(userId: string): Promise<JuzStat[]> {
  const { data, error } = await supabaseServer
    .from("v_hifz_page_progress")
    .select("juz_number, page_number, is_started, is_complete_manzil, sabqi_ayat, sabak_ayat")
    .eq("user_id", userId);
  if (error) throw error;

  const startedPagesByJuz = new Map<number, number>();
  const manzilPagesByJuz = new Map<number, number>();
  const sabqiPagesByJuz = new Map<number, number>();
  const sabakPagesByJuz = new Map<number, number>();

  for (const row of (data ?? []) as HifzPageProgressRow[]) {
    if (row.is_started) {
      startedPagesByJuz.set(
        row.juz_number,
        (startedPagesByJuz.get(row.juz_number) ?? 0) + 1,
      );
    }

    if (row.is_complete_manzil) {
      manzilPagesByJuz.set(
        row.juz_number,
        (manzilPagesByJuz.get(row.juz_number) ?? 0) + 1,
      );
    }

    if ((row.sabqi_ayat ?? 0) > 0) {
      sabqiPagesByJuz.set(
        row.juz_number,
        (sabqiPagesByJuz.get(row.juz_number) ?? 0) + 1,
      );
    }

    if ((row.sabak_ayat ?? 0) > 0) {
      sabakPagesByJuz.set(
        row.juz_number,
        (sabakPagesByJuz.get(row.juz_number) ?? 0) + 1,
      );
    }
  }

  return Array.from({ length: 30 }, (_, i) => {
    const juzNum = i + 1;
    const totalPages = JUZ_PAGE_COUNTS[juzNum] ?? 0;
    const startedPages = startedPagesByJuz.get(juzNum) ?? 0;
    const manzilPages = manzilPagesByJuz.get(juzNum) ?? 0;
    const sabqiPages = sabqiPagesByJuz.get(juzNum) ?? 0;
    const sabakPages = sabakPagesByJuz.get(juzNum) ?? 0;

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
  const [pageProgressResult, reviewDatesResult] = await Promise.all([
    supabaseServer
      .from("v_hifz_page_progress")
      .select("is_due, is_complete_manzil")
      .eq("user_id", userId),
    supabaseServer
      .from("review_log")
      .select("reviewed_at")
      .eq("user_id", userId)
      .eq("review_type", "ayah")
      .order("reviewed_at", { ascending: false })
      .limit(365),
  ]);

  if (pageProgressResult.error) {
    throw pageProgressResult.error;
  }
  if (reviewDatesResult.error) {
    throw reviewDatesResult.error;
  }

  const pageRows = (pageProgressResult.data ?? []) as Array<{
    is_complete_manzil: boolean | null;
    is_due: boolean | null;
  }>;
  const totalManzilPages = pageRows.filter((row) => row.is_complete_manzil).length;
  const dueTodayPages = pageRows.filter((row) => row.is_due).length;
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

export type PageGridStatus = "not-started" | "sabak" | "sabqi" | "manzil" | "due" | "overdue";

export interface PageGridEntry {
  page: number;
  juz: number;
  status: PageGridStatus;
  lastReviewedAt: string | null;
}

export async function getPageProgressGrid(userId: string): Promise<PageGridEntry[]> {
  const [progressResult, reviewResult] = await Promise.all([
    supabaseServer
      .from("v_hifz_page_progress")
      .select("page_number, juz_number, is_started, is_complete_manzil, is_due, sabak_ayat, sabqi_ayat")
      .eq("user_id", userId),
    supabaseServer.rpc("get_last_review_per_page", { p_user_id: userId }),
  ]);

  if (progressResult.error) throw progressResult.error;

  const rowMap = new Map<number, HifzPageProgressRow>();
  for (const row of (progressResult.data ?? []) as HifzPageProgressRow[]) {
    rowMap.set(row.page_number, row);
  }

  // Last review dates per page — gracefully handle missing RPC
  const lastReviewMap = new Map<number, string>();
  if (!reviewResult.error && reviewResult.data) {
    for (const row of reviewResult.data as Array<{ page_number: number; last_reviewed: string }>) {
      lastReviewMap.set(row.page_number, row.last_reviewed);
    }
  }

  return Array.from({ length: TOTAL_QURAN_PAGES }, (_, i) => {
    const page = i + 1;
    const row = rowMap.get(page);
    const juz = row?.juz_number ?? pageToJuz(page);
    const lastReviewedAt = lastReviewMap.get(page) ?? null;

    if (!row || !row.is_started) {
      return { page, juz, status: "not-started" as const, lastReviewedAt };
    }

    if (row.is_due) {
      return { page, juz, status: "due" as const, lastReviewedAt };
    }

    if (row.is_complete_manzil) {
      return { page, juz, status: "manzil" as const, lastReviewedAt };
    }

    if ((row.sabqi_ayat ?? 0) > 0) {
      return { page, juz, status: "sabqi" as const, lastReviewedAt };
    }

    if ((row.sabak_ayat ?? 0) > 0) {
      return { page, juz, status: "sabak" as const, lastReviewedAt };
    }

    return { page, juz, status: "not-started" as const, lastReviewedAt };
  });
}

export function emptyPageGrid(): PageGridEntry[] {
  return Array.from({ length: TOTAL_QURAN_PAGES }, (_, i) => {
    const page = i + 1;
    return { page, juz: pageToJuz(page), status: "not-started" as const, lastReviewedAt: null };
  });
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
