import { HIFZ_CONFIG, USER_ID } from "../config.js";
import {
  getByHifzStatus,
  getSabqiAyat,
  getManzilDue,
  createSabakBatch,
  promoteSabqiToManzil,
} from "../db/study-progress.js";
import { getNextSabakAyahIds } from "../db/queries-bot.js";
import type { StudyProgress } from "@/shared/types/database";

export interface DailyPlan {
  sabqi: StudyProgress[];
  sabak: StudyProgress[];
  manzil: StudyProgress[];
}

export async function buildDailyPlan(
  userId: string = USER_ID,
): Promise<DailyPlan> {
  // Phase 1: Auto-promote expired sabqi → manzil
  const promoted = await promoteSabqiToManzil(
    userId,
    HIFZ_CONFIG.sabqi_window_days,
  );
  if (promoted > 0) {
    console.log(`[scheduler] Promoted ${promoted} sabqi → manzil`);
  }

  // Phase 2: Collect due sabqi
  const sabqi = await getSabqiAyat(userId, HIFZ_CONFIG.sabqi_window_days);

  // Phase 3: Get or create sabak
  let sabak = await getByHifzStatus(userId, "sabak");
  if (sabak.length === 0) {
    const nextIds = await getNextSabakAyahIds(userId, HIFZ_CONFIG.sabak_size);
    if (nextIds.length > 0) {
      await createSabakBatch(userId, nextIds);
      sabak = await getByHifzStatus(userId, "sabak");
    }
  }

  // Phase 4: Collect due manzil
  const manzilLimit = HIFZ_CONFIG.manzil_daily_pages * 15;
  const manzil = await getManzilDue(userId, manzilLimit);

  return { sabqi, sabak, manzil };
}
