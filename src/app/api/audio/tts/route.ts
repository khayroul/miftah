import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  const lang = searchParams.get("lang") || "ar";
  const voiceType = searchParams.get("voice");

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  // If male voice requested, try edge-tts CLI
  if (voiceType === "male") {
    let edgeVoice = "";
    if (lang === "ar") edgeVoice = "ar-SA-HamedNeural";
    else if (lang === "ms") edgeVoice = "ms-MY-OsmanNeural";

    if (edgeVoice) {
      try {
        // Execute edge-tts and get buffer directly
        // We use a temporary file or pipe. Base64 via stdout is safest for large text but simple works here.
        const { stdout } = await execAsync(`edge-tts --voice ${edgeVoice} --text "${text.replace(/"/g, '\\"')}"`, {
          encoding: "buffer",
        });

        if (stdout && stdout.length > 0) {
          return new NextResponse(stdout, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }
      } catch (error) {
        console.error("Edge TTS Error (falling back to Google):", error);
      }
    }
  }

  // Fallback to Google TTS
  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text
  )}&tl=${lang}&client=tw-ob`;

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
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("TTS Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch audio" }, { status: 500 });
  }
}
