import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Bot } from "grammy";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ALLOWED_CHAT_IDS } from "./config.js";
import { handleStart } from "./handlers/start.js";
import { handleVocab } from "./handlers/vocab.js";
import { handleHifz } from "./handlers/hifz.js";
import { handleStats } from "./handlers/stats.js";
import { handleCallback } from "./handlers/callback.js";
import { handlePage } from "./handlers/page.js";
import { handleAsk } from "./handlers/ask.js";
import { handleAyahOfTheDay } from "./handlers/aotd.js";
import { handleQuiz } from "./handlers/quiz.js";
import { handleMutashabihat } from "./handlers/mutashabihat.js";
import { handleTranslationReview } from "./handlers/translation-review.js";
import { handleThemes } from "./handlers/themes.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

const LOCK_PATH = resolve(process.cwd(), ".tmp", "miftah-bot.lock");

const bot = new Bot(token);
const BOT_COMMANDS = [
  { command: "start", description: "Pelan harian" },
  { command: "hifz", description: "Sesi hafalan (Sabqi/Sabak/Manzil)" },
  { command: "vocab", description: "Latihan vocab" },
  { command: "page", description: "Lihat halaman mushaf" },
  { command: "stats", description: "Statistik" },
  { command: "aotd", description: "Ayat harian" },
  { command: "quiz", description: "MCQ vocab" },
  { command: "mutashabihat", description: "Alert ayat serupa" },
  { command: "trreview", description: "Semak BM translation" },
  { command: "themes", description: "Paparan chunk tema ayat" },
  { command: "ask", description: "Tanya tentang Al-Quran" },
];

// Auth middleware: allow all if no ALLOWED_CHAT_IDS configured (dev mode)
bot.use(async (ctx, next) => {
  if (ALLOWED_CHAT_IDS.size > 0) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId || !ALLOWED_CHAT_IDS.has(chatId)) {
      console.log(`[auth] Blocked chat_id: ${chatId}`);
      return;
    }
  }
  await next();
});

// Commands
bot.command("start", handleStart);
bot.command("vocab", handleVocab);
bot.command("hifz", handleHifz);
bot.command("stats", handleStats);
bot.command("page", handlePage);
bot.command("ask", handleAsk);
bot.command("aotd", handleAyahOfTheDay);
bot.command("quiz", handleQuiz);
bot.command("mutashabihat", handleMutashabihat);
bot.command("trreview", handleTranslationReview);
bot.command("themes", handleThemes);

// Callback queries (inline keyboard presses)
bot.on("callback_query:data", handleCallback);

// Catch-all: route free text through LLM (or show help if no LLM)
bot.on("message:text", handleAsk);

// Error handler
bot.catch((err) => {
  console.error("[bot] Error:", err.error);
});

async function registerBotCommands(): Promise<void> {
  try {
    await bot.api.setMyCommands(BOT_COMMANDS);
    await bot.api.setMyCommands(BOT_COMMANDS, {
      scope: { type: "all_private_chats" },
    });
    console.log("[miftah-bot] Bot commands synced (default + private chats)");
  } catch (err) {
    console.error("[miftah-bot] Failed to sync bot commands:", err);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

let isShuttingDown = false;
let lockAcquired = false;

function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireInstanceLock(): Promise<void> {
  const currentPid = process.pid;
  await mkdir(dirname(LOCK_PATH), { recursive: true });

  let existingPid: number | null = null;
  try {
    const existing = await readFile(LOCK_PATH, "utf-8");
    const parsed = Number.parseInt(existing.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      existingPid = parsed;
    }
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : undefined;
    if (code !== "ENOENT") {
      throw err;
    }
  }

  if (existingPid !== null && existingPid !== currentPid && pidExists(existingPid)) {
    throw new Error(`Another bot instance is already running (PID ${existingPid}).`);
  }

  await writeFile(LOCK_PATH, `${currentPid}\n`, "utf-8");
  lockAcquired = true;
}

async function releaseInstanceLock(): Promise<void> {
  if (!lockAcquired) return;
  try {
    const existing = await readFile(LOCK_PATH, "utf-8");
    const existingPid = Number.parseInt(existing.trim(), 10);
    if (existingPid === process.pid) {
      await unlink(LOCK_PATH);
    }
  } catch {
    // Ignore cleanup failures.
  }
  lockAcquired = false;
}

async function runBotWithRetry(): Promise<void> {
  await acquireInstanceLock();
  await registerBotCommands();

  while (!isShuttingDown) {
    try {
      console.log("[miftah-bot] Starting polling...");
      await bot.start({
        onStart: (info) => {
          console.log(`[miftah-bot] Running as @${info.username}`);
          console.log(
            `[miftah-bot] Auth: ${ALLOWED_CHAT_IDS.size > 0 ? `${ALLOWED_CHAT_IDS.size} allowed chat(s)` : "open (dev mode)"}`,
          );
        },
      });
      return;
    } catch (err) {
      if (isShuttingDown) return;
      console.error("[miftah-bot] Polling crashed, retrying in 5s:", err);
      await sleep(5000);
    }
  }
}

// Start polling
void runBotWithRetry();

// Graceful shutdown
const shutdown = () => {
  isShuttingDown = true;
  console.log("[miftah-bot] Shutting down...");
  bot.stop();
  void releaseInstanceLock();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

process.once("exit", () => {
  void releaseInstanceLock();
});
