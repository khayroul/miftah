"use client";

import { useEffect, useState, useCallback } from "react";

function getFontUrl(pageNumber: number): string {
  return `/fonts/qcf-v2-woff2/p${pageNumber}.woff2`;
}

function getFontFamily(pageNumber: number): string {
  return `QCF2_P${String(pageNumber).padStart(3, "0")}`;
}

// Persist state on globalThis to survive HMR module reloads.
const g = globalThis as Record<string, unknown>;
const loadedFonts: Set<number> =
  (g.__miftahLoadedFonts as Set<number>) ??
  ((g.__miftahLoadedFonts = new Set<number>()),
  g.__miftahLoadedFonts as Set<number>);

/**
 * Inject a CSS @font-face rule for a mushaf page font.
 *
 * This is the PRIMARY mechanism to prevent broken glyph rendering.
 * The browser natively handles `font-display: block` — hiding the text
 * until the font loads, without depending on React state or JS promises.
 */
function injectFontFaceRule(pageNumber: number): void {
  if (typeof document === "undefined") return;
  const id = `qcf-font-${pageNumber}`;
  if (document.getElementById(id)) return;

  const family = getFontFamily(pageNumber);
  const url = getFontUrl(pageNumber);
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `@font-face { font-family: '${family}'; src: url('${url}') format('woff2'); font-display: block; font-weight: normal; font-style: normal; }`;
  document.head.appendChild(style);
}

function isFontReady(pageNumber: number): boolean {
  if (typeof document === "undefined") return false;
  const family = getFontFamily(pageNumber);
  // Check if the font can render a QCF glyph (U+FC41)
  return document.fonts.check(`16px '${family}'`, "\uFC41");
}

/**
 * Ensure a page font is injected and loaded.
 * Returns a promise that resolves when the font is ready for JS use
 * (e.g. scaleX line fitting). The CSS @font-face already prevents
 * broken rendering independently of this promise.
 */
async function ensureFontLoaded(pageNumber: number): Promise<void> {
  injectFontFaceRule(pageNumber);

  if (loadedFonts.has(pageNumber)) return;

  // Wait for the browser to load the injected @font-face
  const family = getFontFamily(pageNumber);
  await document.fonts.load(`16px '${family}'`, "\uFC41");
  loadedFonts.add(pageNumber);
}

export function useMushafFont(pageNumber: number): {
  loaded: boolean;
  fontFamily: string;
} {
  const fontFamily = getFontFamily(pageNumber);
  const [loaded, setLoaded] = useState(() => loadedFonts.has(pageNumber));

  const checkReady = useCallback(() => {
    if (loadedFonts.has(pageNumber) || isFontReady(pageNumber)) {
      loadedFonts.add(pageNumber);
      setLoaded(true);
      return true;
    }
    return false;
  }, [pageNumber]);

  useEffect(() => {
    // Inject @font-face immediately — browser blocks rendering natively
    injectFontFaceRule(pageNumber);

    if (checkReady()) return;

    setLoaded(false);
    ensureFontLoaded(pageNumber)
      .then(() => setLoaded(true))
      .catch(() => {
        // Font failed to load. Remove hidden state so fallback text shows
        // (broken glyphs are better than permanently blank page).
        setLoaded(true);
      });

    // Safety net: listen for font loading completion
    const onLoadingDone = () => {
      checkReady();
    };
    document.fonts.addEventListener("loadingdone", onLoadingDone);
    return () => {
      document.fonts.removeEventListener("loadingdone", onLoadingDone);
    };
  }, [pageNumber, checkReady]);

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

  injectFontFaceRule(pageNumber);
  ensureFontLoaded(pageNumber).catch(() => {});
}

let globalFontsLoaded =
  (g.__miftahGlobalFontsLoaded as boolean) ?? false;

export function ensureGlobalMushafFonts(): void {
  if (typeof document === "undefined" || globalFontsLoaded) return;
  globalFontsLoaded = true;
  g.__miftahGlobalFontsLoaded = true;

  // Inject via CSS @font-face for reliability
  if (!document.getElementById("qcf-global-fonts")) {
    const style = document.createElement("style");
    style.id = "qcf-global-fonts";
    style.textContent = `
      @font-face { font-family: 'surah_names'; src: url('/fonts/sura_names.woff2') format('woff2'); font-display: block; }
      @font-face { font-family: 'QCF2_BSML'; src: url('/fonts/QCF_BSML.ttf') format('truetype'); font-display: block; }
    `;
    document.head.appendChild(style);
  }
}

export { getFontFamily };
