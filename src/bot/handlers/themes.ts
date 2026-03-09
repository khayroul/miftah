import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { supabaseAdmin } from "../supabase-admin.js";

export type ThemeViewMode = "summary" | "full";
const DEFAULT_VIEW_MODE: ThemeViewMode = "summary";

interface PageAyah {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  display_bm: string | null;
  translation_en: string | null;
}

interface ChunkRow {
  id: number;
  surah_id: number;
  ayah_from: number;
  ayah_to: number;
  theme: string;
  theme_bm: string | null;
  keywords: string[] | null;
}

interface FallbackThemeRow {
  ayah_id: number;
  relevance: "primary" | "secondary" | null;
  theme:
    | { id: number; name_bm: string | null; name_en: string | null }
    | Array<{ id: number; name_bm: string | null; name_en: string | null }>
    | null;
}

interface ChunkView {
  id: string;
  surah_id: number;
  ayah_from: number;
  ayah_to: number;
  theme: string;
  theme_bm: string | null;
  keywords: string[];
  source: "dataset" | "fallback";
}

export async function handleThemes(ctx: Context): Promise<void> {
  const parts = (ctx.message?.text ?? "").trim().split(/\s+/).filter(Boolean);
  const arg = parts[1];
  const modeArg = parts[2]?.toLowerCase();
  if (!arg) {
    await ctx.reply(
      "Guna: /themes <nombor halaman> [summary|full]\n\nContoh:\n/themes 586 summary\n/themes 586 full",
    );
    return;
  }

  const pageNum = Number.parseInt(arg, 10);
  if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > 604) {
    await ctx.reply("Nombor halaman mesti antara 1–604.");
    return;
  }

  let mode: ThemeViewMode = DEFAULT_VIEW_MODE;
  if (modeArg === "full") {
    mode = "full";
  } else if (modeArg === "summary" || !modeArg) {
    mode = "summary";
  } else {
    await ctx.reply("Mode mesti `summary` atau `full`.");
    return;
  }

  await sendThemeChunksByPage(ctx, pageNum, mode);
}

export async function sendThemeChunksByPage(
  ctx: Context,
  pageNum: number,
  mode: ThemeViewMode = DEFAULT_VIEW_MODE,
): Promise<void> {
  try {
    const ayat = await getAyatByPage(pageNum);
    if (ayat.length === 0) {
      await ctx.reply(`Tiada data ayat untuk halaman ${pageNum}.`);
      return;
    }

    const rangesBySurah = buildPageRangesBySurah(ayat);
    const chunksFromDataset = await fetchChunksFromDataset(rangesBySurah);

    let chunks = chunksFromDataset;
    if (chunks.length === 0) {
      chunks = await buildFallbackChunksFromThemeAyat(ayat);
    }

    const surahNames = await getSurahNameMap(
      Array.from(new Set(ayat.map((a) => a.surah_id))),
    );

    if (chunks.length === 0) {
      const kb = buildThemeKeyboard(pageNum, mode);

      await ctx.reply(
        `🧩 Theme Chunks — Halaman ${pageNum}\n\nTiada chunk tema ditemui untuk halaman ini.\n` +
          `Nota: dataset mini QUL mengandungi liputan chunk tema yang terhad.`,
        { reply_markup: kb },
      );
      return;
    }

    const sourceLabel =
      chunks[0].source === "dataset"
        ? "Sumber: QUL ayah_theme_chunks"
        : "Sumber: fallback dari theme_ayat";

    let text = `🧩 Theme Chunks — Halaman ${pageNum}\nMode: ${mode === "full" ? "Full Ayat" : "Summary"}\n${sourceLabel}\n\n`;

    chunks.forEach((chunk, idx) => {
      const surahName = surahNames.get(chunk.surah_id) ?? `Surah ${chunk.surah_id}`;
      const ayatInChunk = pickAyatWithinChunk(ayat, chunk);
      const range =
        chunk.ayah_from === chunk.ayah_to
          ? `${chunk.surah_id}:${chunk.ayah_from}`
          : `${chunk.surah_id}:${chunk.ayah_from}-${chunk.ayah_to}`;
      text += `${idx + 1}. ${range} (${surahName})\n`;
      text += `Tema (BM): ${chunk.theme_bm ?? chunk.theme}\n`;
      if (chunk.theme_bm && chunk.theme_bm !== chunk.theme) {
        text += `Theme (EN): ${chunk.theme}\n`;
      }
      if (chunk.keywords.length > 0) {
        text += `Kata kunci: ${chunk.keywords.join(", ")}\n`;
      }
      if (mode === "full" && ayatInChunk.length > 0) {
        text += "Ayat:\n";
        for (const ayah of ayatInChunk) {
          text += `${ayah.surah_id}:${ayah.ayah_number} ${ayah.text_uthmani}\n`;
          text += `BM: ${ayah.display_bm ?? ayah.translation_en ?? "-"}\n`;
        }
      } else if (mode === "summary") {
        text += `Bil. ayat: ${Math.max(1, chunk.ayah_to - chunk.ayah_from + 1)}\n`;
        const firstAyah = ayatInChunk[0];
        if (firstAyah) {
          text += `Mula: ${firstAyah.surah_id}:${firstAyah.ayah_number} — ${firstAyah.display_bm ?? firstAyah.translation_en ?? "-"}\n`;
        }
      }
      text += "\n";
    });

    const chunksText = splitMessage(text.trim(), 3800);
    for (let i = 0; i < chunksText.length; i++) {
      const isLast = i === chunksText.length - 1;
      if (!isLast) {
        await ctx.reply(chunksText[i]);
        continue;
      }

      const kb = buildThemeKeyboard(pageNum, mode);

      await ctx.reply(chunksText[i], { reply_markup: kb });
    }
  } catch (err) {
    console.error("[themes] Error:", err);
    await ctx.reply("Ralat memuatkan paparan tema. Cuba lagi.");
  }
}

async function getAyatByPage(pageNumber: number): Promise<PageAyah[]> {
  const { data, error } = await supabaseAdmin
    .from("ayat")
    .select("id, surah_id, ayah_number, text_uthmani, display_bm, translation_en")
    .eq("page_number", pageNumber)
    .order("surah_id", { ascending: true })
    .order("ayah_number", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PageAyah[];
}

function buildPageRangesBySurah(ayat: PageAyah[]): Map<number, { min: number; max: number }> {
  const map = new Map<number, { min: number; max: number }>();

  for (const ayah of ayat) {
    const existing = map.get(ayah.surah_id);
    if (!existing) {
      map.set(ayah.surah_id, { min: ayah.ayah_number, max: ayah.ayah_number });
      continue;
    }
    existing.min = Math.min(existing.min, ayah.ayah_number);
    existing.max = Math.max(existing.max, ayah.ayah_number);
  }

  return map;
}

async function fetchChunksFromDataset(
  rangesBySurah: Map<number, { min: number; max: number }>,
): Promise<ChunkView[]> {
  const output: ChunkView[] = [];
  const seen = new Set<number>();

  for (const [surahId, range] of rangesBySurah.entries()) {
    const { data, error } = await supabaseAdmin
      .from("ayah_theme_chunks")
      .select("id, surah_id, ayah_from, ayah_to, theme, theme_bm, keywords")
      .eq("surah_id", surahId)
      .lte("ayah_from", range.max)
      .gte("ayah_to", range.min)
      .order("ayah_from", { ascending: true })
      .order("ayah_to", { ascending: true });

    if (error) {
      // If table isn't migrated yet, fail soft and use fallback.
      if (String(error.message || "").toLowerCase().includes("does not exist")) {
        return [];
      }
      throw error;
    }

    for (const row of (data ?? []) as ChunkRow[]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      output.push({
        id: `d:${row.id}`,
        surah_id: row.surah_id,
        ayah_from: row.ayah_from,
        ayah_to: row.ayah_to,
        theme: row.theme,
        theme_bm: row.theme_bm,
        keywords: Array.isArray(row.keywords) ? row.keywords : [],
        source: "dataset",
      });
    }
  }

  output.sort((a, b) =>
    a.surah_id - b.surah_id || a.ayah_from - b.ayah_from || a.ayah_to - b.ayah_to,
  );
  return output;
}

async function buildFallbackChunksFromThemeAyat(
  ayat: PageAyah[],
): Promise<ChunkView[]> {
  const ayahIds = ayat.map((a) => a.id);
  if (ayahIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("theme_ayat")
    .select("ayah_id, relevance, theme:themes(id, name_bm, name_en)")
    .in("ayah_id", ayahIds);
  if (error) throw error;

  const linkByAyah = new Map<number, FallbackThemeRow[]>();
  for (const row of (data ?? []) as unknown as FallbackThemeRow[]) {
    const arr = linkByAyah.get(row.ayah_id) ?? [];
    arr.push(row);
    linkByAyah.set(row.ayah_id, arr);
  }

  const sortedAyat = [...ayat].sort(
    (a, b) => a.surah_id - b.surah_id || a.ayah_number - b.ayah_number,
  );

  const pickThemeLabel = (links: FallbackThemeRow[]): string | null => {
    if (!links || links.length === 0) return null;
    const score = (rel: "primary" | "secondary" | null): number =>
      rel === "primary" ? 0 : rel === "secondary" ? 1 : 2;
    const normalizeTheme = (
      value: FallbackThemeRow["theme"],
    ): { id: number; name_bm: string | null; name_en: string | null } | null => {
      if (!value) return null;
      return Array.isArray(value) ? (value[0] ?? null) : value;
    };

    const sorted = [...links].sort((a, b) => {
      const relDiff = score(a.relevance) - score(b.relevance);
      if (relDiff !== 0) return relDiff;
      return (
        (normalizeTheme(a.theme)?.id ?? 999999) -
        (normalizeTheme(b.theme)?.id ?? 999999)
      );
    });
    const best = sorted[0];
    const theme = best ? normalizeTheme(best.theme) : null;
    if (!theme) return null;
    return theme.name_bm ?? theme.name_en ?? null;
  };

  const chunks: ChunkView[] = [];
  for (const ayah of sortedAyat) {
    const label = pickThemeLabel(linkByAyah.get(ayah.id) ?? []);
    if (!label) continue;

    const last = chunks[chunks.length - 1];
    if (
      last &&
      last.surah_id === ayah.surah_id &&
      last.theme === label &&
      ayah.ayah_number === last.ayah_to + 1
    ) {
      last.ayah_to = ayah.ayah_number;
      continue;
    }

    chunks.push({
      id: `f:${ayah.id}`,
      surah_id: ayah.surah_id,
      ayah_from: ayah.ayah_number,
      ayah_to: ayah.ayah_number,
      theme: label,
      theme_bm: label,
      keywords: [],
      source: "fallback",
    });
  }

  return chunks;
}

function pickAyatWithinChunk(ayat: PageAyah[], chunk: ChunkView): PageAyah[] {
  return ayat.filter(
    (a) =>
      a.surah_id === chunk.surah_id &&
      a.ayah_number >= chunk.ayah_from &&
      a.ayah_number <= chunk.ayah_to,
  );
}

function buildThemeKeyboard(pageNum: number, mode: ThemeViewMode): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("📖 Kembali ke Page", `page_nav:${pageNum}`)
    .row();

  if (mode === "summary") {
    kb.text("📜 Full Ayat", `theme_mode:${pageNum}:full`).row();
  } else {
    kb.text("🧾 Summary", `theme_mode:${pageNum}:summary`).row();
  }

  if (pageNum > 1) kb.text("◀ Prev Theme", `theme_page_nav:${pageNum - 1}:${mode}`);
  if (pageNum < 604) kb.text("Next Theme ▶", `theme_page_nav:${pageNum + 1}:${mode}`);
  return kb;
}

async function getSurahNameMap(surahIds: number[]): Promise<Map<number, string>> {
  if (surahIds.length === 0) return new Map();

  const { data } = await supabaseAdmin
    .from("surahs")
    .select("id, name_transliteration")
    .in("id", surahIds);

  return new Map<number, string>(
    (data ?? [])
      .filter(
        (s): s is { id: number; name_transliteration: string } =>
          typeof s?.id === "number" && typeof s?.name_transliteration === "string",
      )
      .map((s) => [s.id, s.name_transliteration]),
  );
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      parts.push(rest);
      break;
    }
    let splitAt = rest.lastIndexOf("\n", maxLen);
    if (splitAt < 0) splitAt = maxLen;
    parts.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt).trimStart();
  }

  return parts;
}
