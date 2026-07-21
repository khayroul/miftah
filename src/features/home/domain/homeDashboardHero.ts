import type { HomeDashboardSnapshot } from "./homeDashboard";
import type { ReadMode } from "@/features/read";

type HeroTone = "teal" | "amber" | "indigo" | "stone";

export type HomeHeroTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

interface HomeHeroStat {
  label: string;
  value: string;
}

export interface HomeHeroAction {
  badge: string;
  description: string;
  isZeroState: boolean;
  primaryHref: string;
  primaryLabel: string;
  primaryMode: ReadMode;
  secondaryHref?: string;
  secondaryLabel?: string;
  secondaryMode?: ReadMode;
  stats: HomeHeroStat[];
  title: string;
  tone: HeroTone;
}

interface BuildHomeHeroInput {
  activeSurahId: number;
  activeSurahName: string | null;
  continuePage: number;
  formattedLastRead: string;
  hifzReadHref: string;
  snapshot: HomeDashboardSnapshot;
  t: HomeHeroTranslator;
}

function formatMinutes(value: number): string {
  return `~${value} min`;
}

function estimateMinutes(
  count: number,
  minutesPerItem: number,
  minimum: number,
  maximum: number,
): number {
  const raw = Math.ceil(count * minutesPerItem);
  return Math.max(minimum, Math.min(maximum, raw));
}

function formatHifzBlock(
  value: "sabqi" | "sabak" | "manzil" | null,
): string | null {
  if (value === "sabqi") {
    return "Sabqi";
  }
  if (value === "sabak") {
    return "Sabak";
  }
  if (value === "manzil") {
    return "Manzil";
  }
  return null;
}

function buildThemeHref(surahId: number): string {
  return `/read/surah/${surahId}/themes`;
}

function hasReadProgress(
  snapshot: HomeDashboardSnapshot,
  continuePage: number,
): boolean {
  return continuePage > 1 || (snapshot.read?.uniquePagesLifetime ?? 0) > 0;
}

function hasFahamProgress(snapshot: HomeDashboardSnapshot): boolean {
  const faham = snapshot.faham;
  return Boolean(
    faham &&
      (faham.dueCount > 0 ||
        faham.encounteredWordCount > 0 ||
        faham.reviewedWordCount > 0),
  );
}

function hasHifzProgress(snapshot: HomeDashboardSnapshot): boolean {
  const hifz = snapshot.hifz;
  return Boolean(
    hifz &&
      (hifz.dueTodayPages > 0 ||
        hifz.todayPages > 0 ||
        hifz.totalManzilPages > 0 ||
        hifz.nextPage !== null),
  );
}

function hasTemaProgress(snapshot: HomeDashboardSnapshot): boolean {
  const tema = snapshot.tema;
  return Boolean(
    tema && (tema.exploredCount > 0 || tema.completedCount > 0),
  );
}

function buildReadFocus(
  t: HomeHeroTranslator,
  continuePage: number,
  activeSurahName: string | null,
): string {
  if (activeSurahName) {
    return t("pageFocusWithSurah", { page: continuePage, surah: activeSurahName });
  }

  return t("pageFocusPlain", { page: continuePage });
}

function buildModeValue(
  t: HomeHeroTranslator,
  mode: string,
  suffix: string | null,
): string {
  if (!suffix) {
    return mode;
  }

  return t("modeCompound", { mode, suffix });
}

export function buildHomeHero({
  activeSurahId,
  activeSurahName,
  continuePage,
  formattedLastRead,
  hifzReadHref,
  snapshot,
  t,
}: BuildHomeHeroInput): HomeHeroAction {
  const hifz = snapshot.hifz;
  const faham = snapshot.faham;
  const tema = snapshot.tema;
  const themeHref = buildThemeHref(activeSurahId);
  const readFocus = buildReadFocus(t, continuePage, activeSurahName);
  const hasAnyProgress =
    hasReadProgress(snapshot, continuePage) ||
    hasFahamProgress(snapshot) ||
    hasHifzProgress(snapshot) ||
    hasTemaProgress(snapshot);

  if (hifz && hifz.dueTodayPages > 0) {
    const focus = hifz.nextPageLabel ?? readFocus;
    const blockLabel = formatHifzBlock(hifz.nextBlock);

    return {
      badge: t("badgeTodayAction"),
      description: t("dueHifzDescription", {
        focus,
        count: hifz.dueTodayPages,
      }),
      isZeroState: false,
      primaryHref: hifzReadHref,
      primaryLabel: t("primaryLabelContinueMushaf"),
      primaryMode: "hifz",
      secondaryHref: "/hifz",
      secondaryLabel: t("secondaryLabelViewHifzPlan"),
      secondaryMode: "hifz",
      stats: [
        {
          label: t("statMode"),
          value: buildModeValue(t, t("modeHifz"), blockLabel),
        },
        {
          label: t("statFocus"),
          value: focus,
        },
        {
          label: t("statEstimate"),
          value: formatMinutes(
            estimateMinutes(hifz.dueTodayPages, 3, 6, 24),
          ),
        },
        {
          label: t("statDue"),
          value: t("pagesCount", { count: hifz.dueTodayPages }),
        },
      ],
      title: t("dueHifzTitle"),
      tone: "stone",
    };
  }

  if (faham && faham.dueCount > 0) {
    const levelLabel = `L${faham.levelProgress.activeLevel}`;

    return {
      badge: t("badgeTodayAction"),
      description:
        faham.blockedReason === "due_backlog"
          ? t("dueFahamDescriptionBacklog", { count: faham.dueCount })
          : t("dueFahamDescriptionDefault", { count: faham.dueCount }),
      isZeroState: false,
      primaryHref: "/faham",
      primaryLabel: t("primaryLabelStartReview"),
      primaryMode: "faham",
      secondaryHref: `/read/${continuePage}`,
      secondaryLabel: t("secondaryLabelOpenMushaf"),
      secondaryMode: "read",
      stats: [
        {
          label: t("statMode"),
          value: buildModeValue(t, t("modeFaham"), levelLabel),
        },
        {
          label: t("statFocus"),
          value: t("wordsDueCount", { count: faham.dueCount }),
        },
        {
          label: t("statEstimate"),
          value: formatMinutes(
            estimateMinutes(faham.dueCount, 0.8, 5, 18),
          ),
        },
        {
          label: t("statDiscovered"),
          value: `${faham.encounteredWordCount} / ${faham.focusWordLimit}`,
        },
      ],
      title: t("dueFahamTitle"),
      tone: "amber",
    };
  }

  if (hifz && hifz.todayPages > 0) {
    const focus = hifz.nextPageLabel ?? readFocus;
    const blockLabel = formatHifzBlock(hifz.nextBlock);

    return {
      badge: t("badgeNextSuggestion"),
      description: t("continueHifzDescription", { focus }),
      isZeroState: false,
      primaryHref: hifzReadHref,
      primaryLabel: t("primaryLabelContinueHifz"),
      primaryMode: "hifz",
      secondaryHref: "/hifz",
      secondaryLabel: t("secondaryLabelViewHifzPlan"),
      secondaryMode: "hifz",
      stats: [
        {
          label: t("statMode"),
          value: buildModeValue(t, t("modeHifz"), blockLabel),
        },
        {
          label: t("statFocus"),
          value: focus,
        },
        {
          label: t("statEstimate"),
          value: formatMinutes(
            estimateMinutes(hifz.todayPages, 3, 6, 20),
          ),
        },
        {
          label: t("statToday"),
          value: t("activePagesCount", { count: hifz.todayPages }),
        },
      ],
      title: t("continueHifzTitle"),
      tone: "stone",
    };
  }

  if (hasReadProgress(snapshot, continuePage)) {
    return {
      badge: t("badgeNextSuggestion"),
      description: activeSurahName
        ? t("continueReadDescriptionWithSurah", { focus: readFocus })
        : t("continueReadDescriptionDefault", { page: continuePage }),
      isZeroState: false,
      primaryHref: `/read/${continuePage}`,
      primaryLabel:
        continuePage > 1
          ? t("primaryLabelContinueRead")
          : t("primaryLabelStartRead"),
      primaryMode: "read",
      secondaryHref: themeHref,
      secondaryLabel: t("secondaryLabelExploreSurahThemes"),
      secondaryMode: "tema",
      stats: [
        {
          label: t("statMode"),
          value: t("modeRead"),
        },
        {
          label: t("statFocus"),
          value: readFocus,
        },
        {
          label: t("statEstimate"),
          value: formatMinutes(6),
        },
        {
          label: t("statActivity"),
          value: formattedLastRead,
        },
      ],
      title: t("continueReadTitle"),
      tone: "teal",
    };
  }

  if (faham && (faham.eligibleNewCount > 0 || faham.encounteredWordCount > 0)) {
    return {
      badge: t("badgeNextSuggestion"),
      description: t("buildFahamDescription"),
      isZeroState: false,
      primaryHref: "/faham",
      primaryLabel: t("primaryLabelOpenFaham"),
      primaryMode: "faham",
      secondaryHref: `/read/${continuePage}`,
      secondaryLabel: t("secondaryLabelEnterMushaf"),
      secondaryMode: "read",
      stats: [
        {
          label: t("statMode"),
          value: buildModeValue(
            t,
            t("modeFaham"),
            `L${faham.levelProgress.activeLevel}`,
          ),
        },
        {
          label: t("statFocus"),
          value: t("wordsReadyCount", { count: faham.eligibleNewCount }),
        },
        {
          label: t("statEstimate"),
          value: formatMinutes(7),
        },
        {
          label: t("statMastered"),
          value: t("wordsCount", { count: faham.masteredWordCount }),
        },
      ],
      title: t("buildFahamTitle"),
      tone: "amber",
    };
  }

  if (tema && (tema.exploredCount > 0 || tema.completedCount > 0)) {
    return {
      badge: t("badgeNextSuggestion"),
      description: t("continueTemaDescription"),
      isZeroState: false,
      primaryHref: themeHref,
      primaryLabel: t("primaryLabelExploreTema"),
      primaryMode: "tema",
      secondaryHref: `/read/${continuePage}`,
      secondaryLabel: t("secondaryLabelOpenMushaf"),
      secondaryMode: "read",
      stats: [
        {
          label: t("statMode"),
          value: t("modeTema"),
        },
        {
          label: t("statFocus"),
          value: t("chunksExploredCount", { count: tema.exploredCount }),
        },
        {
          label: t("statEstimate"),
          value: formatMinutes(5),
        },
        {
          label: t("statDone"),
          value: t("chunksCount", { count: tema.completedCount }),
        },
      ],
      title: t("continueTemaTitle"),
      tone: "indigo",
    };
  }

  return {
    badge: hasAnyProgress ? t("badgeNextSuggestion") : t("badgeStartHere"),
    description: hasAnyProgress
      ? t("zeroStateDescriptionProgress")
      : t("zeroStateDescriptionZero"),
    isZeroState: !hasAnyProgress,
    primaryHref: `/read/${continuePage}`,
    primaryLabel: t("primaryLabelStartRead"),
    primaryMode: "read",
    secondaryHref: "/faham",
    secondaryLabel: t("secondaryLabelViewFahamMode"),
    secondaryMode: "faham",
    stats: [
      {
        label: t("statStep1"),
        value: t("stepReadFocus", { focus: readFocus }),
      },
      {
        label: t("statStep2"),
        value: t("stepChooseNext"),
      },
      {
        label: t("statEstimate"),
        value: formatMinutes(8),
      },
      {
        label: t("statResult"),
        value: t("resultFourModes"),
      },
    ],
    title: t("zeroStateTitle"),
    tone: "teal",
  };
}
