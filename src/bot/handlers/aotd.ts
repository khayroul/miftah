import type { Context } from "grammy";
import { supabaseAdmin } from "../supabase-admin.js";

const TOTAL_AYAT = 6236;

function getUtcDaySeed(date = new Date()): number {
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.floor(utcMidnight / 86_400_000);
}

function pickAyahIdForToday(): number {
  return (getUtcDaySeed() % TOTAL_AYAT) + 1;
}

export async function handleAyahOfTheDay(ctx: Context): Promise<void> {
  try {
    const ayahId = pickAyahIdForToday();
    const { data: ayah } = await supabaseAdmin
      .from("ayat")
      .select("*")
      .eq("id", ayahId)
      .single();

    if (!ayah) {
      await ctx.reply("Ayat harian belum tersedia.");
      return;
    }

    const { data: surah } = await supabaseAdmin
      .from("surahs")
      .select("name_transliteration, name_arabic")
      .eq("id", ayah.surah_id)
      .single();

    const title = `Ayat Hari Ini (${new Date().toISOString().slice(0, 10)})`;
    const ref = `${ayah.surah_id}:${ayah.ayah_number}`;
    const surahName = surah?.name_transliteration ?? `Surah ${ayah.surah_id}`;
    const bm = ayah.display_bm ?? ayah.translation_en ?? "Terjemahan belum tersedia.";

    const text = [
      title,
      "",
      `${surahName} (${surah?.name_arabic ?? "-"})`,
      `Rujukan: ${ref} • Halaman ${ayah.page_number}`,
      "",
      ayah.text_uthmani,
      "",
      bm,
      "",
      `Guna /page ${ayah.page_number} untuk lihat halaman penuh.`,
    ].join("\n");

    await ctx.reply(text);
  } catch (err) {
    console.error("[aotd] Error:", err);
    await ctx.reply("Ralat mendapatkan ayat harian. Cuba lagi.");
  }
}
