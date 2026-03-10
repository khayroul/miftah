import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { supabaseAdmin } from "../supabase-admin.js";

interface MutashabihatPattern {
  id: number;
  pattern_text: string;
  description_bm: string | null;
  ayah_count: number;
  difficulty_rating: number | null;
}

type SurahRelation =
  | { name_transliteration: string }
  | { name_transliteration: string }[]
  | null;

interface PatternOccurrence {
  ayah_id: number;
  variation_note: string | null;
  ayat:
    | {
        surah_id: number;
        ayah_number: number;
        text_uthmani: string;
        display_bm: string | null;
        translation_en: string | null;
        surahs: SurahRelation;
      }
    | {
        surah_id: number;
        ayah_number: number;
        text_uthmani: string;
        display_bm: string | null;
        translation_en: string | null;
        surahs: SurahRelation;
      }[];
}

interface AyahForHeuristic {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  text_simple: string;
  display_bm: string | null;
  translation_en: string | null;
  surahs: SurahRelation;
}

function getSurahName(
  relation: SurahRelation,
  fallbackSurahId: number,
): string {
  if (Array.isArray(relation)) {
    return relation[0]?.name_transliteration ?? `Surah ${fallbackSurahId}`;
  }
  return relation?.name_transliteration ?? `Surah ${fallbackSurahId}`;
}

function parseRef(value: string): { surah: number; ayah: number } | null {
  const match = value.match(/^(\d{1,3}):(\d{1,3})$/);
  if (!match) {
    return null;
  }
  const surah = Number.parseInt(match[1], 10);
  const ayah = Number.parseInt(match[2], 10);
  if (!Number.isInteger(surah) || !Number.isInteger(ayah)) {
    return null;
  }
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > 286) {
    return null;
  }
  return { surah, ayah };
}

function randomOf<T>(items: T[]): T | null {
  if (items.length === 0) {
    return null;
  }
  const idx = Math.floor(Math.random() * items.length);
  return items[idx];
}

function derivePhrase(textSimple: string): string | null {
  const tokens = textSimple
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  if (tokens.length < 2) {
    return null;
  }
  if (tokens.length >= 3) {
    return `${tokens[0]} ${tokens[1]} ${tokens[2]}`;
  }
  return `${tokens[0]} ${tokens[1]}`;
}

function buildHeuristicAlertText(
  phrase: string,
  baseAyah: AyahForHeuristic,
  matches: AyahForHeuristic[],
): string {
  const lines: string[] = [];
  lines.push("⚠️ Mutashabihat Alert (fallback)");
  lines.push("");
  lines.push(`Frasa serupa: "${phrase}"`);
  lines.push(
    "Nota: Data mutashabihat rasmi belum di-seed, jadi ini padanan heuristik sementara.",
  );
  lines.push("");
  const baseSurah = getSurahName(baseAyah.surahs, baseAyah.surah_id);
  const baseBm = baseAyah.display_bm ?? baseAyah.translation_en ?? "—";
  lines.push(`Ayat rujukan: ${baseSurah} ${baseAyah.surah_id}:${baseAyah.ayah_number}`);
  lines.push(baseAyah.text_uthmani);
  lines.push(baseBm);
  lines.push("");
  lines.push("Ayat berkaitan:");

  for (const ay of matches.slice(0, 6)) {
    const surahName = getSurahName(ay.surahs, ay.surah_id);
    const bm = ay.display_bm ?? ay.translation_en ?? "—";
    lines.push(`• ${surahName} ${ay.surah_id}:${ay.ayah_number}`);
    lines.push(`  ${ay.text_uthmani}`);
    lines.push(`  ${bm}`);
  }

  return lines.join("\n");
}

async function fetchAyatByPhrase(
  phrase: string,
  excludeAyahId?: number,
): Promise<AyahForHeuristic[]> {
  let query = supabaseAdmin
    .from("ayat")
    .select(
      "id, surah_id, ayah_number, text_uthmani, text_simple, display_bm, translation_en, surahs!inner(name_transliteration)",
    )
    .ilike("text_simple", `%${phrase}%`)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true })
    .limit(12);

  if (excludeAyahId) {
    query = query.neq("id", excludeAyahId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as AyahForHeuristic[];
}

async function sendHeuristicFallback(
  ctx: Context,
  baseAyah: AyahForHeuristic,
): Promise<void> {
  const phrase = derivePhrase(baseAyah.text_simple);
  if (!phrase) {
    await ctx.reply("Tidak jumpa frasa untuk padanan mutashabihat.");
    return;
  }

  const matches = await fetchAyatByPhrase(phrase, baseAyah.id);
  if (matches.length === 0) {
    await ctx.reply("Tiada padanan mutashabihat fallback untuk ayat ini.");
    return;
  }

  const kb = new InlineKeyboard().text("Pattern Seterusnya", "mut_next");
  await ctx.reply(buildHeuristicAlertText(phrase, baseAyah, matches), {
    reply_markup: kb,
  });
}

async function fetchPatternOccurrences(
  patternId: number,
): Promise<PatternOccurrence[]> {
  const { data, error } = await supabaseAdmin
    .from("mutashabihat_ayat")
    .select(
      "ayah_id, variation_note, ayat!inner(surah_id, ayah_number, text_uthmani, display_bm, translation_en, surahs!inner(name_transliteration))",
    )
    .eq("mutashabihat_id", patternId)
    .order("ayah_id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PatternOccurrence[];
}

function buildPatternText(
  pattern: MutashabihatPattern,
  occurrences: PatternOccurrence[],
): string {
  const lines: string[] = [];
  lines.push("⚠️ Mutashabihat Alert");
  lines.push("");
  lines.push(`Pattern: ${pattern.pattern_text}`);
  if (pattern.description_bm) {
    lines.push(`Nota: ${pattern.description_bm}`);
  }
  if (pattern.difficulty_rating) {
    lines.push(`Kesukaran: ${pattern.difficulty_rating}/5`);
  }
  lines.push("");
  lines.push("Lokasi serupa:");

  for (const occ of occurrences.slice(0, 8)) {
    const ay = Array.isArray(occ.ayat) ? occ.ayat[0] : occ.ayat;
    if (!ay) {
      continue;
    }
    const surahName = getSurahName(ay.surahs, ay.surah_id);
    const bm = ay.display_bm ?? ay.translation_en ?? "—";
    lines.push(
      `• ${surahName} ${ay.surah_id}:${ay.ayah_number}${occ.variation_note ? ` — ${occ.variation_note}` : ""}`,
    );
    lines.push(`  ${ay.text_uthmani}`);
    lines.push(`  ${bm}`);
  }

  if (occurrences.length > 8) {
    lines.push(`… dan ${occurrences.length - 8} lagi lokasi.`);
  }

  return lines.join("\n");
}

async function sendPatternById(ctx: Context, patternId: number): Promise<void> {
  const { data: pattern, error } = await supabaseAdmin
    .from("mutashabihat")
    .select("id, pattern_text, description_bm, ayah_count, difficulty_rating")
    .eq("id", patternId)
    .single();
  if (error || !pattern) {
    await ctx.reply("Pattern mutashabihat tidak ditemui.");
    return;
  }

  const occurrences = await fetchPatternOccurrences(pattern.id);
  if (occurrences.length === 0) {
    await ctx.reply("Pattern ini tiada data lokasi ayat.");
    return;
  }

  const kb = new InlineKeyboard().text("Pattern Seterusnya", "mut_next");
  await ctx.reply(buildPatternText(pattern as MutashabihatPattern, occurrences), {
    reply_markup: kb,
  });
}

export async function handleMutashabihat(ctx: Context): Promise<void> {
  try {
    const arg = ctx.message?.text?.trim().split(/\s+/)[1];
    if (!arg) {
      await showRandomPattern(ctx);
      return;
    }

    const ref = parseRef(arg);
    if (!ref) {
      await ctx.reply(
        "Guna: /mutashabihat atau /mutashabihat <surah:ayah>\nContoh: /mutashabihat 2:255",
      );
      return;
    }

    const { data: ayahRow } = await supabaseAdmin
      .from("ayat")
      .select(
        "id, surah_id, ayah_number, text_uthmani, text_simple, display_bm, translation_en, surahs!inner(name_transliteration)",
      )
      .eq("surah_id", ref.surah)
      .eq("ayah_number", ref.ayah)
      .single();

    if (!ayahRow) {
      await ctx.reply(`Ayat ${ref.surah}:${ref.ayah} tidak ditemui.`);
      return;
    }

    const { data: links, error } = await supabaseAdmin
      .from("mutashabihat_ayat")
      .select("mutashabihat_id")
      .eq("ayah_id", ayahRow.id);
    if (error) {
      throw error;
    }

    const ids = [...new Set((links ?? []).map((x) => Number(x.mutashabihat_id)))];
    if (ids.length === 0) {
      await sendHeuristicFallback(ctx, ayahRow as AyahForHeuristic);
      return;
    }

    await sendPatternById(ctx, ids[0]);
  } catch (err) {
    console.error("[mutashabihat] Error:", err);
    await ctx.reply("Ralat memuatkan mutashabihat. Cuba lagi.");
  }
}

export async function showRandomPattern(ctx: Context): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from("mutashabihat")
      .select("id, pattern_text, description_bm, ayah_count, difficulty_rating")
      .gte("ayah_count", 2)
      .order("difficulty_rating", { ascending: false })
      .limit(30);
    if (error) {
      throw error;
    }

    const chosen = randomOf((data ?? []) as MutashabihatPattern[]);
    if (!chosen) {
      const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
        .from("ayat")
        .select(
          "id, surah_id, ayah_number, text_uthmani, text_simple, display_bm, translation_en, surahs!inner(name_transliteration)",
        )
        .order("id", { ascending: true })
        .limit(250);
      if (fallbackError) {
        throw fallbackError;
      }

      const sampled = randomOf((fallbackRows ?? []) as AyahForHeuristic[]);
      if (!sampled) {
        await ctx.reply("Data ayat tidak tersedia untuk mutashabihat fallback.");
        return;
      }

      await sendHeuristicFallback(ctx, sampled);
      return;
    }

    await sendPatternById(ctx, chosen.id);
  } catch (err) {
    console.error("[mutashabihat] random Error:", err);
    await ctx.reply("Ralat memuatkan pattern mutashabihat.");
  }
}
