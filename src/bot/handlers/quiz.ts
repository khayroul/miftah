import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { USER_ID } from "../config.js";
import { supabaseAdmin } from "../supabase-admin.js";
import { getDueVocabWithDetails, getNewVocabByFrequency } from "../db/queries-bot.js";
import { getOrCreateVocabProgress, updateVocabFsrs } from "../db/vocab-progress.js";
import { logReview } from "../db/review-log.js";
import { applyRating } from "@/lib/fsrs";
import { cardToDbRow, dbRowToCard } from "../services/fsrs-bridge.js";
import type { FsrsRating, FsrsState, VocabProgress } from "@/types/database";

const DEFAULT_QUIZ_COUNT = 10;
const MAX_QUIZ_COUNT = 30;
const MIN_DISTRACTORS = 3;
const QUIZ_PREFIX = "quiz_ans";

interface QuizSession {
  queue: number[];
  total: number;
  answered: number;
  correct: number;
  sourceLabel: string;
  current: QuizQuestionState | null;
}

interface QuizQuestionState {
  wordId: number;
  wordText: string;
  correctMeaning: string;
  options: string[];
  correctIndex: number;
  progressId: number;
}

interface QuizWordRow {
  id: number;
  text_uthmani: string;
  translation_bm: string | null;
  translation_en: string | null;
  frequency: number;
}

interface AyahTextRow {
  text_uthmani: string;
}

type QuizMode = "mixed" | "page" | "surah";

interface QuizRequest {
  mode: QuizMode;
  count: number;
  page?: number;
  surah?: number;
}

const quizSessions = new Map<number, QuizSession>();

function toInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function clampCount(value: number | null): number {
  if (!value || value < 1) {
    return DEFAULT_QUIZ_COUNT;
  }
  return Math.min(value, MAX_QUIZ_COUNT);
}

function parseQuizRequest(tokens: string[]): QuizRequest | null {
  if (tokens.length === 0) {
    return { mode: "mixed", count: DEFAULT_QUIZ_COUNT };
  }

  const mode = tokens[0]?.toLowerCase();
  if (mode === "page") {
    const page = toInt(tokens[1]);
    if (!page || page < 1 || page > 604) {
      return null;
    }
    return {
      mode: "page",
      page,
      count: clampCount(toInt(tokens[2])),
    };
  }

  if (mode === "surah") {
    const surah = toInt(tokens[1]);
    if (!surah || surah < 1 || surah > 114) {
      return null;
    }
    return {
      mode: "surah",
      surah,
      count: clampCount(toInt(tokens[2])),
    };
  }

  return {
    mode: "mixed",
    count: clampCount(toInt(tokens[0])),
  };
}

function usageMessage(): string {
  return [
    "Guna:",
    "/quiz",
    "/quiz <bilangan_soalan>",
    "/quiz page <1-604> [bilangan_soalan]",
    "/quiz surah <1-114> [bilangan_soalan]",
  ].join("\n");
}

function normalizeMeaning(word: QuizWordRow): string | null {
  const bm = word.translation_bm?.trim();
  if (bm) {
    return bm;
  }
  const en = word.translation_en?.trim();
  return en && en.length > 0 ? en : null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function truncateForButton(text: string, maxLen = 50): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 1)}…`;
}

async function fetchWordById(wordId: number): Promise<QuizWordRow | null> {
  const { data, error } = await supabaseAdmin
    .from("words")
    .select("id, text_uthmani, translation_bm, translation_en, frequency")
    .eq("id", wordId)
    .single();
  if (error) {
    throw error;
  }
  return (data ?? null) as QuizWordRow | null;
}

async function getMixedQueue(count: number): Promise<number[]> {
  const dueVocab = await getDueVocabWithDetails(USER_ID, count);
  const queue = dueVocab.map((v) => v.word.id);

  if (queue.length < count) {
    const newWords = await getNewVocabByFrequency(USER_ID, count - queue.length);
    for (const word of newWords) {
      if (!queue.includes(word.id)) {
        queue.push(word.id);
      }
    }
  }

  return queue.slice(0, count);
}

async function getQueueFromAyatRows(
  rows: AyahTextRow[],
  count: number,
): Promise<number[]> {
  const orderedTokens: string[] = [];
  const seenToken = new Set<string>();

  for (const row of rows) {
    for (const token of row.text_uthmani.split(/\s+/)) {
      if (!token || seenToken.has(token)) {
        continue;
      }
      seenToken.add(token);
      orderedTokens.push(token);
    }
  }

  if (orderedTokens.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("words")
    .select("id, text_uthmani")
    .in("text_uthmani", orderedTokens);
  if (error) {
    throw error;
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const text = String(row.text_uthmani);
    if (!map.has(text)) {
      map.set(text, Number(row.id));
    }
  }

  const orderedWordIds: number[] = [];
  for (const token of orderedTokens) {
    const id = map.get(token);
    if (!id || orderedWordIds.includes(id)) {
      continue;
    }
    orderedWordIds.push(id);
    if (orderedWordIds.length >= count) {
      break;
    }
  }
  return orderedWordIds;
}

async function getPageQueue(page: number, count: number): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("ayat")
    .select("text_uthmani")
    .eq("page_number", page)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });
  if (error) {
    throw error;
  }
  return getQueueFromAyatRows((data ?? []) as AyahTextRow[], count);
}

async function getSurahQueue(surah: number, count: number): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("ayat")
    .select("text_uthmani")
    .eq("surah_id", surah)
    .order("ayah_number", { ascending: true });
  if (error) {
    throw error;
  }
  return getQueueFromAyatRows((data ?? []) as AyahTextRow[], count);
}

async function ensureProgressRows(wordIds: number[]): Promise<void> {
  for (const wordId of wordIds) {
    await getOrCreateVocabProgress(USER_ID, wordId);
  }
}

async function getDistractors(
  excludeWordId: number,
  correctMeaning: string,
  count: number,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("words")
    .select("id, translation_bm")
    .neq("id", excludeWordId)
    .not("translation_bm", "is", null)
    .order("frequency", { ascending: false })
    .limit(500);
  if (error) {
    throw error;
  }

  const seen = new Set<string>([correctMeaning]);
  const candidates: string[] = [];
  for (const row of data ?? []) {
    const bm = String(row.translation_bm ?? "").trim();
    if (!bm || seen.has(bm)) {
      continue;
    }
    seen.add(bm);
    candidates.push(bm);
  }

  return shuffle(candidates).slice(0, count);
}

function buildAnswerKeyboard(options: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < options.length; i += 1) {
    const label = `${String.fromCharCode(65 + i)}. ${truncateForButton(options[i])}`;
    kb.text(label, `${QUIZ_PREFIX}:${i}`).row();
  }
  return kb;
}

function sourceLabelForRequest(req: QuizRequest): string {
  if (req.mode === "page") {
    return `Halaman ${req.page}`;
  }
  if (req.mode === "surah") {
    return `Surah ${req.surah}`;
  }
  return "Campuran";
}

async function buildQueue(req: QuizRequest): Promise<number[]> {
  if (req.mode === "page" && req.page) {
    return getPageQueue(req.page, req.count);
  }
  if (req.mode === "surah" && req.surah) {
    return getSurahQueue(req.surah, req.count);
  }
  return getMixedQueue(req.count);
}

function formatProgress(session: QuizSession): string {
  const pct = session.answered > 0
    ? Math.round((session.correct / session.answered) * 100)
    : 0;
  return `Skor: ${session.correct}/${session.answered} (${pct}%)`;
}

export async function handleQuiz(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  try {
    const args = ctx.message?.text?.trim().split(/\s+/).slice(1) ?? [];
    const req = parseQuizRequest(args);
    if (!req) {
      await ctx.reply(usageMessage());
      return;
    }

    const queue = await buildQueue(req);
    if (queue.length === 0) {
      await ctx.reply("Tiada data vocab untuk quiz ini.");
      return;
    }

    await ensureProgressRows(queue);
    const sourceLabel = sourceLabelForRequest(req);
    quizSessions.set(chatId, {
      queue: [...queue],
      total: queue.length,
      answered: 0,
      correct: 0,
      sourceLabel,
      current: null,
    });

    await ctx.reply(`🧠 Quiz bermula (${sourceLabel}) — ${queue.length} soalan`);
    await showNextQuizQuestion(ctx);
  } catch (err) {
    console.error("[quiz] Error:", err);
    await ctx.reply("Ralat memulakan quiz. Cuba lagi.");
  }
}

export async function startPageQuiz(
  ctx: Context,
  pageNum: number,
  count = DEFAULT_QUIZ_COUNT,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  try {
    const queue = await getPageQueue(pageNum, clampCount(count));
    if (queue.length === 0) {
      await ctx.reply(`Tiada vocab untuk quiz halaman ${pageNum}.`);
      return;
    }

    await ensureProgressRows(queue);
    quizSessions.set(chatId, {
      queue: [...queue],
      total: queue.length,
      answered: 0,
      correct: 0,
      sourceLabel: `Halaman ${pageNum}`,
      current: null,
    });

    await ctx.reply(`🧠 Quiz halaman ${pageNum} — ${queue.length} soalan`);
    await showNextQuizQuestion(ctx);
  } catch (err) {
    console.error("[quiz] page Error:", err);
    await ctx.reply("Ralat memulakan quiz halaman. Cuba lagi.");
  }
}

export async function showNextQuizQuestion(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const session = quizSessions.get(chatId);
  if (!session) {
    await ctx.reply("Sesi quiz tiada. Guna /quiz untuk mula.");
    return;
  }

  while (session.queue.length > 0) {
    const wordId = session.queue.shift()!;
    const word = await fetchWordById(wordId);
    if (!word) {
      session.total = Math.max(0, session.total - 1);
      continue;
    }

    const correctMeaning = normalizeMeaning(word);
    if (!correctMeaning) {
      session.total = Math.max(0, session.total - 1);
      continue;
    }

    const distractors = await getDistractors(word.id, correctMeaning, MIN_DISTRACTORS);
    if (distractors.length < MIN_DISTRACTORS) {
      session.total = Math.max(0, session.total - 1);
      continue;
    }

    const options = shuffle([correctMeaning, ...distractors]).slice(0, 4);
    const correctIndex = options.findIndex((opt) => opt === correctMeaning);
    if (correctIndex < 0) {
      continue;
    }

    const vocabProgress = await getOrCreateVocabProgress(USER_ID, word.id);
    session.current = {
      wordId: word.id,
      wordText: word.text_uthmani,
      correctMeaning,
      options,
      correctIndex,
      progressId: vocabProgress.id,
    };

    const questionNo = session.answered + 1;
    const text = [
      `🧠 Quiz Vocab (${session.sourceLabel})`,
      "",
      `Soalan ${questionNo}/${session.total}`,
      "",
      word.text_uthmani,
      "",
      "Apakah maksud BM paling tepat?",
    ].join("\n");

    await ctx.reply(text, {
      reply_markup: buildAnswerKeyboard(options),
    });
    return;
  }

  quizSessions.delete(chatId);
  if (session.total === 0) {
    await ctx.reply(
      `Quiz (${session.sourceLabel}) tiada item yang cukup lengkap untuk MCQ sekarang.`,
    );
    return;
  }
  await ctx.reply(
    `🏁 Quiz selesai (${session.sourceLabel})\n${formatProgress(session)}\n\nGuna /quiz untuk sesi baru.`,
  );
}

export async function handleQuizAnswerCallback(
  ctx: Context,
  answerIndex: number,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const session = quizSessions.get(chatId);
  if (!session || !session.current) {
    await ctx.reply("Soalan ini sudah tamat. Tekan 'Seterusnya' atau guna /quiz.");
    return;
  }

  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    await ctx.reply("Jawapan tidak sah.");
    return;
  }

  const current = session.current;
  session.current = null;

  const isCorrect = answerIndex === current.correctIndex;
  const rating: FsrsRating = isCorrect ? 3 : 1;

  try {
    const { data, error } = await supabaseAdmin
      .from("vocab_progress")
      .select("*")
      .eq("id", current.progressId)
      .single();
    if (error) {
      throw error;
    }
    const progress = data as VocabProgress;
    const card = dbRowToCard(progress);
    const stateBefore = progress.state as FsrsState;
    const result = applyRating(card, rating);
    const newFields = cardToDbRow(result.card);

    await updateVocabFsrs(progress.id, newFields);
    await logReview({
      userId: USER_ID,
      reviewType: "vocab",
      itemId: current.wordId,
      rating,
      stateBefore,
      stateAfter: newFields.state,
      elapsedDays: result.card.elapsed_days,
      scheduledDays: result.card.scheduled_days,
    });
  } catch (err) {
    console.error("[quiz] update FSRS Error:", err);
  }

  session.answered += 1;
  if (isCorrect) {
    session.correct += 1;
  }

  const answerLabel = String.fromCharCode(65 + answerIndex);
  const correctLabel = String.fromCharCode(65 + current.correctIndex);
  const feedback = [
    isCorrect ? "✅ Betul" : "❌ Kurang tepat",
    `Perkataan: ${current.wordText}`,
    `Jawapan anda: ${answerLabel}. ${current.options[answerIndex]}`,
    `Jawapan betul: ${correctLabel}. ${current.correctMeaning}`,
    formatProgress(session),
  ].join("\n");

  const finished = session.answered >= session.total || session.queue.length === 0;
  if (finished) {
    quizSessions.delete(chatId);
    await ctx.reply(`${feedback}\n\n🏁 Quiz selesai.`);
    return;
  }

  const kb = new InlineKeyboard().text("Seterusnya →", "quiz_next");
  await ctx.reply(feedback, { reply_markup: kb });
}
