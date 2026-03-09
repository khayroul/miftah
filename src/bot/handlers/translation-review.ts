import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { supabaseAdmin } from "../supabase-admin.js";

interface TranslationReviewSession {
  queue: number[];
  total: number;
  reviewed: number;
  approved: number;
  flagged: number;
  currentAyahId: number | null;
}

interface ReviewAyahRow {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  translation_id: string | null;
  translation_en: string | null;
  display_bm: string | null;
  bm_flagged: boolean;
  bm_resolution_notes: string | null;
  bm_correction_note: string | null;
  surahs: {
    name_transliteration: string;
  } | null;
}

const DEFAULT_REVIEW_COUNT = 10;
const MAX_REVIEW_COUNT = 50;
const sessions = new Map<number, TranslationReviewSession>();

function parseCount(value: string | undefined): number {
  if (!value) {
    return DEFAULT_REVIEW_COUNT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_REVIEW_COUNT;
  }
  return Math.min(parsed, MAX_REVIEW_COUNT);
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1) {
      splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

function summaryText(session: TranslationReviewSession): string {
  return `Disemak: ${session.reviewed}/${session.total} • Lulus: ${session.approved} • Flag: ${session.flagged}`;
}

async function fetchQueue(count: number): Promise<number[]> {
  const flaggedTarget = Math.ceil(count * 0.7);

  const { data: flaggedRows, error: flaggedErr } = await supabaseAdmin
    .from("ayat")
    .select("id")
    .eq("bm_flagged", true)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true })
    .limit(flaggedTarget);
  if (flaggedErr) {
    throw flaggedErr;
  }

  const queue = (flaggedRows ?? []).map((r) => Number(r.id));
  if (queue.length >= count) {
    return queue.slice(0, count);
  }

  const { data: extraRows, error: extraErr } = await supabaseAdmin
    .from("ayat")
    .select("id")
    .eq("bm_flagged", false)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true })
    .limit(count * 3);
  if (extraErr) {
    throw extraErr;
  }

  for (const row of extraRows ?? []) {
    const id = Number(row.id);
    if (!queue.includes(id)) {
      queue.push(id);
    }
    if (queue.length >= count) {
      break;
    }
  }

  return queue.slice(0, count);
}

async function fetchAyahForReview(ayahId: number): Promise<ReviewAyahRow | null> {
  const { data, error } = await supabaseAdmin
    .from("ayat")
    .select(
      "id, surah_id, ayah_number, text_uthmani, translation_id, translation_en, display_bm, bm_flagged, bm_resolution_notes, bm_correction_note, surahs!inner(name_transliteration)",
    )
    .eq("id", ayahId)
    .single();
  if (error) {
    throw error;
  }
  return (data ?? null) as ReviewAyahRow | null;
}

function buildReviewCard(ayah: ReviewAyahRow, session: TranslationReviewSession): string {
  const surahName = ayah.surahs?.name_transliteration ?? `Surah ${ayah.surah_id}`;
  const lines: string[] = [
    "🧾 BM Translation Review",
    "",
    `${surahName} ${ayah.surah_id}:${ayah.ayah_number}`,
    ayah.text_uthmani,
    "",
    `BM: ${ayah.display_bm ?? "—"}`,
    `ID (source): ${ayah.translation_id ?? "—"}`,
    `EN (source): ${ayah.translation_en ?? "—"}`,
    `Status flag: ${ayah.bm_flagged ? "true" : "false"}`,
  ];

  if (ayah.bm_resolution_notes) {
    lines.push(`Nota AI: ${ayah.bm_resolution_notes}`);
  }
  if (ayah.bm_correction_note) {
    lines.push(`Nota pembetulan: ${ayah.bm_correction_note}`);
  }

  lines.push("");
  lines.push(summaryText(session));
  return lines.join("\n");
}

function reviewKeyboard(ayahId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Lulus", `tr_dec:ok:${ayahId}`)
    .text("⚠ Flag", `tr_dec:flag:${ayahId}`)
    .row()
    .text("⏭ Seterusnya", "tr_next");
}

export async function handleTranslationReview(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  try {
    const count = parseCount(ctx.message?.text?.trim().split(/\s+/)[1]);
    const queue = await fetchQueue(count);
    if (queue.length === 0) {
      await ctx.reply("Tiada ayat untuk translation review.");
      return;
    }

    sessions.set(chatId, {
      queue: [...queue],
      total: queue.length,
      reviewed: 0,
      approved: 0,
      flagged: 0,
      currentAyahId: null,
    });

    await ctx.reply(`🧾 Translation review bermula: ${queue.length} ayat`);
    await showNextTranslationReview(ctx);
  } catch (err) {
    console.error("[trreview] Error:", err);
    await ctx.reply("Ralat memulakan translation review.");
  }
}

export async function showNextTranslationReview(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const session = sessions.get(chatId);
  if (!session) {
    await ctx.reply("Sesi review tiada. Guna /trreview untuk mula.");
    return;
  }

  while (session.queue.length > 0) {
    const ayahId = session.queue.shift()!;
    const ayah = await fetchAyahForReview(ayahId);
    if (!ayah) {
      session.total = Math.max(0, session.total - 1);
      continue;
    }

    session.currentAyahId = ayah.id;
    const text = buildReviewCard(ayah, session);
    const chunks = splitMessage(text, 3800);
    for (let i = 0; i < chunks.length; i += 1) {
      if (i === chunks.length - 1) {
        await ctx.reply(chunks[i], {
          reply_markup: reviewKeyboard(ayah.id),
        });
      } else {
        await ctx.reply(chunks[i]);
      }
    }
    return;
  }

  sessions.delete(chatId);
  await ctx.reply(
    `✅ Translation review selesai.\n${summaryText(session)}\n\nGuna /trreview untuk sesi baru.`,
  );
}

export async function handleTranslationReviewDecision(
  ctx: Context,
  decision: "ok" | "flag",
  ayahId: number,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const session = sessions.get(chatId);
  if (!session) {
    await ctx.reply("Sesi review tiada. Guna /trreview.");
    return;
  }

  if (session.currentAyahId !== ayahId) {
    await ctx.reply("Ayat ini bukan item semasa. Tekan ⏭ Seterusnya.");
    return;
  }

  try {
    const update = decision === "ok"
      ? { bm_flagged: false }
      : { bm_flagged: true };
    const { error } = await supabaseAdmin
      .from("ayat")
      .update(update)
      .eq("id", ayahId);
    if (error) {
      throw error;
    }

    session.reviewed += 1;
    if (decision === "ok") {
      session.approved += 1;
    } else {
      session.flagged += 1;
    }
    session.currentAyahId = null;

    const label = decision === "ok" ? "✅ Ditanda lulus." : "⚠ Ditanda untuk semakan.";
    const kb = new InlineKeyboard().text("Seterusnya →", "tr_next");
    await ctx.reply(`${label}\n${summaryText(session)}`, { reply_markup: kb });
  } catch (err) {
    console.error("[trreview] decision Error:", err);
    await ctx.reply("Ralat kemaskini status review.");
  }
}
