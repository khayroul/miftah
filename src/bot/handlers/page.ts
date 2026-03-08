import { InputFile, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import * as fs from "fs";
import * as path from "path";
import { supabaseAdmin } from "../supabase-admin.js";
import type { Ayah } from "@/types/database";

const GOLDEN_DIR = path.resolve("test/golden/pages");
const ASSETS_DIR = path.resolve("assets/pages");

export async function handlePage(ctx: Context): Promise<void> {
  const arg = ctx.message?.text?.split(" ")[1];

  if (!arg) {
    await ctx.reply(
      "Guna: /page <nombor>\n\nHalaman 1–21 (Juz 1) tersedia.\nContoh: /page 3",
    );
    return;
  }

  const pageNum = parseInt(arg);
  if (isNaN(pageNum) || pageNum < 1 || pageNum > 604) {
    await ctx.reply("Nombor halaman mesti antara 1–604.");
    return;
  }

  await sendPageAndText(ctx, pageNum);
}

export async function sendPageAndText(
  ctx: Context,
  pageNum: number,
): Promise<void> {
  try {
    const imageSent = await sendPageImage(ctx, pageNum);

    const ayat = await getAyatByPage(pageNum);
    if (ayat.length > 0) {
      const surahIds = [...new Set(ayat.map((a) => a.surah_id))];
      const { data: surahs } = await supabaseAdmin
        .from("surahs")
        .select("id, name_transliteration")
        .in("id", surahIds);
      const surahMap = new Map(
        (surahs ?? []).map((s: any) => [s.id, s.name_transliteration]),
      );

      // Arabic is already shown in the page image (Uthmani font).
      // Text message shows only references + BM translations.
      let text = `📖 *Halaman ${pageNum}* — ${ayat.length} ayat\n\n`;
      let currentSurah = 0;

      for (const ayah of ayat) {
        if (ayah.surah_id !== currentSurah) {
          currentSurah = ayah.surah_id;
          const name = surahMap.get(currentSurah) ?? `Surah ${currentSurah}`;
          text += `\n*${name}*\n`;
        }
        const bm = ayah.display_bm ?? ayah.translation_en ?? "";
        text += `${ayah.surah_id}:${ayah.ayah_number} — _${bm}_\n`;
      }

      const chunks = splitMessage(text, 4000);
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        if (isLast) {
          const kb = new InlineKeyboard()
            .text("📝 Vocab Halaman Ini", `page_vocab:${pageNum}`)
            .row();
          if (pageNum > 1) kb.text("◀ Prev", `page_nav:${pageNum - 1}`);
          if (pageNum < 604) kb.text("Next ▶", `page_nav:${pageNum + 1}`);
          await ctx.reply(chunks[i], {
            parse_mode: "Markdown",
            reply_markup: kb,
          });
        } else {
          await ctx.reply(chunks[i], { parse_mode: "Markdown" });
        }
      }
    } else if (!imageSent) {
      await ctx.reply(
        `Halaman ${pageNum} — imej belum dirender. Guna halaman 1–21 (Juz 1).`,
      );
    }
  } catch (err) {
    console.error("[page] Error:", err);
    await ctx.reply("Ralat memuatkan halaman. Cuba lagi.");
  }
}

async function sendPageImage(
  ctx: Context,
  pageNum: number,
): Promise<boolean> {
  const padded = String(pageNum).padStart(3, "0");
  const filename = `page_${padded}.png`;

  for (const dir of [ASSETS_DIR, GOLDEN_DIR]) {
    const filepath = path.join(dir, filename);
    if (fs.existsSync(filepath)) {
      await ctx.replyWithPhoto(new InputFile(filepath), {
        caption: `Halaman ${pageNum}`,
      });
      return true;
    }
  }
  return false;
}

async function getAyatByPage(pageNumber: number): Promise<Ayah[]> {
  const { data, error } = await supabaseAdmin
    .from("ayat")
    .select("*")
    .eq("page_number", pageNumber)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Ayah[];
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
