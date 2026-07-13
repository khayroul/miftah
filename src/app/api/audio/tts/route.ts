import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

// Allowlist: language code -> edge-tts neural voice. A lang not in this map
// gets no edge voice and simply falls through to the Google TTS fallback,
// which is the same behavior as before.
const EDGE_VOICES: Record<string, string> = {
  ar: "ar-SA-HamedNeural",
  ms: "ms-MY-OsmanNeural",
};

// Allowlist of voice selectors the client may request. Only "male" triggers
// the edge-tts path (unchanged); anything outside the set is rejected.
const ALLOWED_VOICES = new Set(["male", "female"]);

// Language codes must be a plain BCP-47 subset (letters + optional region).
// This blocks query-string injection into the Google TTS fallback URL while
// still accepting the codes the app uses ("ar", "ms").
const LANG_PATTERN = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  const lang = searchParams.get("lang") || "ar";
  const voiceParam = searchParams.get("voice");
  const voiceType = voiceParam || (lang === "ms" ? "male" : null);

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  if (!LANG_PATTERN.test(lang)) {
    return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
  }

  if (voiceParam !== null && !ALLOWED_VOICES.has(voiceParam)) {
    return NextResponse.json({ error: "Invalid voice" }, { status: 400 });
  }

  // If male voice requested, try edge-tts CLI (for local dev).
  if (voiceType === "male") {
    try {
      // SECURITY: pass `text` as an argv array via execFile (NO shell). Shell
      // metacharacters in `text` ($( ), backticks, ; etc.) can never be
      // interpreted as commands on ANY deploy — the prior exec() template was a
      // command-injection hole guarded only when VERCEL === "1".
      const isVercel = process.env.VERCEL === "1";
      const edgeVoice = EDGE_VOICES[lang];

      if (!isVercel && edgeVoice) {
        const { stdout } = await execFileAsync(
          "edge-tts",
          ["--voice", edgeVoice, "--text", text],
          { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
        );

        if (stdout && stdout.length > 0) {
          return new NextResponse(stdout, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=604800",
            },
          });
        }
      }
    } catch (error) {
      // Silent ignore - will fallback to Google
      console.warn("Male voice (edge-tts) skipped or failed:", error);
    }
  }

  // Fallback to Google TTS
  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text
  )}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

  try {
    const response = await fetch(googleTtsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Google TTS responded with ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch (error) {
    console.error("TTS Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch audio" }, { status: 500 });
  }
}
