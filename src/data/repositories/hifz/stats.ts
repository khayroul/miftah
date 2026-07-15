import { supabaseServer } from "@/data/supabase/server";
import { TOTAL_QURAN_PAGES, JUZ_PAGE_COUNTS, pageToJuz } from "@/features/hifz/domain/constants";
import type {
  HifzStats,
  JuzStat,
  PageGridEntry,
} from "@/features/hifz/domain/types";

interface HifzPageProgressRow {
  is_complete_manzil: boolean | null;
  is_due: boolean | null;
  is_started: boolean | null;
  juz_number: number;
  page_number: number;
  sabak_ayat: number | null;
  sabqi_ayat: number | null;
}

/** Superset of the view columns every consumer below needs — selected ONCE by
 * getHifzOverview so the (expensive, non-materialized) view is computed a
 * single time per page load instead of three. */
const PAGE_PROGRESS_COLUMNS =
  "page_number, juz_number, is_started, is_complete_manzil, is_due, sabak_ayat, sabqi_ayat";

// ---------------------------------------------------------------------------
// Pure derivations (exported for tests). Each existing query function below
// and the consolidated getHifzOverview share these — one source of truth.
// ---------------------------------------------------------------------------

export function deriveJuzProgress(rows: HifzPageProgressRow[]): JuzStat[] {
  const startedPagesByJuz = new Map<number, number>();
  const manzilPagesByJuz = new Map<number, number>();
  const sabqiPagesByJuz = new Map<number, number>();
  const sabakPagesByJuz = new Map<number, number>();

  for (const row of rows) {
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

    return {
      juz: juzNum,
      totalPages,
      manzilPages,
      sabqiPages,
      sabakPages,
      notStartedPages: Math.max(totalPages - startedPages, 0),
      manzilPagePct: totalPages > 0 ? (manzilPages / totalPages) * 100 : 0,
    };
  });
}

export function deriveHifzStats(
  rows: HifzPageProgressRow[],
  reviewDates: string[],
): HifzStats {
  const totalManzilPages = rows.filter((row) => row.is_complete_manzil).length;
  const dueTodayPages = rows.filter((row) => row.is_due).length;
  return {
    totalManzilPages,
    dueTodayPages,
    streak: calcStreak(reviewDates),
  };
}

export function derivePageGrid(
  rows: HifzPageProgressRow[],
  lastReviewByPage: ReadonlyMap<number, string>,
): PageGridEntry[] {
  const rowMap = new Map<number, HifzPageProgressRow>();
  for (const row of rows) {
    rowMap.set(row.page_number, row);
  }

  return Array.from({ length: TOTAL_QURAN_PAGES }, (_, i) => {
    const page = i + 1;
    const row = rowMap.get(page);
    const juz = row?.juz_number ?? pageToJuz(page);
    const lastReviewedAt = lastReviewByPage.get(page) ?? null;

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

// ---------------------------------------------------------------------------
// Consolidated overview — THE read path for /hifz.
// One view computation + two parallel side queries replace the previous
// eight round trips (hasAny 1 + stats 2 + juz 1 + grid 2, with the view
// recomputed three times). The view inner-joins study_progress, so zero rows
// ⇔ the user has no hifz progress at all.
// ---------------------------------------------------------------------------

export interface HifzOverview {
  hasProgress: boolean;
  stats: HifzStats;
  juzProgress: JuzStat[];
  pageGrid: PageGridEntry[];
}

export async function getHifzOverview(userId: string): Promise<HifzOverview> {
  const [viewResult, reviewDatesResult, lastReviewResult] = await Promise.all([
    supabaseServer
      .from("v_hifz_page_progress")
      .select(PAGE_PROGRESS_COLUMNS)
      .eq("user_id", userId),
    supabaseServer
      .from("review_log")
      .select("reviewed_at")
      .eq("user_id", userId)
      .eq("review_type", "ayah")
      .order("reviewed_at", { ascending: false })
      .limit(365),
    supabaseServer.rpc("get_last_review_per_page", { p_user_id: userId }),
  ]);

  if (viewResult.error) throw viewResult.error;
  if (reviewDatesResult.error) throw reviewDatesResult.error;

  const rows = (viewResult.data ?? []) as HifzPageProgressRow[];
  const reviewDates = (reviewDatesResult.data ?? []).map(
    (r: { reviewed_at: string }) => r.reviewed_at.slice(0, 10),
  );

  // Last review dates per page — gracefully handle missing RPC
  const lastReviewByPage = new Map<number, string>();
  if (!lastReviewResult.error && lastReviewResult.data) {
    for (const row of lastReviewResult.data as Array<{
      page_number: number;
      last_reviewed: string;
    }>) {
      lastReviewByPage.set(row.page_number, row.last_reviewed);
    }
  }

  return {
    hasProgress: rows.length > 0,
    stats: deriveHifzStats(rows, reviewDates),
    juzProgress: deriveJuzProgress(rows),
    pageGrid: derivePageGrid(rows, lastReviewByPage),
  };
}

// ---------------------------------------------------------------------------
// Standalone query functions — kept for existing callers (dashboard-preview,
// api/hifz/import-memorized, home dashboard). Same signatures and behavior,
// now delegating to the shared derivations.
// ---------------------------------------------------------------------------

export async function getJuzProgress(userId: string): Promise<JuzStat[]> {
  const { data, error } = await supabaseServer
    .from("v_hifz_page_progress")
    .select(PAGE_PROGRESS_COLUMNS)
    .eq("user_id", userId);
  if (error) throw error;

  return deriveJuzProgress((data ?? []) as HifzPageProgressRow[]);
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

  return deriveHifzStats(
    (pageProgressResult.data ?? []) as HifzPageProgressRow[],
    (reviewDatesResult.data ?? []).map((r: { reviewed_at: string }) =>
      r.reviewed_at.slice(0, 10),
    ),
  );
}

export async function getPageProgressGrid(userId: string): Promise<PageGridEntry[]> {
  const [progressResult, reviewResult] = await Promise.all([
    supabaseServer
      .from("v_hifz_page_progress")
      .select(PAGE_PROGRESS_COLUMNS)
      .eq("user_id", userId),
    supabaseServer.rpc("get_last_review_per_page", { p_user_id: userId }),
  ]);

  if (progressResult.error) throw progressResult.error;

  const lastReviewByPage = new Map<number, string>();
  if (!reviewResult.error && reviewResult.data) {
    for (const row of reviewResult.data as Array<{ page_number: number; last_reviewed: string }>) {
      lastReviewByPage.set(row.page_number, row.last_reviewed);
    }
  }

  return derivePageGrid(
    (progressResult.data ?? []) as HifzPageProgressRow[],
    lastReviewByPage,
  );
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
