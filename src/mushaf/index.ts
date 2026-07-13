/**
 * mushaf — PUBLIC INTERFACE (barrel) — SACRED KERNEL
 *
 * Phase-1 Wave-0 scaffold (empty). `src/mushaf/` is a TOP-LEVEL sibling to
 * `features/` (ratified decision #2), NOT a feature: it is the frozen QCF
 * renderer / glyphs / layout / font / asset-resolution kernel. Its internals
 * are SACRED — WRAP, never rewrite (spec §3.12, §7). `MushafPageView.tsx` is
 * exempt from the 400-LOC rule.
 *
 * Boundary rules (spec §2):
 *  - Consumed import-only by `features/read` and `features/hifz`, exclusively
 *    through this barrel — internals stay private.
 *  - Wave 1 relocates the kernel here MOVE-ONLY (git shows moves, no content
 *    edits; QCF golden corpus re-run must be byte-identical).
 *
 * Exports land here in Wave 1. See §3.12, §5, §8(2)(4).
 */
export {};
