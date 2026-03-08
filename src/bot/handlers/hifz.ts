import type { Context } from "grammy";
import { USER_ID } from "../config.js";
import { buildDailyPlan, type DailyPlan } from "../services/scheduler.js";
import {
  getAyahById,
  getSurahById,
  getAyahWordsWithTranslations,
} from "../db/queries-bot.js";
import { blankAyah } from "../services/blanking.js";
import {
  formatAyah,
  formatBlankedAyah,
  buildBlankingKeyboard,
  buildRatingKeyboard,
  buildSabakKeyboard,
} from "../services/formatter.js";

// Cache the current plan per chat
const planCache = new Map<number, DailyPlan>();
const blockIndex = new Map<string, number>();

export async function handleHifz(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const plan = await buildDailyPlan(USER_ID);
    planCache.set(chatId, plan);

    // Check if user specified a block
    const arg = ctx.message?.text?.split(" ")[1];
    if (arg && ["sabqi", "sabak", "manzil"].includes(arg)) {
      await startHifzBlock(ctx, arg as "sabqi" | "sabak" | "manzil");
      return;
    }

    // Default: start with sabqi if available, then sabak, then manzil
    if (plan.sabqi.length > 0) {
      await ctx.reply(
        `*SABQI — Ulangkaji Baru*\n${plan.sabqi.length} ayat untuk ulangkaji\n`,
        { parse_mode: "Markdown" },
      );
      await startHifzBlock(ctx, "sabqi");
    } else if (plan.sabak.length > 0) {
      await startHifzBlock(ctx, "sabak");
    } else if (plan.manzil.length > 0) {
      await startHifzBlock(ctx, "manzil");
    } else {
      await ctx.reply(
        "Tiada ayat untuk ulangkaji hari ini. Tekan /hifz esok!",
      );
    }
  } catch (err) {
    console.error("[hifz] Error:", err);
    await ctx.reply("Ralat memulakan sesi hifz. Cuba lagi.");
  }
}

export async function startHifzBlock(
  ctx: Context,
  block: "sabqi" | "sabak" | "manzil",
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  let plan = planCache.get(chatId);
  if (!plan) {
    plan = await buildDailyPlan(USER_ID);
    planCache.set(chatId, plan);
  }

  const key = `${chatId}:${block}`;
  const idx = blockIndex.get(key) ?? 0;
  const items = plan[block];

  if (idx >= items.length) {
    blockIndex.delete(key);
    await ctx.reply(`✅ Blok ${block} selesai!`);

    // Auto-advance to next block
    if (block === "sabqi" && plan.sabak.length > 0) {
      await ctx.reply("*Seterusnya: SABAK — Hafalan Baru*", {
        parse_mode: "Markdown",
      });
      await startHifzBlock(ctx, "sabak");
    } else if (block === "sabak" && plan.manzil.length > 0) {
      await ctx.reply("*Seterusnya: MANZIL — Ulangkaji Lama*", {
        parse_mode: "Markdown",
      });
      await startHifzBlock(ctx, "manzil");
    } else {
      await ctx.reply("🎉 Sesi hifz hari ini selesai! Alhamdulillah.");
    }
    return;
  }

  const progress = items[idx];
  blockIndex.set(key, idx + 1);

  const ayah = await getAyahById(progress.ayah_id);
  if (!ayah) return;

  const surah = await getSurahById(ayah.surah_id);
  const surahName = surah?.name_transliteration ?? "";

  if (block === "sabqi") {
    // Show blanked at level 2
    const words = await getAyahWordsWithTranslations(ayah.id);
    const blanked = blankAyah(
      words.map((w) => ({ position: w.position, textUthmani: w.textUthmani })),
      2,
      ayah.id,
    );
    const text = formatBlankedAyah(
      blanked.display,
      surahName,
      ayah.surah_id,
      ayah.ayah_number,
      2,
    );
    const header = `*SABQI* (${idx + 1}/${items.length})\n\n`;
    const kb = buildBlankingKeyboard(ayah.id, 2);
    await ctx.reply(header + text, { parse_mode: "Markdown", reply_markup: kb });
  } else if (block === "sabak") {
    // Show full text + translation for learning
    const text = formatAyah(ayah, surahName);
    const header = `*SABAK* (${idx + 1}/${items.length})\nBaca dan ulang:\n\n`;
    const kb = buildSabakKeyboard(progress.id);
    await ctx.reply(header + text, { parse_mode: "Markdown", reply_markup: kb });
  } else {
    // Manzil: show blanked at level 3
    const words = await getAyahWordsWithTranslations(ayah.id);
    const blanked = blankAyah(
      words.map((w) => ({ position: w.position, textUthmani: w.textUthmani })),
      3,
      ayah.id,
    );
    const text = formatBlankedAyah(
      blanked.display,
      surahName,
      ayah.surah_id,
      ayah.ayah_number,
      3,
    );
    const header = `*MANZIL* (${idx + 1}/${items.length})\n\n`;
    const kb = buildBlankingKeyboard(ayah.id, 3);
    await ctx.reply(header + text, { parse_mode: "Markdown", reply_markup: kb });
  }
}
