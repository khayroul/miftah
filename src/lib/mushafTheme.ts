export interface MushafThemeColors {
  pageBg: string;
  textColor: string;
  headerColor: string;
  surahArColor: string;
  bannerBg: string;
  bannerBorder: string;
  bannerText: string;
  borderColor: string;
  pageNumColor: string;
  invertFrame: boolean;
}

export const MUSHAF_THEMES: Record<string, MushafThemeColors> = {
  light: {
    pageBg: "#f5f4f0",
    textColor: "#1b1b1b",
    headerColor: "#555",
    surahArColor: "#333",
    bannerBg: "#efede8",
    bannerBorder: "#c8c3b9",
    bannerText: "#3d3525",
    borderColor: "#dddcd8",
    pageNumColor: "#888",
    invertFrame: false,
  },
  dark: {
    pageBg: "transparent",
    textColor: "#e7e9ea",
    headerColor: "#e7e9ea",
    surahArColor: "#e7e9ea",
    bannerBg: "transparent",
    bannerBorder: "transparent",
    bannerText: "#e7e9ea",
    borderColor: "transparent",
    pageNumColor: "#6b6e70",
    invertFrame: true,
  },
  paper: {
    pageBg: "#ffffff",
    textColor: "#1a1a1a",
    headerColor: "#666",
    surahArColor: "#333",
    bannerBg: "#f5f5f5",
    bannerBorder: "#d0d0d0",
    bannerText: "#333",
    borderColor: "#e0e0e0",
    pageNumColor: "#999",
    invertFrame: false,
  },
  sepia: {
    pageBg: "#f4e8d1",
    textColor: "#2c1e0e",
    headerColor: "#6b5a47",
    surahArColor: "#3d2e1a",
    bannerBg: "#efe0c8",
    bannerBorder: "#c8b090",
    bannerText: "#3d2e1a",
    borderColor: "#d4c4a8",
    pageNumColor: "#8a7a64",
    invertFrame: false,
  },
  night: {
    pageBg: "#0d1b2a",
    textColor: "#c8d6e5",
    headerColor: "#6b8299",
    surahArColor: "#a0b8d0",
    bannerBg: "#152238",
    bannerBorder: "#2a3f5f",
    bannerText: "#8fa8c8",
    borderColor: "#1b2d44",
    pageNumColor: "#4a6580",
    invertFrame: true,
  },
};

export function resolveThemeKey(isDark: boolean): string {
  return isDark ? "dark" : "light";
}
