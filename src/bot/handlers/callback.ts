import type { Context } from "grammy";
import { USER_ID } from "../config.js";
import { applyRating } from "@/lib/fsrs";
import type { FsrsRating, FsrsState } from "@/types/database";
import { dbRowToCard, cardToDbRow } from "../services/fsrs-bridge.js";
import {
  getProgressById,
  updateFsrsFields,
  updateHifzStatus,
  demoteManzilToSabqi,
} from "../db/study-progress.js";
import { updateVocabFsrs } from "../db/vocab-progress.js";
import { logReview } from "../db/review-log.js";
import {
  getAyahById,
  getSurahById,
  getAyahWordsWithTranslations,
} from "../db/queries-bot.js";
import { formatAyah, buildRatingKeyboard } from "../services/formatter.js";
import { blankAyah, type BlankingLevel } from "../services/blanking.js";
import {
  formatBlankedAyah,
  buildBlankingKeyboard,
  buildSabakKeyboard,
} from "../services/formatter.js";
import { showNextVocab } from "./vocab.js";

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  await ctx.answerCallbackQuery();

  const parts = data.split(":");
  const action = parts[0];

  try {
    switch (action) {
      case "ra":
        await handleRateAyah(ctx, parseInt(parts[1]), parseInt(parts[2]) as FsrsRating);
        break;
      case "rv":
        await handleRateVocab(ctx, parseInt(parts[1]), parseInt(parts[2]) as FsrsRating);
        break;
      case "bl":
        await handleBlanking(ctx, parseInt(parts[1]), parseInt(parts[2]) as BlankingLevel);
        break;
      case "reveal":
        await handleReveal(ctx, parseInt(parts[1]));
        break;
      case "sabak_done":
        await handleSabakDone(ctx, parseInt(parts[1]));
        break;
      case "sabak_struggle":
        await handleSabakStruggle(ctx, parseInt(parts[1]));
        break;
      case "vocab_reveal":
        await handleVocabReveal(ctx, parseInt(parts[1]));
        break;
      case "next_vocab":
        await showNextVocab(ctx);
        break;
      case "hifz_block":
        await handleHifzBlock(ctx, parts[1]);
        break;
      default:
        console.log(`[callback] Unknown action: ${action}`);
    }
  } catch (err) {
    console.error(`[callback] Error handling ${action}:`, err);
    await ctx.reply("Ralat berlaku. Cuba lagi.");
  }
}

// ── Rate ayah (Sabqi/Manzil review) ──

async function handleRateAyah(
  ctx: Context,
  progressId: number,
  rating: FsrsRating,
): Promise<void> {
  const progress = await getProgressById(progressId);
  if (!progress) return;

  const card = dbRowToCard(progress);
  const stateBefore = progress.state as FsrsState;
  const result = applyRating(card, rating);
  const newFields = cardToDbRow(result.card);

  await updateFsrsFields(progressId, newFields);

  await logReview({
    userId: USER_ID,
    reviewType: "ayah",
    itemId: progress.ayah_id,
    rating,
    stateBefore,
    stateAfter: newFields.state,
    elapsedDays: result.card.elapsed_days,
    scheduledDays: result.card.scheduled_days,
  });

  // Manzil rated Again → demote to sabqi
  if (progress.hifz_status === "manzil" && rating === 1) {
    await demoteManzilToSabqi(progressId, new Date());
    await ctx.reply("⚠️ Ayat ini dikembalikan ke Sabqi untuk ulangkaji semula.");
  }

  const ratingLabels = ["", "Lupa", "Susah", "Baik", "Mudah"];
  const nextDue = new Date(newFields.due).toLocaleDateString("ms-MY");
  await ctx.reply(`✅ ${ratingLabels[rating]} — seterusnya due: ${nextDue}`);
}

// ── Rate vocab ──

async function handleRateVocab(
  ctx: Context,
  progressId: number,
  rating: FsrsRating,
): Promise<void> {
  // We store vocab progress id in the callback, but we need the full row
  // For simplicity, look it up via supabase
  const { supabaseAdmin } = await import("../supabase-admin.js");
  const { data: progress } = await supabaseAdmin
    .from("vocab_progress")
    .select("*")
    .eq("id", progressId)
    .single();
  if (!progress) return;

  const card = dbRowToCard(progress);
  const stateBefore = progress.state as FsrsState;
  const result = applyRating(card, rating);
  const newFields = cardToDbRow(result.card);

  await updateVocabFsrs(progressId, newFields);

  await logReview({
    userId: USER_ID,
    reviewType: "vocab",
    itemId: progress.word_id,
    rating,
    stateBefore,
    stateAfter: newFields.state,
    elapsedDays: result.card.elapsed_days,
    scheduledDays: result.card.scheduled_days,
  });

  const ratingLabels = ["", "Lupa", "Susah", "Baik", "Mudah"];
  await ctx.reply(`✅ ${ratingLabels[rating]}`);

  // Show next vocab card
  await showNextVocab(ctx);
}

// ── Blanking ──

async function handleBlanking(
  ctx: Context,
  ayahId: number,
  level: BlankingLevel,
): Promise<void> {
  const ayah = await getAyahById(ayahId);
  if (!ayah) return;

  const surah = await getSurahById(ayah.surah_id);
  const words = await getAyahWordsWithTranslations(ayahId);

  const blanked = blankAyah(
    words.map((w) => ({ position: w.position, textUthmani: w.textUthmani })),
    level,
    ayahId,
  );

  const text = formatBlankedAyah(
    blanked.display,
    surah?.name_transliteration ?? "",
    ayah.surah_id,
    ayah.ayah_number,
    level,
  );

  const kb = buildBlankingKeyboard(ayahId, level);
  await ctx.reply(text, { reply_markup: kb });
}

// ── Reveal full ayah ──

async function handleReveal(ctx: Context, ayahId: number): Promise<void> {
  const ayah = await getAyahById(ayahId);
  if (!ayah) return;

  const surah = await getSurahById(ayah.surah_id);
  const text = formatAyah(ayah, surah?.name_transliteration ?? "");

  // Find the study_progress for rating
  const { supabaseAdmin } = await import("../supabase-admin.js");
  const { data: sp } = await supabaseAdmin
    .from("study_progress")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("ayah_id", ayahId)
    .single();

  if (sp) {
    const kb = buildRatingKeyboard("ra", sp.id);
    await ctx.reply(text, { reply_markup: kb });
  } else {
    await ctx.reply(text);
  }
}

// ── Sabak done / struggle ──

async function handleSabakDone(
  ctx: Context,
  progressId: number,
): Promise<void> {
  const progress = await getProgressById(progressId);
  if (!progress) return;

  // Apply first rating as Good (3) and move to sabqi
  const card = dbRowToCard(progress);
  const result = applyRating(card, 3);
  const newFields = cardToDbRow(result.card);

  await updateFsrsFields(progressId, newFields);
  await updateHifzStatus(progressId, "sabqi", new Date());

  await logReview({
    userId: USER_ID,
    reviewType: "ayah",
    itemId: progress.ayah_id,
    rating: 3,
    stateBefore: progress.state as FsrsState,
    stateAfter: newFields.state,
    elapsedDays: result.card.elapsed_days,
    scheduledDays: result.card.scheduled_days,
  });

  await ctx.reply("✅ Dah hafal! Ayat dipindahkan ke Sabqi.");
}

async function handleSabakStruggle(
  ctx: Context,
  progressId: number,
): Promise<void> {
  const progress = await getProgressById(progressId);
  if (!progress) return;

  // Rate as Again (1) but keep in sabak
  const card = dbRowToCard(progress);
  const result = applyRating(card, 1);
  await updateFsrsFields(progressId, cardToDbRow(result.card));

  await logReview({
    userId: USER_ID,
    reviewType: "ayah",
    itemId: progress.ayah_id,
    rating: 1,
    stateBefore: progress.state as FsrsState,
    stateAfter: result.card.state as FsrsState,
    elapsedDays: result.card.elapsed_days,
    scheduledDays: result.card.scheduled_days,
  });

  await ctx.reply("📖 Teruskan ulang. Ayat kekal dalam Sabak.");
}

// ── Vocab reveal ──

async function handleVocabReveal(
  ctx: Context,
  wordId: number,
): Promise<void> {
  const { supabaseAdmin } = await import("../supabase-admin.js");
  const { data: word } = await supabaseAdmin
    .from("words")
    .select("*")
    .eq("id", wordId)
    .single();
  if (!word) return;

  const { formatVocabAnswer } = await import("../services/formatter.js");

  // Get or create vocab progress for rating buttons
  const { getOrCreateVocabProgress } = await import("../db/vocab-progress.js");
  const vp = await getOrCreateVocabProgress(USER_ID, wordId);

  const text = formatVocabAnswer(word);
  const kb = buildRatingKeyboard("rv", vp.id);
  await ctx.reply(text, { reply_markup: kb });
}

// ── Hifz block navigation ──

async function handleHifzBlock(ctx: Context, block: string): Promise<void> {
  // Delegate to the hifz handler
  const { startHifzBlock } = await import("./hifz.js");
  await startHifzBlock(ctx, block as "sabqi" | "sabak" | "manzil");
}
