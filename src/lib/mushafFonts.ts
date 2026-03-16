"use client";

import { useEffect, useState } from "react";

function getFontUrl(pageNumber: number): string {
  return `/fonts/qcf-v2-woff2/p${pageNumber}.woff2`;
}

function getFontFamily(pageNumber: number): string {
  return `QCF2_P${String(pageNumber).padStart(3, "0")}`;
}

const loadedFonts = new Set<number>();
const loadingPromises = new Map<number, Promise<void>>();

async function ensureFontLoaded(pageNumber: number): Promise<void> {
  if (loadedFonts.has(pageNumber)) return;

  const existing = loadingPromises.get(pageNumber);
  if (existing) return existing;

  const promise = (async () => {
    const family = getFontFamily(pageNumber);
    const url = getFontUrl(pageNumber);
    const face = new FontFace(family, `url(${url}) format('woff2')`, {
      weight: "normal",
      style: "normal",
      display: "block",
    });

    const loaded = await face.load();
    document.fonts.add(loaded);
    loadedFonts.add(pageNumber);
    loadingPromises.delete(pageNumber);
  })();

  loadingPromises.set(pageNumber, promise);
  return promise;
}

export function useMushafFont(pageNumber: number): {
  loaded: boolean;
  fontFamily: string;
} {
  const [loaded, setLoaded] = useState(() => loadedFonts.has(pageNumber));
  const fontFamily = getFontFamily(pageNumber);

  useEffect(() => {
    if (loadedFonts.has(pageNumber)) {
      setLoaded(true);
      return;
    }

    setLoaded(false);
    ensureFontLoaded(pageNumber)
      .then(() => setLoaded(true))
      .catch(() => setLoaded(false));
  }, [pageNumber]);

  return { loaded, fontFamily };
}

export function preloadMushafFont(pageNumber: number): void {
  if (
    typeof document === "undefined" ||
    pageNumber < 1 ||
    pageNumber > 604 ||
    loadedFonts.has(pageNumber)
  ) {
    return;
  }

  ensureFontLoaded(pageNumber).catch(() => {});
}

let globalFontsLoaded = false;

export function ensureGlobalMushafFonts(): void {
  if (typeof document === "undefined" || globalFontsLoaded) return;
  globalFontsLoaded = true;

  const surahNames = new FontFace(
    "surah_names",
    "url(/fonts/sura_names.woff2) format('woff2')",
    { weight: "normal", style: "normal", display: "block" },
  );
  surahNames.load().then((f) => document.fonts.add(f)).catch(() => {});

  const basmala = new FontFace(
    "QCF2_BSML",
    "url(/fonts/QCF_BSML.ttf) format('truetype')",
    { weight: "normal", style: "normal", display: "block" },
  );
  basmala.load().then((f) => document.fonts.add(f)).catch(() => {});
}

export { getFontFamily };
