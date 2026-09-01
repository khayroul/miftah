"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export type CardTone = "teal" | "amber" | "indigo" | "stone";

export interface ModeCard {
  ctaLabel: string;
  helper: string;
  href: string;
  inside: string[];
  metricLabel: string;
  metricValue: string;
  percent: number;
  previewOnly?: boolean;
  title: string;
  tone: CardTone;
}
function toneClasses(tone: CardTone) {
  if (tone === "teal") {
    return {
      bar: "bg-teal-700 dark:bg-teal-300",
      border: "border-teal-900/18 dark:border-teal-300/18",
      chip: "border-teal-900/15 bg-teal-950/6 text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100",
      surface:
        "bg-[linear-gradient(145deg,rgba(240,253,250,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(15,118,110,0.2),rgba(10,10,10,0.72))]",
      value: "text-teal-900 dark:text-teal-100",
    };
  }

  if (tone === "amber") {
    return {
      bar: "bg-amber-600 dark:bg-amber-300",
      border: "border-amber-900/15 dark:border-amber-300/18",
      chip: "border-amber-900/15 bg-amber-100/70 text-amber-900 dark:border-amber-300/18 dark:bg-amber-900/30 dark:text-amber-100",
      surface:
        "bg-[linear-gradient(145deg,rgba(255,251,235,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(217,119,6,0.18),rgba(10,10,10,0.72))]",
      value: "text-amber-900 dark:text-amber-100",
    };
  }

  if (tone === "indigo") {
    return {
      bar: "bg-indigo-700 dark:bg-indigo-300",
      border: "border-indigo-900/15 dark:border-indigo-300/18",
      chip: "border-indigo-900/15 bg-indigo-100/70 text-indigo-900 dark:border-indigo-300/18 dark:bg-indigo-900/30 dark:text-indigo-100",
      surface:
        "bg-[linear-gradient(145deg,rgba(238,242,255,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(79,70,229,0.18),rgba(10,10,10,0.72))]",
      value: "text-indigo-900 dark:text-indigo-100",
    };
  }

  return {
    bar: "bg-stone-700 dark:bg-stone-300",
    border: "border-stone-900/10 dark:border-stone-300/14",
    chip: "border-stone-300/80 bg-stone-100/90 text-stone-700 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-200",
    surface:
      "bg-[linear-gradient(145deg,rgba(250,250,249,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(41,37,36,0.8),rgba(10,10,10,0.72))]",
    value: "text-stone-900 dark:text-stone-100",
  };
}

function shouldPrefetch(): boolean {
  return false;
}

export function DashboardPreviewModeCard({
  card,
}: {
  card: ModeCard;
}) {
  const t = useTranslations("home.preview");
  const classes = toneClasses(card.tone);

  return (
    <article
      className={`animate-fade-in-up rounded-[28px] border p-5 shadow-[0_24px_70px_-42px_rgba(28,25,23,0.42)] backdrop-blur-sm ${classes.border} ${classes.surface}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
            {card.previewOnly ? t("badgeProposal") : t("badgeLive")}
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
            {card.title}
          </h2>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${classes.chip}`}
        >
          {card.previewOnly ? t("chipSampleMetric") : t("chipReadyToUse")}
        </span>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <div className={`text-4xl font-semibold tracking-tight ${classes.value}`}>
            {card.metricValue}
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {card.metricLabel}
          </p>
        </div>
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
          {card.percent}%
        </p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-stone-900/6 dark:bg-stone-950/70 dark:ring-white/8">
        <div
          className={`h-full rounded-full transition-all duration-500 ${classes.bar} ${
            card.previewOnly ? "opacity-80" : ""
          }`}
          style={{ width: `${card.percent}%` }}
        />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
        {card.helper}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {card.inside.map((item) => (
          <span
            key={`${card.title}-${item}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${classes.chip}`}
          >
            {item}
          </span>
        ))}
      </div>

      <Link
        href={card.href}
        prefetch={shouldPrefetch()}
        className="mt-6 inline-flex rounded-xl border border-stone-900/10 bg-white/80 px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-white dark:border-white/10 dark:bg-stone-950/60 dark:text-stone-100 dark:hover:bg-stone-950"
      >
        {card.ctaLabel}
      </Link>
    </article>
  );
}
