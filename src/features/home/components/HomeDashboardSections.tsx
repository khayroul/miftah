"use client";

import { OfflineAwareLink } from "@/components/OfflineAwareLink";
import { saveReadMode } from "@/lib/readMode";
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
  return (
    <div className="flex flex-col gap-10">
      {/* Activity Bar: Streaks & Goals */}
      <section className="animate-fade-in-up flex flex-wrap items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
              <svg
                className="h-7 w-7 text-amber-600 dark:text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {activitySnapshot && activitySnapshot.streak > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white shadow-lg ring-2 ring-white dark:ring-stone-900">
                  {activitySnapshot.streak}
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Streak Semasa
              </p>
              <p className="text-xl font-bold text-stone-900 dark:text-white">
                {activitySnapshot?.streak ?? 0} Hari
              </p>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-stone-200 dark:bg-stone-800 sm:block" />

          <div className="flex items-center gap-4">
            <div className={`relative h-14 w-14 transition-transform duration-500 ${goalProgressPct >= 100 ? "scale-110" : ""}`}>
              <svg className="h-14 w-14 -rotate-90">
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-stone-100 dark:text-stone-800"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - goalProgressPct / 100)}
                  strokeLinecap="round"
                  className={`${goalProgressPct >= 100 ? "text-emerald-500" : "text-teal-600 dark:text-teal-400"} transition-all duration-1000`}
                />
              </svg>
              <div className={`absolute inset-0 flex items-center justify-center font-bold ${goalProgressPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-teal-700 dark:text-teal-300"}`}>
                {goalProgressPct >= 100 ? (
                  <svg className="h-6 w-6 animate-bounce-in" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                    <path d="M20 6L9 17L4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="text-[10px]">{goalProgressPct}%</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Sasaran Harian
              </p>
              <p className="text-xl font-bold text-stone-900 dark:text-white">
                {activitySummaryLabel}
              </p>
            </div>
          </div>
        </div>

      </section>

      {legacyHifzGoalRecommendation ? (
        <section className="animate-fade-in-up rounded-[28px] border border-amber-200/80 bg-amber-50/85 p-5 shadow-sm backdrop-blur-sm dark:border-amber-700/30 dark:bg-amber-950/25">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-800 dark:text-amber-300">
                Legacy Hifz Goal
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                Tukar sasaran Hafal daripada ayat kepada halaman
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                Sasaran semasa anda masih guna unit ayat. Miftah sekarang tunjuk progres Hafal dalam halaman, jadi kami cadangkan tukar
                {" "}
                <strong>{legacyHifzGoalRecommendation.currentAyahGoal} ayat</strong>
                {" "}
                kepada
                {" "}
                <strong>{legacyHifzGoalRecommendation.suggestedPageGoal} halaman</strong>
                {" "}
                supaya sasaran harian, papan pemuka, dan plan Hafal guna unit yang sama.
              </p>
              {hifzGoalMigrationError ? (
                <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">
                  {hifzGoalMigrationError}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleMigrateLegacyHifzGoal}
              disabled={submittingHifzGoalMigration || migratingHifzGoal}
              className="inline-flex items-center justify-center rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
            >
              {submittingHifzGoalMigration || migratingHifzGoal
                ? "Menukar..."
                : "Tukar ke Halaman"}
            </button>
          </div>
        </section>
      ) : null}

      <section
        className={`animate-fade-in-up relative overflow-hidden rounded-[36px] border p-6 shadow-[0_30px_100px_-50px_rgba(28,25,23,0.52)] backdrop-blur-md sm:p-8 ${heroClasses.border} ${heroClasses.surface}`}
      >
        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.18fr_0.82fr] xl:items-end">
          <div className="max-w-3xl">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${heroClasses.chip}`}
            >
              {homeHero.badge}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 sm:text-5xl">
              {homeHero.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
              {homeHero.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <OfflineAwareLink
                href={homeHero.primaryHref}
                prefetch={shouldPrefetch()}
                onClick={() => {
                  saveReadMode(homeHero.primaryMode);
                }}
                className={`inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold transition ${heroClasses.primaryButton}`}
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
                  className="inline-flex items-center justify-center rounded-2xl border border-stone-300/80 bg-white/75 px-6 py-3 text-sm font-medium text-stone-800 transition hover:bg-white dark:border-stone-600 dark:bg-stone-900/60 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  {homeHero.secondaryLabel}
                </OfflineAwareLink>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {homeHero.stats.map((item) => (
              <div
                key={`${item.label}-${item.value}`}
                className="rounded-[24px] border border-white/60 bg-white/72 p-4 shadow-[0_20px_60px_-45px_rgba(28,25,23,0.45)] backdrop-blur-sm dark:border-white/8 dark:bg-stone-950/42"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                  {item.label}
                </p>
                <p className={`mt-2 text-base font-semibold ${heroClasses.value}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-stone-300/8 blur-3xl dark:bg-stone-400/6" />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
              Mod lain
            </p>
            <h2 className="mt-1 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
              Semua laluan masih tersedia
            </h2>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modeCards.map((card) => (
            <HomeModeProgressCard key={card.title} card={card} />
          ))}
        </div>
      </section>
    </div>
  );
}
