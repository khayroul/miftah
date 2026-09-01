export const LOCALES = ["ms", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "ms";
export const LOCALE_COOKIE = "NEXT_LOCALE";
