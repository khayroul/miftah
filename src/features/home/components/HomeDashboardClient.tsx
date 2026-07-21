"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { SurahJumpTarget } from "@/lib/readNavigation";
import { findMarkerForPage, saveReadMode, useReadingProgressState } from "@/features/read";
import type { HomeDashboardSnapshot } from "../domain/homeDashboard";
import { buildHomeHero, type HomeHeroTranslator } from "../domain/homeDashboardHero";
import {
  emptyHomeDashboardSnapshot,
  hasHomeDashboardData,
  loadHomeDashboardSnapshotCache,
  saveHomeDashboardSnapshotCache,
} from "../domain/homeDashboardStorage";
import { HomeDashboardSections } from "./HomeDashboardSections";
import { toneClasses, type ModeCard } from "./HomeModeProgressCard";

const TOTAL_QURAN_PAGES = 604;

const INTL_LOCALE_BY_APP_LOCALE: Record<string, string> = {
  en: "en-US",
  ms: "ms-MY",
};

interface HomeDashboardClientProps {
  authUserId: string | null;
  initialSnapshot: HomeDashboardSnapshot;
  surahTargets: SurahJumpTarget[];
}

interface HifzGoalMigrationOverride {
  dailyGoalCount: number;
  dailyGoalType: "hifz_pages";
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatActivityDate(
  t: HomeHeroTranslator,
  intlLocale: string,
  value: string | null,
): string {
  if (!value) {
    return t("noActivityYet");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("newActivity");
  }

  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function isWithinRecentDays(value: string | null, days: number): boolean {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}
function buildHifzMushafHref(input: {
  page: number;
  block: "sabqi" | "sabak" | "manzil" | null;
  ayahKey: string | null;
}): string {
  const params = new URLSearchParams({
    mode: "hifz",
    from: "dashboard",
  });
  if (input.block) {
    params.set("block", input.block);
  }
  if (input.ayahKey) {
    params.set("ayah", input.ayahKey);
  }
  return `/read/${input.page}?${params.toString()}`;
}


export function HomeDashboardClient({
  authUserId,
  initialSnapshot,
  surahTargets,
}: HomeDashboardClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = INTL_LOCALE_BY_APP_LOCALE[locale] ?? "ms-MY";
  const tHero = useTranslations("home.hero");
  const tDash = useTranslations("home.dashboard");
  const tNav = useTranslations("nav");
  const [snapshot, setSnapshot] = useState<HomeDashboardSnapshot>(initialSnapshot);
  const [migratingHifzGoal, startMigratingHifzGoal] = useTransition();
  const [submittingHifzGoalMigration, setSubmittingHifzGoalMigration] =
    useState(false);
  const [hifzGoalMigrationError, setHifzGoalMigrationError] = useState<string | null>(
    null,
  );
  const [hifzGoalMigrationOverride, setHifzGoalMigrationOverride] =
    useState<HifzGoalMigrationOverride | null>(null);
  const readingState = useReadingProgressState();

  useEffect(() => {
    if (!authUserId) {
      setSnapshot(emptyHomeDashboardSnapshot());
      return;
    }

    if (hasHomeDashboardData(initialSnapshot)) {
      setSnapshot(initialSnapshot);
      return;
    }

    const cachedSnapshot = loadHomeDashboardSnapshotCache(authUserId);
    setSnapshot(cachedSnapshot ?? initialSnapshot);
  }, [authUserId, initialSnapshot]);

  useEffect(() => {
    if (!authUserId || !hasHomeDashboardData(snapshot)) {
      return;
    }

    saveHomeDashboardSnapshotCache(authUserId, snapshot);
  }, [authUserId, snapshot]);

  const readSnapshot = snapshot.read;
  const continuePage = readSnapshot?.lastPage ?? readingState.lastPage ?? 1;
  const localReadLifetimeFloor = readingState.lastPage ? 1 : 0;
  const localReadRecentFloor =
    readingState.lastPage && isWithinRecentDays(readingState.lastReadAt, 7) ? 1 : 0;
  const uniquePagesLifetime = Math.max(
    readSnapshot?.uniquePagesLifetime ?? 0,
    localReadLifetimeFloor,
  );
  const uniquePages7d = Math.max(
    readSnapshot?.uniquePages7d ?? 0,
    localReadRecentFloor,
  );
  const readingPositionPct = clampPercent(
    (uniquePagesLifetime / TOTAL_QURAN_PAGES) * 100,
  );
  const formattedLastRead = formatActivityDate(
    tDash,
    intlLocale,
    readSnapshot?.lastReadAt ?? readingState.lastReadAt,
  );
  const activeSurah = useMemo(() => {
    const markers = surahTargets.map((target) => ({
      id: target.surah,
      name: target.name,
      page: target.page,
    }));

    return findMarkerForPage(markers, continuePage);
  }, [continuePage, surahTargets]);
  const activeSurahId = activeSurah?.id ?? 1;
  const fahamLevel = snapshot.faham?.levelProgress ?? null;
  const currentFahamCap = snapshot.faham?.focusWordLimit ?? 1000;
  const nextFahamCapLabel = fahamLevel?.nextWordLimit
    ? `${Math.round(fahamLevel.nextWordLimit / 1000)}k`
    : tDash("nextCapFallback");
  const hifzReadTargetPage = snapshot.hifz?.nextPage ?? continuePage;
  const hifzReadHref = buildHifzMushafHref({
    page: hifzReadTargetPage,
    block: snapshot.hifz?.nextBlock ?? null,
    ayahKey: snapshot.hifz?.nextAyahKey ?? null,
  });
  const homeHero =
    buildHomeHero({
      activeSurahId,
      activeSurahName: activeSurah?.name ?? null,
      continuePage,
      formattedLastRead,
      hifzReadHref,
      snapshot,
      t: tHero as unknown as HomeHeroTranslator,
    });
  const heroClasses = toneClasses(homeHero.tone);
  const activitySnapshot = useMemo(() => {
    if (!snapshot.activity) {
      return null;
    }
    if (!hifzGoalMigrationOverride) {
      return snapshot.activity;
    }

    return {
      ...snapshot.activity,
      dailyGoalCount: hifzGoalMigrationOverride.dailyGoalCount,
      dailyGoalType: hifzGoalMigrationOverride.dailyGoalType,
      legacyHifzGoalRecommendation: null,
    };
  }, [hifzGoalMigrationOverride, snapshot.activity]);

  const modeCards: ModeCard[] = [
    {
      lines: [
        {
          label: tDash("statCoverage"),
          value: `${uniquePagesLifetime} / ${TOTAL_QURAN_PAGES} ${tDash("unitPages")}`,
        },
        {
          label: tDash("stat7Days"),
          value: tHero("pagesCount", { count: uniquePages7d }),
        },
      ],
      percent: readingPositionPct,
      title: tNav("read"),
      tone: "teal",
      href: `/read/${continuePage}`,
      buttonLabel:
        continuePage > 1
          ? tHero("primaryLabelContinueRead")
          : tHero("primaryLabelStartRead"),
    },
    {
      lines: snapshot.faham
        ? [
            {
              label: tHero("statDiscovered"),
              value: `${snapshot.faham.encounteredWordCount} / ${snapshot.faham.focusWordLimit}`,
            },
            {
              label: tHero("statMastered"),
              value: `${snapshot.faham.masteredWordCount} / ${snapshot.faham.encounteredWordCount}`,
            },
          ]
        : [
            { label: tHero("statDiscovered"), value: `0 / ${currentFahamCap}` },
            { label: tHero("statMastered"), value: "0 / 0" },
          ],
      badge: fahamLevel ? `L${fahamLevel.activeLevel}` : undefined,
      detail: fahamLevel
        ? fahamLevel.isMaxLevel
          ? tDash("maxLevelUnlocked")
          : tDash("nextLevelUnlock", {
              level: fahamLevel.nextLevel ?? fahamLevel.activeLevel + 1,
              cap: nextFahamCapLabel,
            })
        : undefined,
      percent: snapshot.faham?.exposureProgressPct ?? 0,
      title: tNav("faham"),
      tone: "amber",
      href: "/faham",
      buttonLabel: snapshot.faham?.dueCount
        ? tHero("primaryLabelStartReview")
        : tHero("primaryLabelOpenFaham"),
    },
    {
      lines: snapshot.tema && snapshot.tema.totalChunks > 0
        ? [
            {
              label: tDash("statExplored"),
              value: `${snapshot.tema.exploredCount} / ${snapshot.tema.totalChunks}`,
            },
            {
              label: tHero("statDone"),
              value: `${snapshot.tema.completedCount}`,
            },
          ]
        : [
            { label: tDash("statExplored"), value: "0 / 0" },
            { label: tHero("statDone"), value: "0" },
          ],
      percent: snapshot.tema?.exploredPct ?? 0,
      title: tNav("tema"),
      tone: "indigo",
      href: `/read/surah/${activeSurahId}/themes`,
      buttonLabel: tHero("primaryLabelExploreTema"),
    },
    {
      lines: snapshot.hifz
        ? [
            {
              label: tDash("statManzil"),
              value: tHero("pagesCount", { count: snapshot.hifz.totalManzilPages }),
            },
            {
              label: tDash("statTodayReview"),
              value: tHero("pagesCount", { count: snapshot.hifz.dueTodayPages }),
            },
          ]
        : [
            { label: tDash("statManzil"), value: tHero("pagesCount", { count: 0 }) },
            { label: tDash("statTodayReview"), value: tHero("pagesCount", { count: 0 }) },
          ],
      percent: snapshot.hifz?.manzilCoveragePct ?? 0,
      title: tNav("hifz"),
      tone: "stone",
      href: "/hifz",
      buttonLabel: tDash("primaryLabelOpenHifzPlan"),
      detail: snapshot.hifz?.nextPageLabel
        ? tDash("nextReferenceLabel", { label: snapshot.hifz.nextPageLabel })
        : tDash("noNextReferenceToday"),
      onClick: () => saveReadMode("hifz"),
      secondaryHref: hifzReadHref,
      secondaryLabel: tHero("primaryLabelContinueMushaf"),
      secondaryOnClick: () => saveReadMode("hifz"),
    },
  ];
  const goalTypeLabel =
    activitySnapshot?.dailyGoalType === "faham_words"
      ? tDash("unitWords")
      : activitySnapshot?.dailyGoalType === "read_pages"
        ? tDash("unitPages")
        : activitySnapshot?.dailyGoalType === "hifz_ayat"
          ? tDash("unitAyat")
          : activitySnapshot?.dailyGoalType === "hifz_pages"
            ? tDash("unitPages")
          : activitySnapshot?.dailyGoalType === "theme_chunks"
            ? tDash("unitTema")
            : tDash("unitPages");
  const activitySummaryLabel = `${activitySnapshot?.todayProgress ?? 0} / ${
    activitySnapshot?.dailyGoalCount ?? 10
  } ${goalTypeLabel}`;

  const goalProgressPct = clampPercent(
    activitySnapshot
      ? (activitySnapshot.todayProgress / activitySnapshot.dailyGoalCount) * 100
      : 0,
  );
  const legacyHifzGoalRecommendation =
    activitySnapshot?.legacyHifzGoalRecommendation ?? null;

  const handleMigrateLegacyHifzGoal = async () => {
    setHifzGoalMigrationError(null);
    setSubmittingHifzGoalMigration(true);
    try {
      const response = await fetch("/api/profile/daily-goal/hifz-pages", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            nextCount?: number;
          }
        | null;

      if (!response.ok) {
        setHifzGoalMigrationError(
          payload?.error ?? tDash("migrateHifzGoalError"),
        );
        return;
      }

      setHifzGoalMigrationOverride({
        dailyGoalCount:
          typeof payload?.nextCount === "number"
            ? payload.nextCount
            : (legacyHifzGoalRecommendation?.suggestedPageGoal ?? 1),
        dailyGoalType: "hifz_pages",
      });
      startMigratingHifzGoal(() => {
        router.refresh();
      });
    } catch {
      setHifzGoalMigrationError(tDash("migrateHifzGoalError"));
    } finally {
      setSubmittingHifzGoalMigration(false);
    }
  };

  return (
    <HomeDashboardSections
      activitySnapshot={activitySnapshot}
      activitySummaryLabel={activitySummaryLabel}
      goalProgressPct={goalProgressPct}
      handleMigrateLegacyHifzGoal={handleMigrateLegacyHifzGoal}
      heroClasses={heroClasses}
      hifzGoalMigrationError={hifzGoalMigrationError}
      homeHero={homeHero}
      legacyHifzGoalRecommendation={legacyHifzGoalRecommendation}
      migratingHifzGoal={migratingHifzGoal}
      modeCards={modeCards}
      submittingHifzGoalMigration={submittingHifzGoalMigration}
    />
  );
}
