import type { Context } from "grammy";
import { supabaseAdmin } from "../supabase-admin.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `Anda adalah Miftah, pembantu hafazan Al-Quran dalam Bahasa Malaysia.

Anda boleh membantu pengguna dengan:
- Menjawab soalan tentang ayat, surah, atau muka surat Al-Quran
- Menjelaskan makna ayat dalam BM
- Memberikan konteks (asbab nuzul, tema)
- Membantu dengan hafazan (tips, teknik)
- Mengarahkan ke perintah bot yang betul

Perintah bot tersedia:
/start — Pelan harian hifz
/hifz — Sesi hafalan (Sabqi/Sabak/Manzil)
/hifz sabqi — Mula blok Sabqi sahaja
/hifz sabak — Mula blok Sabak sahaja
/vocab — Latihan vocab (default 10, boleh /vocab 20)
/page <num> — Lihat halaman mushaf (golden: 1, 2, 77, 489, 604)
/stats — Statistik kemajuan

Jika pengguna bertanya tentang ayat tertentu, sertakan teks Arab dan terjemahan BM jika ada.
Jawab dengan ringkas dan mesra. Gunakan BM.`;

export async function handleAsk(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  // Strip /ask prefix if present
  const query = text.startsWith("/ask") ? text.slice(4).trim() : text;
  if (!query) {
    await ctx.reply("Tanya apa sahaja tentang Al-Quran. Contoh: 'Apakah maksud surah Al-Fatihah?'");
    return;
  }

  if (!OPENAI_API_KEY) {
    await ctx.reply(
      "LLM belum dikonfigurasi. Set OPENAI_API_KEY dalam .env.local.\n\n" +
        "Sementara itu, guna perintah:\n/hifz — Sesi hafalan\n/vocab — Latihan vocab\n/page 77 — Lihat halaman",
    );
    return;
  }

  try {
    // Check if query mentions a specific surah/ayah — fetch context from DB
    const context = await fetchQuranContext(query);

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: "system" as const,
        content: `Konteks dari pangkalan data:\n${context}`,
      });
    }

    messages.push({ role: "user" as const, content: query });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "codex-mini-latest",
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[ask] OpenAI error:", err);
      await ctx.reply("Ralat mendapatkan jawapan. Cuba lagi.");
      return;
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "Tiada jawapan.";
    await ctx.reply(reply, { parse_mode: "Markdown" }).catch(() =>
      // Fallback without markdown if parsing fails
      ctx.reply(reply),
    );
  } catch (err) {
    console.error("[ask] Error:", err);
    await ctx.reply("Ralat berlaku. Cuba lagi.");
  }
}

/** Try to extract surah/ayah references and fetch from DB */
async function fetchQuranContext(query: string): Promise<string | null> {
  const parts: string[] = [];

  // Match patterns like "surah 2", "al-baqarah", "2:255", "ayat 5"
  const refMatch = query.match(/(\d{1,3}):(\d{1,3})/);
  if (refMatch) {
    const surahId = parseInt(refMatch[1]);
    const ayahNum = parseInt(refMatch[2]);
    const { data: ayah } = await supabaseAdmin
      .from("ayat")
      .select("*, surahs!inner(name_arabic, name_transliteration, name_bm)")
      .eq("surah_id", surahId)
      .eq("ayah_number", ayahNum)
      .single();

    if (ayah) {
      const s = (ayah as any).surahs;
      parts.push(
        `Ayat ${surahId}:${ayahNum} (${s.name_transliteration} / ${s.name_arabic}):\n` +
          `Arab: ${ayah.text_uthmani}\n` +
          `BM: ${ayah.display_bm ?? ayah.translation_en ?? "tiada"}`,
      );
    }
  }

  // Match surah name
  const surahMatch = query.match(
    /(?:surah|surat)\s+(\d+|[a-zA-Z'-]+)/i,
  );
  if (surahMatch && !refMatch) {
    const term = surahMatch[1];
    let surah;
    if (/^\d+$/.test(term)) {
      const { data } = await supabaseAdmin
        .from("surahs")
        .select("*")
        .eq("id", parseInt(term))
        .single();
      surah = data;
    } else {
      const { data } = await supabaseAdmin
        .from("surahs")
        .select("*")
        .ilike("name_transliteration", `%${term}%`)
        .limit(1)
        .single();
      surah = data;
    }

    if (surah) {
      parts.push(
        `Surah ${surah.id}: ${surah.name_transliteration} (${surah.name_arabic})\n` +
          `BM: ${surah.name_bm}\n` +
          `Ayat: ${surah.ayah_count}, Juz: ${surah.juz_start}, ` +
          `Wahyu: ${surah.revelation_type}`,
      );
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}
