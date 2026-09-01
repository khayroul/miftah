"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type AppLocale } from "@/i18n/config";

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("languageToggle");

  const isMalay = locale === "ms";
  const nextLocale: AppLocale = isMalay ? "en" : "ms";
  const label = isMalay ? t("toEnglish") : t("toMalay");

  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${nextLocale};path=/;max-age=31536000;samesite=lax`;
        router.refresh();
      }}
      aria-label={label}
      title={label}
      className="ui-touch-target inline-flex w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase tracking-wider text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900"
    >
      {nextLocale === "en" ? "EN" : "BM"}
    </button>
  );
}
