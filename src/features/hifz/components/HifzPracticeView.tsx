"use client";

import { useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ensureGlobalMushafFonts,
  getAyahKeyFromLocation,
  splitWordGlyphs,
  useMushafFont,
  type MushafAyahDetail,
  type MushafLayoutPage,
  type MushafLayoutWord,
} from "@/mushaf";

export type HifzPracticeViewMode = "ayah" | "mushaf";

interface HifzPracticeViewToggleProps {
  value: HifzPracticeViewMode;
  onChange: (value: HifzPracticeViewMode) => void;
}

function AyahIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 7.5h14M5 12h9M5 16.5h12" strokeLinecap="round" />
    </svg>
  );
}

function MushafIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 5.5A3.5 3.5 0 0 1 8 2h4v17H8a3.5 3.5 0 0 0-3.5 3V5.5Z" />
      <path d="M19.5 5.5A3.5 3.5 0 0 0 16 2h-4v17h4a3.5 3.5 0 0 1 3.5 3V5.5Z" />
    </svg>
  );
}

export function HifzPracticeViewToggle({
  value,
  onChange,
}: HifzPracticeViewToggleProps) {
  const t = useTranslations("hifz.practiceView");
  const options: Array<{
    icon: React.ReactNode;
    label: string;
    value: HifzPracticeViewMode;
  }> = [
    { icon: <AyahIcon key="ayah-icon" />, label: t("ayahView"), value: "ayah" },
    { icon: <MushafIcon key="mushaf-icon" />, label: t("mushafView"), value: "mushaf" },
  ];

  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-muted">{t("viewLabel")}</p>
      <div
        className="inline-flex rounded-xl border border-border-subtle bg-surface-muted p-1"
        role="group"
        aria-label={t("viewLabel")}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`ui-touch-target inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                active
                  ? "bg-surface-solid text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HifzPracticeCover({ onReveal }: { onReveal?: () => void }) {
  const t = useTranslations("hifz.practiceView");
  return (
    <section className="flex h-full min-h-[25rem] w-full flex-col items-center justify-center rounded-2xl bg-[#10213a] px-6 py-12 text-center text-white shadow-[0_18px_46px_rgba(15,23,42,0.22)] dark:bg-[#081426]">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10">
        <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 3l18 18M10.7 10.8a2 2 0 0 0 2.5 2.5M9.9 4.2A10.6 10.6 0 0 1 12 4c5.5 0 9 5 9 5a15.5 15.5 0 0 1-2.1 2.6M6.2 6.2C4.2 7.5 3 9 3 9s3.5 5 9 5c.7 0 1.4-.1 2-.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-[-0.02em]">{t("hiddenTitle")}</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-slate-200">{t("hiddenBody")}</p>
      {onReveal ? (
        <button
          type="button"
          onClick={onReveal}
          className="ui-touch-target mt-7 rounded-xl bg-teal-400 px-6 text-sm font-bold text-teal-950 transition-colors hover:bg-teal-300"
        >
          {t("revealCta")}
        </button>
      ) : null}
    </section>
  );
}

interface HifzAyahPracticeViewProps {
  activePlaybackAyahKey: string | null;
  ayahDetails: MushafAyahDetail[];
  hidden: boolean;
  layout: MushafLayoutPage;
  onAyahAudioTap: (ayahKey: string) => void;
  onReveal?: () => void;
  pageNumber: number;
  targetAyahKeys: string[];
}

interface PracticeAyah {
  detail: MushafAyahDetail;
  words: MushafLayoutWord[];
}

function groupWordsByAyah(layout: MushafLayoutPage): Map<string, MushafLayoutWord[]> {
  const grouped = new Map<string, MushafLayoutWord[]>();
  for (const line of layout.lines) {
    if (line.type !== "text") continue;
    for (const word of line.words ?? []) {
      const ayahKey = getAyahKeyFromLocation(word.location);
      if (!ayahKey) continue;
      grouped.set(ayahKey, [...(grouped.get(ayahKey) ?? []), word]);
    }
  }
  return grouped;
}

function QcfAyah({
  fontFamily,
  words,
}: {
  fontFamily: string;
  words: MushafLayoutWord[];
}) {
  return (
    <div
      className="flex flex-wrap justify-end gap-x-1.5 gap-y-3 text-right text-[2.25rem] leading-[1.9] sm:text-[2.65rem]"
      dir="rtl"
      lang="ar"
      style={{ fontFamily: `'${fontFamily}', serif` }}
    >
      {words.map((word, index) => {
        const glyphs = splitWordGlyphs(word);
        return (
          <span key={`${word.location}-${index}`} className="inline-flex">
            {glyphs.prefix.map((glyph, glyphIndex) => (
              <span key={`prefix-${glyphIndex}`}>{glyph}</span>
            ))}
            <span>{glyphs.core}</span>
            {glyphs.suffix.map((glyph, glyphIndex) => (
              <span key={`suffix-${glyphIndex}`}>{glyph}</span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

export function HifzAyahPracticeView({
  activePlaybackAyahKey,
  ayahDetails,
  hidden,
  layout,
  onAyahAudioTap,
  onReveal,
  pageNumber,
  targetAyahKeys,
}: HifzAyahPracticeViewProps) {
  const t = useTranslations("hifz.practiceView");
  const locale = useLocale();
  const { loaded, fontFamily } = useMushafFont(pageNumber);

  useEffect(() => {
    ensureGlobalMushafFonts();
  }, []);

  const ayahs = useMemo<PracticeAyah[]>(() => {
    const targetSet = new Set(targetAyahKeys);
    const wordsByAyah = groupWordsByAyah(layout);
    const requested = targetSet.size > 0
      ? ayahDetails.filter((ayah) => targetSet.has(ayah.key))
      : ayahDetails;
    return requested
      .map((detail) => ({ detail, words: wordsByAyah.get(detail.key) ?? [] }))
      .filter((ayah) => ayah.words.length > 0);
  }, [ayahDetails, layout, targetAyahKeys]);

  if (hidden) {
    return <HifzPracticeCover onReveal={onReveal} />;
  }

  return (
    <div className="space-y-4" style={loaded ? undefined : { visibility: "hidden" }}>
      {ayahs.map(({ detail, words }) => {
        const translation = locale === "ms" ? detail.bm : detail.en;
        const isPlaying = activePlaybackAyahKey === detail.key;
        return (
          <article
            key={detail.key}
            className={`rounded-2xl border bg-surface-solid px-5 py-6 transition-colors sm:px-7 ${
              isPlaying ? "border-teal-500" : "border-border-subtle"
            }`}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-muted">{t("ayahLabel", { key: detail.label })}</span>
              <button
                type="button"
                onClick={() => onAyahAudioTap(detail.key)}
                className="ui-touch-target inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand transition-colors hover:bg-surface-muted"
                aria-label={t("listenAria", { key: detail.label })}
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" strokeLinejoin="round" />
                  <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" strokeLinecap="round" />
                </svg>
                {isPlaying ? t("playing") : t("listen")}
              </button>
            </div>
            <QcfAyah fontFamily={fontFamily} words={words} />
            {translation ? (
              <p className="mt-6 border-t border-border-subtle pt-4 text-base leading-7 text-muted">
                {translation}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
