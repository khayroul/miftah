import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { USER_ID } from "../config.js";
import { applyRating } from "@/shared/fsrs";
import type { FsrsRating, FsrsState } from "@/shared/types/database";
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
} from "../services/formatter.js";
import { showNextVocab } from "./vocab.js";
import { showNextHifzItem } from "./hifz.js";
import {
  handleQuizAnswerCallback,
  showNextQuizQuestion,
  startPageQuiz,
} from "./quiz.js";
import { showRandomPattern } from "./mutashabihat.js";
import {
  handleTranslationReviewDecision,
  showNextTranslationReview,
} from "./translation-review.js";

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  await ctx.answerCallbackQuery().catch(() => {});

  const parts = data.split(":");
  const action = parts[0];

  try {
    switch (action) {
      case "ra":
        await handleRateAyah(ctx, parseInt(parts[1]), parseInt(parts[2]) as FsrsRating, parts[3]);
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
      case "next_hifz":
        await showNextHifzItem(ctx, parts[1] as "sabqi" | "sabak" | "manzil");
        break;
      case "hifz_block":
        await handleHifzBlock(ctx, parts[1]);
        break;
      case "page_vocab":
        await handlePageVocab(ctx, parseInt(parts[1]));
        break;
      case "page_vocab_start":
        await handlePageVocabDrill(ctx, parseInt(parts[1]));
        break;
      case "page_nav":
        await handlePageNav(ctx, parseInt(parts[1]));
        break;
      case "page_theme_chunks":
        await handlePageThemeChunks(ctx, parseInt(parts[1]), parseThemeViewMode(parts[2]));
        break;
      case "theme_page_nav":
        await handleThemePageNav(ctx, parseInt(parts[1]), parseThemeViewMode(parts[2]));
        break;
      case "theme_mode":
        await handleThemeMode(ctx, parseInt(parts[1]), parseThemeViewMode(parts[2]));
        break;
      case "page_quiz":
        await startPageQuiz(ctx, parseInt(parts[1]));
        break;
      case "quiz_ans":
        await handleQuizAnswerCallback(ctx, parseInt(parts[1]));
        break;
      case "quiz_next":
        await showNextQuizQuestion(ctx);
        break;
      case "mut_next":
        await showRandomPattern(ctx);
        break;
      case "tr_dec":
        if ((parts[1] === "ok" || parts[1] === "flag") && parts[2]) {
          const ayahId = Number.parseInt(parts[2], 10);
          if (Number.isInteger(ayahId) && ayahId > 0) {
            await handleTranslationReviewDecision(ctx, parts[1], ayahId);
          }
        }
        break;
      case "tr_next":
        await showNextTranslationReview(ctx);
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
  block?: string,
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
  }

  const ratingLabels = ["", "Lupa", "Susah", "Baik", "Mudah"];
  const nextDue = new Date(newFields.due).toLocaleDateString("ms-MY");
  const msg = rating === 1 && progress.hifz_status === "manzil"
    ? `⚠️ ${ratingLabels[rating]} — dikembalikan ke Sabqi`
    : `✅ ${ratingLabels[rating]} — due: ${nextDue}`;

  // Auto-advance button
  const hifzBlock = block || progress.hifz_status;
  if (hifzBlock === "sabqi" || hifzBlock === "manzil") {
    const kb = new InlineKeyboard().text("Seterusnya →", `next_hifz:${hifzBlock}`);
    await ctx.reply(msg, { reply_markup: kb });
  } else {
    await ctx.reply(msg);
  }
}

// ── Rate vocab ──

async function handleRateVocab(
  ctx: Context,
  progressId: number,
  rating: FsrsRating,
): Promise<void> {
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
  const kb = new InlineKeyboard().text("Seterusnya →", "next_vocab");
  await ctx.reply(`✅ ${ratingLabels[rating]}`, { reply_markup: kb });
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

  const { supabaseAdmin } = await import("../supabase-admin.js");
  const { data: sp } = await supabaseAdmin
    .from("study_progress")
    .select("id, hifz_status")
    .eq("user_id", USER_ID)
    .eq("ayah_id", ayahId)
    .single();

  if (sp) {
    const block = sp.hifz_status === "sabqi" ? "sabqi" : sp.hifz_status === "manzil" ? "manzil" : undefined;
    const kb = buildRatingKeyboard("ra", sp.id, block);
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

  const kb = new InlineKeyboard().text("Seterusnya →", "next_hifz:sabak");
  await ctx.reply("✅ Dah hafal! Dipindahkan ke Sabqi.", { reply_markup: kb });
}

async function handleSabakStruggle(
  ctx: Context,
  progressId: number,
): Promise<void> {
  const progress = await getProgressById(progressId);
  if (!progress) return;

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

  const kb = new InlineKeyboard().text("Seterusnya →", "next_hifz:sabak");
  await ctx.reply("📖 Teruskan ulang. Kekal dalam Sabak.", { reply_markup: kb });
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
  const { getOrCreateVocabProgress } = await import("../db/vocab-progress.js");
  const vp = await getOrCreateVocabProgress(USER_ID, wordId);

  const text = formatVocabAnswer(word);
  const kb = buildRatingKeyboard("rv", vp.id);
  await ctx.reply(text, { reply_markup: kb });
}

// ── Hifz block navigation ──

async function handleHifzBlock(ctx: Context, block: string): Promise<void> {
  const { startHifzBlock } = await import("./hifz.js");
  await startHifzBlock(ctx, block as "sabqi" | "sabak" | "manzil");
}

// ── Page vocab ──

async function handlePageVocab(ctx: Context, pageNum: number): Promise<void> {
  const { supabaseAdmin } = await import("../supabase-admin.js");

  // Get ayat text for this page
  const { data: ayat } = await supabaseAdmin
    .from("ayat")
    .select("text_uthmani")
    .eq("page_number", pageNum);

  if (!ayat || ayat.length === 0) {
    await ctx.reply(`Tiada data untuk halaman ${pageNum}.`);
    return;
  }

  // Extract unique word tokens from ayah text
  const tokens = new Set<string>();
  for (const a of ayat) {
    for (const t of a.text_uthmani.split(/\s+/)) {
      if (t.length > 0) tokens.add(t);
    }
  }

  // Match tokens against words table
  const tokenArr = [...tokens];
  const { data: words } = await supabaseAdmin
    .from("words")
    .select("text_uthmani, translation_bm, frequency")
    .in("text_uthmani", tokenArr);

  if (!words || words.length === 0) {
    await ctx.reply(`Tiada vocab untuk halaman ${pageNum}.`);
    return;
  }

  // Build lookup from words table
  const wordMap = new Map<string, string>();
  for (const w of words) {
    if (!wordMap.has(w.text_uthmani)) {
      wordMap.set(w.text_uthmani, w.translation_bm ?? "—");
    }
  }

  // Show in order of appearance (preserve ayah order, deduplicate)
  const seen = new Set<string>();
  const ordered: Array<{ text: string; bm: string }> = [];
  for (const a of ayat) {
    for (const t of a.text_uthmani.split(/\s+/)) {
      if (t.length > 0 && !seen.has(t) && wordMap.has(t)) {
        seen.add(t);
        ordered.push({ text: t, bm: wordMap.get(t)! });
      }
    }
  }

  const RTL = "\u200F";
  let text = `📝 *Vocab Halaman ${pageNum}* — ${ordered.length} perkataan\n\n`;
  for (const w of ordered) {
    text += `${RTL}${w.text} — ${w.bm}\n`;
  }

  const { InlineKeyboard } = await import("grammy");
  const kb = new InlineKeyboard()
    .text("📝 Mula Latih", `page_vocab_start:${pageNum}`)
    .text("◀ Kembali", `page_nav:${pageNum}`);

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

// ── Page vocab drill (flashcard mode for page words) ──

async function handlePageVocabDrill(ctx: Context, pageNum: number): Promise<void> {
  const { supabaseAdmin } = await import("../supabase-admin.js");

  // Get ayat text for this page
  const { data: ayat } = await supabaseAdmin
    .from("ayat")
    .select("text_uthmani")
    .eq("page_number", pageNum);

  if (!ayat || ayat.length === 0) {
    await ctx.reply(`Tiada data untuk halaman ${pageNum}.`);
    return;
  }

  // Extract unique word tokens and match against words table
  const tokens = new Set<string>();
  for (const a of ayat) {
    for (const t of a.text_uthmani.split(/\s+/)) {
      if (t.length > 0) tokens.add(t);
    }
  }

  const { data: words } = await supabaseAdmin
    .from("words")
    .select("id, text_uthmani")
    .in("text_uthmani", [...tokens]);

  if (!words || words.length === 0) {
    await ctx.reply(`Tiada vocab untuk latihan halaman ${pageNum}.`);
    return;
  }

  // Build ordered word ID queue (order of appearance, deduplicated)
  const seen = new Set<string>();
  const queue: number[] = [];
  const wordLookup = new Map<string, number>(
    words.map((w) => [String(w.text_uthmani), Number(w.id)]),
  );

  for (const a of ayat) {
    for (const t of a.text_uthmani.split(/\s+/)) {
      if (t.length > 0 && !seen.has(t) && wordLookup.has(t)) {
        seen.add(t);
        queue.push(wordLookup.get(t)!);
      }
    }
  }

  // Create vocab progress for each word
  const { getOrCreateVocabProgress } = await import("../db/vocab-progress.js");
  for (const wid of queue) {
    await getOrCreateVocabProgress(USER_ID, wid);
  }

  // Set up vocab queue and start drill
  const { setVocabQueue } = await import("./vocab.js");
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  setVocabQueue(chatId, queue);
  await ctx.reply(`📝 Latihan vocab halaman ${pageNum}: ${queue.length} perkataan\n`);
  await showNextVocab(ctx);
}

// ── Page navigation ──

async function handlePageNav(ctx: Context, pageNum: number): Promise<void> {
  const { sendPageAndText } = await import("./page.js");
  await sendPageAndText(ctx, pageNum);
}

async function handlePageThemeChunks(
  ctx: Context,
  pageNum: number,
  mode: "summary" | "full",
): Promise<void> {
  const { sendThemeChunksByPage } = await import("./themes.js");
  await sendThemeChunksByPage(ctx, pageNum, mode);
}

async function handleThemePageNav(
  ctx: Context,
  pageNum: number,
  mode: "summary" | "full",
): Promise<void> {
  const { sendThemeChunksByPage } = await import("./themes.js");
  await sendThemeChunksByPage(ctx, pageNum, mode);
}

async function handleThemeMode(
  ctx: Context,
  pageNum: number,
  mode: "summary" | "full",
): Promise<void> {
  const { sendThemeChunksByPage } = await import("./themes.js");
  await sendThemeChunksByPage(ctx, pageNum, mode);
}

function parseThemeViewMode(value: string | undefined): "summary" | "full" {
  return value === "full" ? "full" : "summary";
}
