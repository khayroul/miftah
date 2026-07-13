# Tasmi' Engine — Upgrade Ladder (Lane C strategy)

**Date:** 2026-07-13 · **Source:** operator question ("next-level upgrades for the tasmi engine — a ladder?") · **Status:** strategy; starting rung decided by the running feasibility spike.

## The reframe that changes everything
Tasmi' is **verification against KNOWN text**, not open transcription. The expected page words are known in advance. Every rung gets easier and more accurate when the engine exploits the known reference instead of transcribing blind. This is why a Quran app can do live word-following that generic dictation cannot.

## The ladder (climb as needed, not all at once)

| Rung | What it is | Unlocks | Effort | Recurring cost |
|---|---|---|---|---|
| **0 — Baseline (current)** | General faster-whisper large-v3, int8, CPU VPS; VAD-chunk → transcribe → sequence-match | recite-then-check / phrase-level at best; weak on hamza carriers; freezes under load | — | 1 VPS |
| **1 — Quran-tuned model (do first)** | Drop-in swap to a Quran-fine-tuned Whisper (`tarteel-ai/whisper-base-ar-quran` + `*-ar-quran` fine-tunes). Same pipeline/hardware | big WER drop on recitation → reliable word-sequence match; fixes hamza class; a SMALLER (faster) model may now clear the bar | **S** | ~0 |
| **2 — Forced alignment (word-level unlock)** | Stop open transcription; align audio to the KNOWN expected text (whisperX / wav2vec2-CTC / Meta MMS aligner). | accurate per-word start/end times + exact divergence word → makes "highlight each word live" reliable, not guesswork | **M** | ~0 (CPU-feasible) |
| **3 — Streaming + GPU (true real-time under load)** | Streaming recognizer (partial word-by-word hypotheses) and/or a small rented GPU so the model runs faster-than-real-time | genuine low-latency live follow; no server freeze with concurrent reciters | **M–L** | small GPU box |
| **4 — On-device / offline (endgame)** | Recognition in browser/phone: whisper.cpp WASM, Transformers.js, or Vosk streaming; native on mobile | zero server cost, best latency (no round-trip), FULL OFFLINE tasmi (matches the PWA offline story), privacy (audio never leaves device). Where Tarteel (reference Quran app) lives | **L** | ~0 server |

## Recommended climb
1. **Rung 1 first** — cheapest, biggest single gain; the spike is testing it now (Quran-tuned vs general). Likely worth doing regardless of the rest.
2. **Rung 2** — the paradigm shift that makes the word-level highlight vision actually work. Reference-known forced alignment beats transcribe-then-match on both speed and accuracy.
3. Measure after 1+2 on CPU. **Rung 3 only if** the latency bar for live word-follow still isn't met.
4. **Rung 4 is the strategic endgame** — solves latency + server cost + offline + privacy together, and is the natural home for a mature Quran-recitation app. Plan toward it; don't block v1 on it.

## Tie to the locked vision
- v1 correctness bar = word-sequence only (no tajwid) → Rungs 1–2 are sufficient in principle; tajwid grading would be a separate, much harder engine track (post-v1).
- Phrase-level fallback (operator-chosen) = the safe landing if Rung 2 word-level timing proves shaky on available hardware.
- The spike's verdict names the STARTING rung; this ladder names where it goes next.
