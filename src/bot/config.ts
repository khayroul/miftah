export const USER_ID =
  process.env.MIFTAH_USER_ID ?? "00000000-0000-0000-0000-000000000001";

export const ALLOWED_CHAT_IDS = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export const HIFZ_CONFIG = {
  sabak_size: 10,
  sabqi_window_days: 7,
  manzil_daily_pages: 2,
  blanking_levels: [0.3, 0.6, 0.9, 1.0] as const,
} as const;
