import { supabaseServer } from "@/lib/supabase-server";

// Approximate ayat counts per juz (standard Quran division)
const JUZ_AYAT_COUNTS: Record<number, number> = {
  1: 148, 2: 111, 3: 126, 4: 176, 5: 124,
  6: 110, 7: 149, 8: 142, 9: 159, 10: 127,
  11: 151, 12: 170, 13: 154, 14: 227, 15: 185,
  16: 286, 17: 145, 18: 141, 19: 94,  20: 135,
  21: 107, 22: 115, 23: 93,  24: 75,  25: 43,
  26: 144, 27: 93,  28: 80,  29: 88,  30: 236,
};

export interface JuzStat {
  juz: number;
  totalAyat: number;
  manzilCount: number;
  sabqiCount: number;
  sabakCount: number;
  notStartedCount: number;
  manzilPct: number;
}

export interface HifzStats {
  totalManzil: number;
  dueTodayCount: number;
  streak: number;
}

export async function getJuzProgress(userId: string): Promise<JuzStat[]> {
  const { data, error } = await supabaseServer
    .from("v_juz_progress")
    .select("*")
    .eq("user_id", userId)
    .order("juz_number", { ascending: true });
  if (error) throw error;

  const byJuz = new Map<number, JuzStat>();
  for (const row of (data ?? []) as {
    juz_number: number;
    total_ayat: number;
    manzil_count: number;
    sabqi_count: number;
    sabak_count: number;
    not_started_count: number;
    manzil_pct: number;
  }[]) {
    byJuz.set(row.juz_number, {
      juz: row.juz_number,
      totalAyat: row.total_ayat,
      manzilCount: row.manzil_count,
      sabqiCount: row.sabqi_count,
      sabakCount: row.sabak_count,
      notStartedCount: row.not_started_count,
      manzilPct: row.manzil_pct,
    });
  }

  // Fill all 30 juz, including those with no progress yet
  return Array.from({ length: 30 }, (_, i) => {
    const juzNum = i + 1;
    return (
      byJuz.get(juzNum) ?? {
        juz: juzNum,
        totalAyat: JUZ_AYAT_COUNTS[juzNum] ?? 0,
        manzilCount: 0,
        sabqiCount: 0,
        sabakCount: 0,
        notStartedCount: JUZ_AYAT_COUNTS[juzNum] ?? 0,
        manzilPct: 0,
      }
    );
  });
}

export async function getHifzStats(userId: string): Promise<HifzStats> {
  const now = new Date().toISOString();

  const [manzilResult, dueResult, reviewDatesResult] = await Promise.all([
    supabaseServer
      .from("study_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("hifz_status", "manzil"),
    supabaseServer
      .from("study_progress")
      .select("id", { count: "exact", head: true })
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

  const totalManzil = manzilResult.count ?? 0;
  const dueTodayCount = dueResult.count ?? 0;
  const streak = calcStreak(
    (reviewDatesResult.data ?? []).map((r: { reviewed_at: string }) =>
      r.reviewed_at.slice(0, 10),
    ),
  );

  return { totalManzil, dueTodayCount, streak };
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
