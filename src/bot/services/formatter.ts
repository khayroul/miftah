import { InlineKeyboard } from "grammy";
import type { Ayah, Word } from "@/types/database";
import type { DailyPlan } from "./scheduler.js";
import type { BlankingLevel } from "./blanking.js";
import type { UserStats } from "../db/queries-bot.js";

// ── Ayah formatting ──

export function formatAyah(
  ayah: Ayah,
  surahName: string,
): string {
  const ref = `${surahName} ${ayah.surah_id}:${ayah.ayah_number}`;
  const bm = ayah.display_bm ?? ayah.translation_en ?? "";
  return `${ayah.text_uthmani}\n\n📖 ${ref}\n${bm}`;
}

export function formatBlankedAyah(
  blankedText: string,
  surahName: string,
  surahId: number,
  ayahNumber: number,
  level: BlankingLevel,
): string {
  const ref = `${surahName} ${surahId}:${ayahNumber}`;
  return `📖 ${ref}  •  Tahap ${level}/4\n\n${blankedText}`;
}

// ── Vocab formatting ──

export function formatVocabQuestion(word: Word): string {
  return `📝 *Vocab*\n\n${word.text_uthmani}`;
}

export function formatVocabAnswer(word: Word): string {
  const bm = word.translation_bm ?? "—";
  const en = word.translation_en ?? "—";
  const root = word.root ? `\nAkar: ${word.root}` : "";
  const freq =
    word.frequency > 1 ? `\nKekerapan: ${word.frequency}x` : "";
  return `${word.text_uthmani}\n\nBM: ${bm}\nEN: ${en}${root}${freq}`;
}

// ── Rating keyboard ──

export function buildRatingKeyboard(
  prefix: string,
  itemId: number,
  block?: string,
): InlineKeyboard {
  const suffix = block ? `:${block}` : "";
  return new InlineKeyboard()
    .text("Lupa (1)", `${prefix}:${itemId}:1${suffix}`)
    .text("Susah (2)", `${prefix}:${itemId}:2${suffix}`)
    .text("Baik (3)", `${prefix}:${itemId}:3${suffix}`)
    .text("Mudah (4)", `${prefix}:${itemId}:4${suffix}`);
}

// ── Daily plan ──

export function formatDailyPlan(plan: DailyPlan): string {
  const lines = ["*Bismillah. Pelan hifz hari ini:*\n"];

  if (plan.sabqi.length > 0) {
    lines.push(`1️⃣ *Sabqi* (ulangkaji baru): ${plan.sabqi.length} ayat`);
  }
  if (plan.sabak.length > 0) {
    lines.push(`2️⃣ *Sabak* (hafalan baru): ${plan.sabak.length} ayat`);
  }
  if (plan.manzil.length > 0) {
    lines.push(`3️⃣ *Manzil* (ulangkaji lama): ${plan.manzil.length} ayat`);
  }

  const total = plan.sabqi.length + plan.sabak.length + plan.manzil.length;
  if (total === 0) {
    lines.push("Tiada ulangkaji hari ini. Tekan /hifz untuk mula hafalan baru!");
  } else {
    lines.push(`\nJumlah: ${total} ayat`);
  }

  return lines.join("\n");
}

export function buildPlanKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Mula Sabqi", "hifz_block:sabqi")
    .text("Mula Sabak", "hifz_block:sabak")
    .text("Mula Manzil", "hifz_block:manzil");
}

// ── Stats ──

export function formatStats(stats: UserStats): string {
  const { ayatByStatus: s } = stats;
  return [
    "*Statistik Miftah*\n",
    "*Hifz:*",
    `  Sabak (baru): ${s.sabak} ayat`,
    `  Sabqi (minggu ini): ${s.sabqi} ayat`,
    `  Manzil (hafal): ${s.manzil} ayat`,
    `  Belum mula: ${6236 - stats.totalAyatStarted} ayat`,
    "",
    "*Vocab:*",
    `  Dipelajari: ${stats.totalVocab} perkataan`,
    "",
    "*Ulangkaji:*",
    `  Hari ini: ${stats.reviewsToday}`,
    `  Minggu ini: ${stats.reviewsThisWeek}`,
  ].join("\n");
}

// ── Blanking controls ──

export function buildBlankingKeyboard(
  ayahId: number,
  currentLevel: BlankingLevel,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text("Tunjuk Penuh", `reveal:${ayahId}`);
  if (currentLevel < 4) {
    kb.text(`Naik Tahap ${currentLevel + 1}`, `bl:${ayahId}:${currentLevel + 1}`);
  }
  return kb;
}

// ── Sabak controls ──

export function buildSabakKeyboard(progressId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Dah Hafal ✓", `sabak_done:${progressId}`)
    .text("Masih Susah", `sabak_struggle:${progressId}`);
}
