import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Bot } from "grammy";
import { ALLOWED_CHAT_IDS } from "./config.js";
import { handleStart } from "./handlers/start.js";
import { handleVocab } from "./handlers/vocab.js";
import { handleHifz } from "./handlers/hifz.js";
import { handleStats } from "./handlers/stats.js";
import { handleCallback } from "./handlers/callback.js";
import { handlePage } from "./handlers/page.js";
import { handleAsk } from "./handlers/ask.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

const bot = new Bot(token);

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

// Callback queries (inline keyboard presses)
bot.on("callback_query:data", handleCallback);

// Catch-all: route free text through LLM (or show help if no LLM)
bot.on("message:text", handleAsk);

// Error handler
bot.catch((err) => {
  console.error("[bot] Error:", err.error);
});

// Set bot commands (replaces any old menu from previous bot)
bot.api.setMyCommands([
  { command: "start", description: "Pelan harian" },
  { command: "hifz", description: "Sesi hafalan (Sabqi/Sabak/Manzil)" },
  { command: "vocab", description: "Latihan vocab" },
  { command: "page", description: "Lihat halaman mushaf" },
  { command: "stats", description: "Statistik" },
  { command: "ask", description: "Tanya tentang Al-Quran" },
]);

// Start polling
bot.start({
  onStart: (info) => {
    console.log(`[miftah-bot] Running as @${info.username}`);
    console.log(
      `[miftah-bot] Auth: ${ALLOWED_CHAT_IDS.size > 0 ? `${ALLOWED_CHAT_IDS.size} allowed chat(s)` : "open (dev mode)"}`,
    );
  },
});

// Graceful shutdown
const shutdown = () => {
  console.log("[miftah-bot] Shutting down...");
  bot.stop();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
