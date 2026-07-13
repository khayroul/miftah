# Tasmi' Mode — Operator Vision (Lane C design source)

**Date:** 2026-07-13 · **Source:** operator, verbatim intent captured this session · **Status:** vision locked; feasibility spike + clarifiers pending before Lane C build
**Consumes:** existing primitives `src/lib/tasmi/{tasmi-recorder,sequence-matcher,talqin-player,arabic-normalizer,tasmi-session,fsrs-bridge}.ts`, `tasmi-server/` (faster-whisper). This is the v1 Tasmi scope (operator chose Tasmi-in-v1).

## Two modes

### Mode A — Recite-a-page (follow + correct)
1. Listen through the mic for the SEQUENCE of the recitation (continuous, page-scoped).
2. HIGHLIGHT in the on-page text the sequence of words as they are recited (live word-follow highlight advancing with correct recitation).
3. On a WRONG sequence (reciter diverges from expected order):
   - the app reads aloud **3 linked correct words** (talqin prompt),
   - then goes SILENT and waits for the reciter to recite the right sequence,
   - repeat this correction loop as needed,
   - continue **until the page ends**.

### Mode B — Juzuk (examination)
1. The app reads aloud **any one ayah of the chosen juz** as the START prompt (a test ayah).
2. The reciter continues from that ayah **until the end of the page** on which the test ayah sits.
3. When the reciter presses **NEXT**, the app reads the **next test ayah** aloud and the loop repeats (new start → recite to page end → next).

## What already exists (encouraging — ~half scaffolded)
- `talqin-player.ts` — reads correct words aloud (the talqin prompt). Mode A step 3's "read 3 linked words" is this primitive + a "3-word window" param.
- `sequence-matcher.ts` — matches recited-vs-expected word order (advance/mismatch). Mode A step 2's follow + step 3's divergence-detection.
- `tasmi-recorder.ts` — mic VAD capture.
- `arabic-normalizer.ts` (+ Python parity) — normalize for comparison.
- `tasmi-session.ts` / `fsrs-bridge.ts` — session flow + FSRS rating.
- Audit finding T-01 (matcher discards correct words after a mid-chunk error) is directly relevant to the "highlight the sequence" accuracy — fix as part of Lane C.

## What is NEW (build in Lane C)
- Live word-level HIGHLIGHT following recitation in near-real-time (Mode A step 2).
- The 3-linked-words talqin trigger + silent-wait + resume loop wired to the matcher (Mode A step 3).
- Mode B (juzuk examination): random test-ayah selection within a juz, read-aloud start prompt, recite-to-page-end, NEXT loop.

## THE HARD PART / honest risk (promise-ceiling = engine truth)
Live, word-level, near-real-time sequence following on the current stack (VAD-chunked audio -> Whisper large-v3 on CPU) is the ambitious core. The audit already found the server freezes under concurrent load (T-02), a server outage is indistinguishable from a mistake (T-03/T-05), and latency is unbounded (T-04). "Highlight each word as recited" implies low-latency streaming/word-aligned ASR, which chunk-then-transcribe does not natively give.
-> **Lane C must open with a FEASIBILITY SPIKE** (like the mockup-from-photo validation-spike precedent) proving word-level real-time follow is achievable at acceptable latency BEFORE the exact UX is promised. Named fallbacks if word-level real-time isn't hit: (a) ayah-level or short-phrase-level follow (highlight per phrase, not per word); (b) recite-then-check (record an ayah, then reveal correctness) rather than live. The spike picks the highest fidelity the engine actually supports.

## Clarifiers — RESOLVED (operator 2026-07-13)
1. **Mode B correction = reciter CHOOSES per session.** Session-start toggle: "exam mode" (silent on mistakes; mistakes tracked/scored, no help — traditional examination) vs "practice mode" (same 3-word talqin help as Mode A). Both modes share the listening/matcher/talqin engine; the toggle gates whether talqin fires. Build the toggle into Mode B session start.
2. **Correctness bar = word-SEQUENCE only for v1.** Right words in right order. NO tajwid/pronunciation-quality judging in v1 (that needs Quran-specialized ASR — aspirational, post-v1, do not promise). This keeps the ASR bar achievable.
3. **Live-follow fallback = PHRASE-LEVEL.** If the feasibility spike shows reliable single-word real-time follow isn't achievable on the current server, degrade to highlighting per short phrase (2–4 words), NOT recite-then-reveal. Spike targets word-level; ships whichever of {word, phrase} it proves, phrase as the floor.
4. STILL DEFAULTED (confirm at build): talqin 3 words start AT point of error (traditional); reciter repeats the 3 prompted words then continues.

## Absorption
Operator-teaching-absorption: captured here (repo, machine/worker-consumed) + memory hook in `miftah-consolidation-program.md`. Do NOT let this evaporate — it is the v1 Tasmi product spec.
