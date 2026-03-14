import type { HomeDashboardSnapshot } from "@/lib/homeDashboard";
import type { ReadMode } from "@/lib/readMode";

type HeroTone = "teal" | "amber" | "indigo" | "stone";

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
  continuePage: number,
  activeSurahName: string | null,
): string {
  if (activeSurahName) {
    return `Halaman ${continuePage} · ${activeSurahName}`;
  }

  return `Halaman ${continuePage}`;
}

export function buildHomeHero({
  activeSurahId,
  activeSurahName,
  continuePage,
  formattedLastRead,
  hifzReadHref,
  snapshot,
}: BuildHomeHeroInput): HomeHeroAction {
  const hifz = snapshot.hifz;
  const faham = snapshot.faham;
  const tema = snapshot.tema;
  const themeHref = buildThemeHref(activeSurahId);
  const readFocus = buildReadFocus(continuePage, activeSurahName);
  const hasAnyProgress =
    hasReadProgress(snapshot, continuePage) ||
    hasFahamProgress(snapshot) ||
    hasHifzProgress(snapshot) ||
    hasTemaProgress(snapshot);

  if (hifz && hifz.dueTodayPages > 0) {
    const focus = hifz.nextPageLabel ?? readFocus;
    const blockLabel = formatHifzBlock(hifz.nextBlock);

    return {
      badge: "Tindakan hari ini",
      description: `Mulakan dengan ${focus}. Ada ${hifz.dueTodayPages} halaman ulangan yang sudah due, jadi ini patut didahulukan sebelum mod lain.`,
      isZeroState: false,
      primaryHref: hifzReadHref,
      primaryLabel: "Teruskan di Mushaf",
      primaryMode: "hifz",
      secondaryHref: "/hifz",
      secondaryLabel: "Lihat Hafal Plan",
      secondaryMode: "hifz",
      stats: [
        {
          label: "Mod",
          value: blockLabel ? `Hafal · ${blockLabel}` : "Hafal",
        },
        {
          label: "Fokus",
          value: focus,
        },
        {
          label: "Anggaran",
          value: formatMinutes(
            estimateMinutes(hifz.dueTodayPages, 3, 6, 24),
          ),
        },
        {
          label: "Due",
          value: `${hifz.dueTodayPages} halaman`,
        },
      ],
      title: "Ulang hafalan yang due",
      tone: "stone",
    };
  }

  if (faham && faham.dueCount > 0) {
    const levelLabel = `L${faham.levelProgress.activeLevel}`;

    return {
      badge: "Tindakan hari ini",
      description:
        faham.blockedReason === "due_backlog"
          ? `Ada ${faham.dueCount} perkataan due sekarang. Selesaikan backlog ini dahulu supaya perkataan baru boleh dibuka semula.`
          : `Ada ${faham.dueCount} perkataan due sekarang. Review ringkas ini biasanya cara paling cepat untuk hidupkan semula rutin harian.`,
      isZeroState: false,
      primaryHref: "/faham",
      primaryLabel: "Mula Ulang Kaji",
      primaryMode: "faham",
      secondaryHref: `/read/${continuePage}`,
      secondaryLabel: "Buka Mushaf",
      secondaryMode: "read",
      stats: [
        {
          label: "Mod",
          value: `Faham · ${levelLabel}`,
        },
        {
          label: "Fokus",
          value: `${faham.dueCount} perkataan due`,
        },
        {
          label: "Anggaran",
          value: formatMinutes(
            estimateMinutes(faham.dueCount, 0.8, 5, 18),
          ),
        },
        {
          label: "Liputan",
          value: `${faham.encounteredWordCount} / ${faham.focusWordLimit}`,
        },
      ],
      title: "Ulang Faham yang menunggu",
      tone: "amber",
    };
  }

  if (hifz && hifz.todayPages > 0) {
    const focus = hifz.nextPageLabel ?? readFocus;
    const blockLabel = formatHifzBlock(hifz.nextBlock);

    return {
      badge: "Cadangan seterusnya",
      description: `Pelan hafalan hari ini sudah tersedia. Sambung dari ${focus} supaya Sabak, Sabqi, dan Manzil bergerak tanpa perlu fikir langkah seterusnya.`,
      isZeroState: false,
      primaryHref: hifzReadHref,
      primaryLabel: "Sambung Hafal",
      primaryMode: "hifz",
      secondaryHref: "/hifz",
      secondaryLabel: "Lihat Hafal Plan",
      secondaryMode: "hifz",
      stats: [
        {
          label: "Mod",
          value: blockLabel ? `Hafal · ${blockLabel}` : "Hafal",
        },
        {
          label: "Fokus",
          value: focus,
        },
        {
          label: "Anggaran",
          value: formatMinutes(
            estimateMinutes(hifz.todayPages, 3, 6, 20),
          ),
        },
        {
          label: "Hari ini",
          value: `${hifz.todayPages} halaman aktif`,
        },
      ],
      title: "Teruskan hafalan hari ini",
      tone: "stone",
    };
  }

  if (hasReadProgress(snapshot, continuePage)) {
    return {
      badge: "Cadangan seterusnya",
      description: activeSurahName
        ? `Sambung dari ${readFocus}. Ini cara paling ringan untuk kembali masuk ke ritma harian anda.`
        : `Sambung dari halaman ${continuePage}. Bacaan terakhir anda masih tersedia untuk diteruskan tanpa banyak langkah.`,
      isZeroState: false,
      primaryHref: `/read/${continuePage}`,
      primaryLabel: continuePage > 1 ? "Sambung Baca" : "Mula Baca",
      primaryMode: "read",
      secondaryHref: themeHref,
      secondaryLabel: "Teroka Tema Surah",
      secondaryMode: "tema",
      stats: [
        {
          label: "Mod",
          value: "Baca",
        },
        {
          label: "Fokus",
          value: readFocus,
        },
        {
          label: "Anggaran",
          value: formatMinutes(6),
        },
        {
          label: "Aktiviti",
          value: formattedLastRead,
        },
      ],
      title: "Sambung bacaan terakhir",
      tone: "teal",
    };
  }

  if (faham && (faham.eligibleNewCount > 0 || faham.encounteredWordCount > 0)) {
    return {
      badge: "Cadangan seterusnya",
      description: `Anda sudah mula membina asas Faham. Teruskan dengan perkataan yang paling berguna supaya bacaan selepas ini terasa lebih hidup.`,
      isZeroState: false,
      primaryHref: "/faham",
      primaryLabel: "Buka Faham",
      primaryMode: "faham",
      secondaryHref: `/read/${continuePage}`,
      secondaryLabel: "Masuk Mushaf",
      secondaryMode: "read",
      stats: [
        {
          label: "Mod",
          value: `Faham · L${faham.levelProgress.activeLevel}`,
        },
        {
          label: "Fokus",
          value: `${faham.eligibleNewCount} perkataan sedia dibuka`,
        },
        {
          label: "Anggaran",
          value: formatMinutes(7),
        },
        {
          label: "Mahir",
          value: `${faham.masteredWordCount} perkataan`,
        },
      ],
      title: "Bina kefahaman bacaan",
      tone: "amber",
    };
  }

  if (tema && (tema.exploredCount > 0 || tema.completedCount > 0)) {
    return {
      badge: "Cadangan seterusnya",
      description: `Tema surah sudah mula diteroka. Sambung dari sini jika anda mahu faham alur dan idea utama sebelum kembali membaca.`,
      isZeroState: false,
      primaryHref: themeHref,
      primaryLabel: "Teroka Tema",
      primaryMode: "tema",
      secondaryHref: `/read/${continuePage}`,
      secondaryLabel: "Buka Mushaf",
      secondaryMode: "read",
      stats: [
        {
          label: "Mod",
          value: "Tema",
        },
        {
          label: "Fokus",
          value: `${tema.exploredCount} chunk diteroka`,
        },
        {
          label: "Anggaran",
          value: formatMinutes(5),
        },
        {
          label: "Selesai",
          value: `${tema.completedCount} chunk`,
        },
      ],
      title: "Sambung tema surah semasa",
      tone: "indigo",
    };
  }

  return {
    badge: hasAnyProgress ? "Cadangan seterusnya" : "Mulakan di sini",
    description: hasAnyProgress
      ? "Teruskan dengan satu halaman dahulu. Selepas itu Miftah akan kembali mengesyorkan langkah paling berguna berdasarkan progres sebenar anda."
      : "Mulakan dengan satu halaman dahulu. Selepas sesi pertama, Miftah akan mula cadangkan Faham, Tema, dan Hafal ikut progres sebenar anda.",
    isZeroState: !hasAnyProgress,
    primaryHref: `/read/${continuePage}`,
    primaryLabel: "Mula Baca",
    primaryMode: "read",
    secondaryHref: "/faham",
    secondaryLabel: "Lihat Mod Faham",
    secondaryMode: "faham",
    stats: [
      {
        label: "Langkah 1",
        value: `Baca ${readFocus}`,
      },
      {
        label: "Langkah 2",
        value: "Biarkan Miftah pilih fokus seterusnya",
      },
      {
        label: "Anggaran",
        value: formatMinutes(8),
      },
      {
        label: "Hasil",
        value: "Empat mod akan mula dipandu oleh progres anda",
      },
    ],
    title: "Mulakan dengan satu tindakan yang jelas",
    tone: "teal",
  };
}
