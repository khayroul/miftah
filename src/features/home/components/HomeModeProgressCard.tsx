"use client";

import { OfflineAwareLink } from "@/components/OfflineAwareLink";

export type CardTone = "amber" | "indigo" | "stone" | "teal";

export interface ModeCard {
  badge?: string;
  detail?: string;
  lines: Array<{
    label: string;
    value: string;
  }>;
  percent: number;
  title: string;
  tone: CardTone;
  href: string;
  buttonLabel: string;
  onClick?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
  secondaryOnClick?: () => void;
}

export function toneClasses(tone: CardTone) {
  if (tone === "teal") {
    return {
      bar: "bg-teal-700 dark:bg-teal-300",
      border: "border-teal-900/18 dark:border-teal-300/18",
      chip: "border-teal-900/15 bg-teal-950/6 text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100",
      primaryButton: "bg-teal-900 text-teal-50 hover:bg-teal-800 dark:bg-teal-700 dark:text-white dark:hover:bg-teal-600",
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
      primaryButton: "bg-amber-600 text-amber-50 hover:bg-amber-500 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400",
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
      primaryButton: "bg-indigo-700 text-indigo-50 hover:bg-indigo-600 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500",
      surface:
        "bg-[linear-gradient(145deg,rgba(238,242,255,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(79,70,229,0.18),rgba(10,10,10,0.72))]",
      value: "text-indigo-900 dark:text-indigo-100",
    };
  }

  return {
    bar: "bg-stone-700 dark:bg-stone-300",
    border: "border-stone-900/10 dark:border-stone-300/14",
    chip: "border-stone-300/80 bg-stone-100/90 text-stone-700 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-200",
    primaryButton: "bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white",
    surface:
      "bg-[linear-gradient(145deg,rgba(250,250,249,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(41,37,36,0.8),rgba(10,10,10,0.72))]",
    value: "text-stone-900 dark:text-stone-100",
  };
}

export function shouldPrefetch(): boolean {
  return false;
}

export function HomeModeProgressCard({ card }: { card: ModeCard }) {
  const classes = toneClasses(card.tone);

  return (
    <article
      className={`animate-fade-in-up flex flex-col rounded-[28px] border p-5 shadow-[0_24px_70px_-42px_rgba(28,25,23,0.42)] backdrop-blur-sm ${classes.border} ${classes.surface}`}
    >
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
              Mod
            </p>
            <div className="mt-2 flex items-center gap-2">
              <h2 className="text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
                {card.title}
              </h2>
              {card.badge ? (
                <span className="rounded-full border border-amber-300/80 bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200">
                  {card.badge}
                </span>
              ) : null}
            </div>
          </div>
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            {card.percent}%
          </p>
        </div>

        <div className="mt-6">
          <div className="space-y-2.5">
            {card.lines.slice(0, 2).map((line) => (
              <div
                key={`${card.title}-${line.label}`}
                className="flex items-baseline justify-between gap-3"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                  {line.label}
                </p>
                <p className={`text-sm font-semibold ${classes.value}`}>
                  {line.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-stone-900/6 dark:bg-stone-950/70 dark:ring-white/8">
          <div
            className={`h-full rounded-full transition-all duration-500 ${classes.bar}`}
            style={{ width: `${card.percent}%` }}
          />
        </div>
        {card.detail ? (
          <p className="mt-2 text-xs text-stone-600 dark:text-stone-300">
            {card.detail}
          </p>
        ) : null}

      </div>

      <div className="mt-6">
        <OfflineAwareLink
          href={card.href}
          prefetch={shouldPrefetch()}
          onClick={card.onClick}
          className={`block w-full rounded-xl py-2.5 text-center text-sm font-medium transition ${
            card.tone === "teal"
              ? "bg-teal-800/10 text-teal-900 hover:bg-teal-800/15 dark:bg-teal-300/10 dark:text-teal-200 dark:hover:bg-teal-300/20"
              : card.tone === "amber"
                ? "bg-amber-800/10 text-amber-950 hover:bg-amber-800/15 dark:bg-amber-300/10 dark:text-amber-200 dark:hover:bg-amber-300/20"
                : card.tone === "indigo"
                  ? "bg-indigo-800/10 text-indigo-900 hover:bg-indigo-800/15 dark:bg-indigo-300/10 dark:text-indigo-200 dark:hover:bg-indigo-300/20"
                  : "bg-stone-900/5 text-stone-900 hover:bg-stone-900/10 dark:bg-stone-100/10 dark:text-stone-200 dark:hover:bg-stone-100/20"
          }`}
        >
          {card.buttonLabel}
        </OfflineAwareLink>
        {card.secondaryHref && card.secondaryLabel ? (
          <OfflineAwareLink
            href={card.secondaryHref}
            prefetch={shouldPrefetch()}
            onClick={card.secondaryOnClick}
            className="mt-2 block w-full rounded-xl border border-stone-300/80 bg-white/65 py-2.5 text-center text-sm font-medium text-stone-800 transition hover:bg-white/90 dark:border-stone-600 dark:bg-stone-900/55 dark:text-stone-100 dark:hover:bg-stone-800"
          >
            {card.secondaryLabel}
          </OfflineAwareLink>
        ) : null}
      </div>
    </article>
  );
}
