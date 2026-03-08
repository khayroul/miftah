import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { USER_ID } from "../config.js";
import {
  getDueVocabWithDetails,
  getNewVocabByFrequency,
} from "../db/queries-bot.js";
import { getOrCreateVocabProgress } from "../db/vocab-progress.js";
import { formatVocabQuestion } from "../services/formatter.js";

// Simple session state: current vocab queue per chat
const vocabQueues = new Map<number, number[]>();

export async function handleVocab(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const countArg = ctx.message?.text?.split(" ")[1];
    const count = Math.min(parseInt(countArg ?? "10") || 10, 50);

    // Get due vocab first, then fill with new high-frequency words
    const dueVocab = await getDueVocabWithDetails(USER_ID, count);
    const queue: number[] = dueVocab.map((v) => v.word.id);

    // Fill remaining slots with new words
    if (queue.length < count) {
      const newWords = await getNewVocabByFrequency(
        USER_ID,
        count - queue.length,
      );
      for (const w of newWords) {
        // Create progress row for new words
        await getOrCreateVocabProgress(USER_ID, w.id);
        queue.push(w.id);
      }
    }

    if (queue.length === 0) {
      await ctx.reply("Tiada vocab untuk ulangkaji. Semua sudah dikuasai!");
      return;
    }

    vocabQueues.set(chatId, queue);
    await ctx.reply(`📝 Sesi vocab: ${queue.length} perkataan\n`);
    await showNextVocab(ctx);
  } catch (err) {
    console.error("[vocab] Error:", err);
    await ctx.reply("Ralat memulakan sesi vocab. Cuba lagi.");
  }
}

export async function showNextVocab(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const queue = vocabQueues.get(chatId);
  if (!queue || queue.length === 0) {
    await ctx.reply("✅ Sesi vocab selesai!");
    vocabQueues.delete(chatId);
    return;
  }

  const wordId = queue.shift()!;

  // Fetch word
  const { supabaseAdmin } = await import("../supabase-admin.js");
  const { data: word } = await supabaseAdmin
    .from("words")
    .select("*")
    .eq("id", wordId)
    .single();

  if (!word) {
    await showNextVocab(ctx);
    return;
  }

  const remaining = queue.length;
  const text = `${formatVocabQuestion(word)}\n\n_Baki: ${remaining}_`;
  const kb = new InlineKeyboard().text(
    "Tunjuk Jawapan",
    `vocab_reveal:${wordId}`,
  );

  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
}
