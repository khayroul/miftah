import type { Context } from "grammy";
import { USER_ID } from "../config.js";
import { buildDailyPlan } from "../services/scheduler.js";
import { formatDailyPlan, buildPlanKeyboard } from "../services/formatter.js";

export async function handleStart(ctx: Context): Promise<void> {
  try {
    const plan = await buildDailyPlan(USER_ID);
    const text = formatDailyPlan(plan);
    const total =
      plan.sabqi.length + plan.sabak.length + plan.manzil.length;

    if (total > 0) {
      await ctx.reply(text, {
        parse_mode: "Markdown",
        reply_markup: buildPlanKeyboard(),
      });
    } else {
      await ctx.reply(text, { parse_mode: "Markdown" });
    }
  } catch (err) {
    console.error("[start] Error:", err);
    await ctx.reply("Ralat membina pelan harian. Cuba lagi.");
  }
}
