import type { Context } from "grammy";
import { USER_ID } from "../config.js";
import { getUserStats } from "../db/queries-bot.js";
import { formatStats } from "../services/formatter.js";

export async function handleStats(ctx: Context): Promise<void> {
  try {
    const stats = await getUserStats(USER_ID);
    await ctx.reply(formatStats(stats), { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[stats] Error:", err);
    await ctx.reply("Ralat mendapatkan statistik. Cuba lagi.");
  }
}
