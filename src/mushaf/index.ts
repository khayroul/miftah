/**
 * mushaf — PUBLIC INTERFACE (barrel) — SACRED KERNEL
 *
 * `src/mushaf/` is a TOP-LEVEL sibling to `features/` (ratified decision #2),
 * NOT a feature: it is the frozen QCF renderer / glyphs / layout / font /
 * asset-resolution kernel. Its internals are SACRED — WRAP, never rewrite
 * (spec §3.12, §7). `MushafPageView.tsx` is exempt from the 400-LOC rule.
 *
 * Boundary rules (spec §2):
 *  - Consumed import-only by `features/read` and `features/hifz`. Internals stay
 *    private; consumers should reach the render surface through this barrel.
 *  - `src/mushaf/**` never imports a Supabase client (pure render kernel).
 *
 * Wave-1 populated this barrel MOVE-ONLY: every symbol below was relocated from
 * `src/{components,lib,types}/` with import-path rebasing ONLY — no logic edits
 * (git-diff shows moves; QCF render is byte-identical to the baseline corpus).
 *
 * SERVER-ONLY SURFACE — NOT re-exported here on purpose:
 *   The asset/layout resolvers `mushafAssets` (CDN + `node:fs`) and
 *   `mushafLayout` (`node:fs` layout-JSON loader) are server-only. Re-exporting
 *   them from this same barrel that also exports `"use client"` components would
 *   drag `node:fs` into any client consumer's bundle. Until a dedicated
 *   `@/mushaf/server` entry is introduced (a later feature-wave concern), server
 *   consumers import them directly:
 *     import { resolvePageImageSource } from "@/mushaf/lib/mushafAssets";
 *     import { loadMushafLayout }        from "@/mushaf/lib/mushafLayout";
 */

// ── Render components (client) ──────────────────────────────────────────────
export { MushafPageView } from "./components/MushafPageView";
export type { MushafAyahDetail } from "./components/MushafPageView";
export { MushafLivePage } from "./components/MushafLivePage";
export type { MushafLiveWordRef } from "./components/MushafLivePage";
export { ReadOnlyMushafPageView } from "./components/ReadOnlyMushafPageView";
export { MushafDownloadPrompt } from "./components/MushafDownloadPrompt";

// ── Glyph splitting / ayah-key helpers (pure) ───────────────────────────────
export { splitWordGlyphs, getAyahKeyFromLocation } from "./lib/mushafGlyphs";
export type { SplitGlyphs } from "./lib/mushafGlyphs";

// ── QCF font loading (client) ───────────────────────────────────────────────
export {
  useMushafFont,
  preloadMushafFont,
  ensureGlobalMushafFonts,
  getFontFamily,
} from "./lib/mushafFonts";

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  MushafWordHitbox,
  MushafPageManifest,
  MushafAyahManifest,
  MushafWordTranslation,
  MushafWordTranslationMap,
} from "./types/mushaf";
export type {
  MushafLayoutWord,
  MushafLayoutLine,
  MushafLayoutPage,
} from "./types/mushafLayout";
export { computeLastLineFlags } from "./types/mushafLayout";
