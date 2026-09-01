"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { onSwUpdate, skipWaitingAndReload } from "../swRegistration";

export function UpdateBanner() {
  const t = useTranslations("pwa");
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    return onSwUpdate(() => setShowUpdate(true));
  }, []);

  if (!showUpdate) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-teal-200/70 bg-stone-950/95 p-2 pl-4 text-stone-50 shadow-[0_16px_42px_rgba(28,25,23,0.3)] backdrop-blur-sm dark:border-teal-300/20 dark:bg-stone-100/95 dark:text-stone-950"
    >
      <span className="text-sm">{t("updateAvailable")}</span>
      <button
        type="button"
        onClick={skipWaitingAndReload}
        className="ui-touch-target inline-flex shrink-0 items-center justify-center rounded-xl bg-teal-500 px-4 text-sm font-semibold text-stone-950 transition hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950 dark:bg-teal-700 dark:text-white dark:hover:bg-teal-600 dark:focus-visible:ring-teal-700 dark:focus-visible:ring-offset-stone-100"
      >
        {t("updateAction")}
      </button>
    </div>
  );
}
