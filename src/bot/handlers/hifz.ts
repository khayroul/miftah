import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { USER_ID } from "../config.js";
import { buildDailyPlan, type DailyPlan } from "../services/scheduler.js";
import {
  getAyahById,
  getSurahById,
  getAyahWordsWithTranslations,
} from "../db/queries-bot.js";
import { supabaseAdmin } from "../supabase-admin.js";
import { blankAyah } from "../services/blanking.js";
import {
  formatAyah,
  formatBlankedAyah,
  buildBlankingKeyboard,
  buildSabakKeyboard,
} from "../services/formatter.js";
import type { Ayah, StudyProgress } from "@/types/database";

// Session state per chat
const planCache = new Map<number, DailyPlan>();
const blockIndex = new Map<string, number>();

export async function handleHifz(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const plan = await buildDailyPlan(USER_ID);
    planCache.set(chatId, plan);
    // Reset block indices
    blockIndex.delete(`${chatId}:sabqi`);
    blockIndex.delete(`${chatId}:sabak`);
    blockIndex.delete(`${chatId}:manzil`);

    const arg = ctx.message?.text?.split(" ")[1];
    if (arg && ["sabqi", "sabak", "manzil"].includes(arg)) {
      await startHifzBlock(ctx, arg as "sabqi" | "sabak" | "manzil");
      return;
    }

    // Show overview first
    const total =
      plan.sabqi.length + plan.sabak.length + plan.manzil.length;

    if (total === 0) {
      await ctx.reply(
        "Tiada ayat untuk ulangkaji hari ini. Tekan /hifz esok!",
      );
      return;
    }

    // Start with first available block
    if (plan.sabqi.length > 0) {
      await startHifzBlock(ctx, "sabqi");
    } else if (plan.sabak.length > 0) {
      await startHifzBlock(ctx, "sabak");
    } else {
      await startHifzBlock(ctx, "manzil");
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

  const items = plan[block];
  if (items.length === 0) {
    await advanceToNextBlock(ctx, block, plan);
    return;
  }

  if (block === "sabak") {
    // Show ALL sabak ayat as overview first, then individual rating
    await showSabakOverview(ctx, items);
  } else {
    // Sabqi/Manzil: show first item
    blockIndex.set(`${chatId}:${block}`, 0);
    await showNextHifzItem(ctx, block);
  }
}

/** Show all sabak ayat in one message batch for reading */
async function showSabakOverview(
  ctx: Context,
  items: StudyProgress[],
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Fetch all ayah details
  const ayahIds = items.map((i) => i.ayah_id);
  const { data: ayatRows } = await supabaseAdmin
    .from("ayat")
    .select("*, surahs!inner(name_transliteration)")
    .in("id", ayahIds)
    .order("id", { ascending: true });

  if (!ayatRows || ayatRows.length === 0) return;

  // Group by surah for cleaner display
  let text = `*SABAK — Hafalan Baru* (${items.length} ayat)\nBaca dan hafal semua ayat ini:\n\n`;
  let currentSurah = 0;

  for (const row of ayatRows) {
    if (row.surah_id !== currentSurah) {
      currentSurah = row.surah_id;
      text += `*${(row as any).surahs?.name_transliteration}*\n\n`;
    }
    const bm = row.display_bm ?? row.translation_en ?? "";
    text += `*${row.surah_id}:${row.ayah_number}*\n${row.text_uthmani}\n_${bm}_\n\n`;
  }

  // Split if too long
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }

  // Now show individual items for rating
  await ctx.reply(
    "Bila dah baca semua, tekan satu-satu untuk tandakan hafal:",
  );
  blockIndex.set(`${chatId}:sabak`, 0);
  await showNextHifzItem(ctx, "sabak");
}

/** Show the next item in a hifz block */
export async function showNextHifzItem(
  ctx: Context,
  block: "sabqi" | "sabak" | "manzil",
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const plan = planCache.get(chatId);
  if (!plan) return;

  const key = `${chatId}:${block}`;
  const idx = blockIndex.get(key) ?? 0;
  const items = plan[block];

  if (idx >= items.length) {
    blockIndex.delete(key);
    await ctx.reply(`✅ Blok ${block} selesai!`);
    await advanceToNextBlock(ctx, block, plan);
    return;
  }

  const progress = items[idx];
  blockIndex.set(key, idx + 1);

  const ayah = await getAyahById(progress.ayah_id);
  if (!ayah) return;

  const surah = await getSurahById(ayah.surah_id);
  const surahName = surah?.name_transliteration ?? "";
  const counter = `(${idx + 1}/${items.length})`;

  if (block === "sabqi") {
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
    const kb = buildBlankingKeyboard(ayah.id, 2);
    await ctx.reply(`*SABQI* ${counter}\n\n${text}`, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } else if (block === "sabak") {
    const text = formatAyah(ayah, surahName);
    const kb = buildSabakKeyboard(progress.id);
    await ctx.reply(`*SABAK* ${counter}\n\n${text}`, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } else {
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
    const kb = buildBlankingKeyboard(ayah.id, 3);
    await ctx.reply(`*MANZIL* ${counter}\n\n${text}`, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  }
}

async function advanceToNextBlock(
  ctx: Context,
  currentBlock: string,
  plan: DailyPlan,
): Promise<void> {
  if (currentBlock === "sabqi" && plan.sabak.length > 0) {
    await startHifzBlock(ctx, "sabak");
  } else if (
    (currentBlock === "sabqi" || currentBlock === "sabak") &&
    plan.manzil.length > 0
  ) {
    await startHifzBlock(ctx, "manzil");
  } else {
    await ctx.reply("🎉 Sesi hifz hari ini selesai! Alhamdulillah.");
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
