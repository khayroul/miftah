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
  const pct = (n: number, total: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";

  const lines = [
    `*Statistik Miftah* ${stats.streak > 0 ? `🔥 ${stats.streak} hari berturut` : ""}`,
    "",
  ];

  // Due now
  const totalDue = stats.dueAyatToday + stats.dueVocabToday;
  if (totalDue > 0) {
    lines.push(`⏰ *Perlu ulangkaji sekarang:* ${totalDue}`);
    if (stats.dueAyatToday > 0) lines.push(`  Hifz: ${stats.dueAyatToday} ayat`);
    if (stats.dueVocabToday > 0) lines.push(`  Vocab: ${stats.dueVocabToday} perkataan`);
    lines.push("");
  }

  // Hifz progress
  lines.push("*Hifz:*");
  lines.push(`  Sabak (baru): ${s.sabak} ayat`);
  lines.push(`  Sabqi (minggu ini): ${s.sabqi} ayat`);
  lines.push(`  Manzil (hafal): ${s.manzil} ayat`);
  lines.push(`  Jumlah mula: ${stats.totalAyatStarted} / 6,236 (${pct(stats.totalAyatStarted, 6236)})`);

  // Juz breakdown if any progress
  if (stats.juzProgress.length > 0) {
    const juzSummary = stats.juzProgress
      .map((j) => `Juz ${j.juz}: ${j.count}`)
      .join(", ");
    lines.push(`  Juz: ${juzSummary}`);
  }

  // Vocab
  lines.push("");
  lines.push("*Vocab:*");
  lines.push(`  Dipelajari: ${stats.totalVocab} perkataan`);
  if (stats.totalVocab > 0) {
    const stateLabels = ["Baru", "Sedang belajar", "Ulangkaji", "Belajar semula"];
    const active = [1, 2, 3]
      .filter((i) => stats.vocabByState[i] > 0)
      .map((i) => `${stateLabels[i]}: ${stats.vocabByState[i]}`)
      .join(", ");
    if (active) lines.push(`  ${active}`);
  }

  // Reviews
  lines.push("");
  lines.push("*Ulangkaji:*");
  lines.push(`  Hari ini: ${stats.reviewsToday}`);
  lines.push(`  Minggu ini: ${stats.reviewsThisWeek}`);
  lines.push(`  Keseluruhan: ${stats.reviewsAllTime}`);
  if (stats.retentionRate > 0) {
    lines.push(`  Kadar ingat (30 hari): ${stats.retentionRate}%`);
  }

  return lines.join("\n");
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
