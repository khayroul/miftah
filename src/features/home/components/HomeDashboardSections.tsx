"use client";

import { useTranslations } from "next-intl";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";
import { saveReadMode } from "@/features/read";
import type { HomeDashboardSnapshot } from "../domain/homeDashboard";
import type { HomeHeroAction } from "../domain/homeDashboardHero";
import {
  HomeModeProgressCard,
  shouldPrefetch,
  toneClasses,
  type ModeCard,
} from "./HomeModeProgressCard";

type LegacyHifzGoalRecommendation = NonNullable<
  NonNullable<HomeDashboardSnapshot["activity"]>["legacyHifzGoalRecommendation"]
>;

interface HomeDashboardSectionsProps {
  activitySnapshot: HomeDashboardSnapshot["activity"];
  activitySummaryLabel: string;
  goalProgressPct: number;
  handleMigrateLegacyHifzGoal: () => Promise<void>;
  heroClasses: ReturnType<typeof toneClasses>;
  hifzGoalMigrationError: string | null;
  homeHero: HomeHeroAction;
  legacyHifzGoalRecommendation: LegacyHifzGoalRecommendation | null;
  migratingHifzGoal: boolean;
  modeCards: ModeCard[];
  submittingHifzGoalMigration: boolean;
}
export function HomeDashboardSections({
  activitySnapshot,
  activitySummaryLabel,
  goalProgressPct,
  handleMigrateLegacyHifzGoal,
  heroClasses,
  hifzGoalMigrationError,
  homeHero,
  legacyHifzGoalRecommendation,
  migratingHifzGoal,
  modeCards,
  submittingHifzGoalMigration,
}: HomeDashboardSectionsProps) {
  const t = useTranslations("home.sections");
  return (
    <div className="flex flex-col gap-6">
      <section
        className={`animate-fade-in-up relative overflow-hidden rounded-[30px] border p-5 shadow-[0_26px_80px_-48px_rgba(28,25,23,0.5)] backdrop-blur-md sm:p-7 ${heroClasses.border} ${heroClasses.surface}`}
      >
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="max-w-3xl">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${heroClasses.chip}`}
            >
              {homeHero.badge}
            </span>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
              {homeHero.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600 sm:text-base dark:text-stone-300">
              {homeHero.description}
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <OfflineAwareLink
                href={homeHero.primaryHref}
                prefetch={shouldPrefetch()}
                onClick={() => {
                  saveReadMode(homeHero.primaryMode);
                }}
                className={`ui-touch-target inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900 ${heroClasses.primaryButton}`}
              >
                {homeHero.primaryLabel}
              </OfflineAwareLink>
              {homeHero.secondaryHref && homeHero.secondaryLabel ? (
                <OfflineAwareLink
                  href={homeHero.secondaryHref}
                  prefetch={shouldPrefetch()}
                  onClick={() => {
                    if (homeHero.secondaryMode) {
                      saveReadMode(homeHero.secondaryMode);
                    }
                  }}
                  className="ui-touch-target inline-flex items-center justify-center rounded-2xl border border-stone-300/80 bg-white/75 px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:border-stone-600 dark:bg-stone-900/60 dark:text-stone-100 dark:hover:bg-stone-800 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900"
                >
                  {homeHero.secondaryLabel}
                </OfflineAwareLink>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {homeHero.stats.map((item) => (
              <div
                key={`${item.label}-${item.value}`}
                className="min-w-0 rounded-[20px] border border-white/60 bg-white/72 p-3 shadow-[0_18px_52px_-44px_rgba(28,25,23,0.45)] backdrop-blur-sm dark:border-white/8 dark:bg-stone-950/42"
              >
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                  {item.label}
                </p>
                <p className={`mt-1 line-clamp-2 text-sm font-semibold leading-snug ${heroClasses.value}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-stone-300/8 blur-3xl dark:bg-stone-400/6" />
      </section>

      <section
        className="ui-surface animate-fade-in-up grid grid-cols-[auto_1px_minmax(0,1fr)] items-center gap-4 rounded-[24px] px-4 py-3.5 sm:px-5"
        aria-label={t("routineSummaryAriaLabel")}
      >
        <div className="min-w-[72px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
            {t("streakLabel")}
          </p>
          <p className="mt-1 text-lg font-semibold text-stone-900 dark:text-stone-50">
            {t("streakDaysValue", { count: activitySnapshot?.streak ?? 0 })}
          </p>
        </div>
        <div className="h-10 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                {t("todayGoalLabel")}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-stone-900 sm:text-base dark:text-stone-50">
                {activitySummaryLabel}
              </p>
            </div>
            <span
              className={`shrink-0 text-sm font-semibold ${
                goalProgressPct >= 100
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-teal-800 dark:text-teal-200"
              }`}
            >
              {goalProgressPct}%
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-700/80"
            role="progressbar"
            aria-label={t("dailyGoalProgressAriaLabel")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goalProgressPct}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                goalProgressPct >= 100
                  ? "bg-emerald-600 dark:bg-emerald-300"
                  : "bg-teal-700 dark:bg-teal-300"
              }`}
              style={{ width: `${goalProgressPct}%` }}
            />
          </div>
        </div>
      </section>

      {legacyHifzGoalRecommendation ? (
        <section className="animate-fade-in-up rounded-[24px] border border-amber-200/80 bg-amber-50/85 p-4 shadow-sm backdrop-blur-sm sm:p-5 dark:border-amber-700/30 dark:bg-amber-950/25">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">
                {t("oneTimeUpdateLabel")}
              </p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                {t("alignHifzGoalTitle")}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                {t.rich("alignHifzGoalDescription", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                  ayat: legacyHifzGoalRecommendation.currentAyahGoal,
                  halaman: legacyHifzGoalRecommendation.suggestedPageGoal,
                })}
              </p>
              {hifzGoalMigrationError ? (
                <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                  {hifzGoalMigrationError}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleMigrateLegacyHifzGoal}
              disabled={submittingHifzGoalMigration || migratingHifzGoal}
              className="ui-touch-target inline-flex shrink-0 items-center justify-center rounded-2xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
            >
              {submittingHifzGoalMigration || migratingHifzGoal
                ? t("migratingLabel")
                : t("switchToPagesLabel")}
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            {t("choosePathLabel")}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            {t("learnByNeedTitle")}
          </h2>
        </div>

        <article className="animate-fade-in-up overflow-hidden rounded-[24px] border border-teal-900/15 bg-[linear-gradient(135deg,rgba(240,253,250,0.96),rgba(255,255,255,0.86))] p-4 shadow-[0_20px_60px_-42px_rgba(20,94,89,0.42)] dark:border-teal-300/18 dark:bg-[linear-gradient(135deg,rgba(15,118,110,0.2),rgba(10,10,10,0.72))]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-900 text-teal-50 dark:bg-teal-200 dark:text-teal-950">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 0 0 6-6V9a6 6 0 1 0-12 0v3.75a6 6 0 0 0 6 6Zm0 0V22m-3 0h6M9 12.75a3 3 0 0 0 6 0V9a3 3 0 1 0-6 0v3.75Z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-800 dark:text-teal-200">
                  {t("tasmiEyebrow")}
                </p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  {t("tasmiCardTitle")}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  {t("tasmiCardDescription")}
                </p>
              </div>
            </div>
            <OfflineAwareLink
              href="/tasmi/juzuk"
              prefetch={false}
              onClick={() => saveReadMode("hifz")}
              className="ui-touch-target inline-flex shrink-0 items-center justify-center rounded-2xl bg-teal-900 px-5 py-2.5 text-sm font-semibold text-teal-50 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:bg-teal-200 dark:text-teal-950 dark:hover:bg-teal-100 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-900"
            >
              {t("tasmiCta")}
            </OfflineAwareLink>
          </div>
        </article>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {modeCards.map((card) => (
            <HomeModeProgressCard key={card.title} card={card} />
          ))}
        </div>
      </section>
    </div>
  );
}
