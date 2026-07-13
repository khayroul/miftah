# Tasmi' Engine — Feasibility Spike Report (Lane C step 1)

**Date:** 2026-07-13 · **Type:** measurement/investigation spike (not a build) · **Status:** measured; verdict below is binding on the Lane C build's promise.
**Consumes:** locked vision `2026-07-13-tasmi-mode-design-operator-vision.md`; upgrade ladder `2026-07-13-tasmi-engine-upgrade-ladder.md`.
**Question answered:** is **word-level real-time follow** achievable on the current stack (VAD-chunk → faster-whisper → sequence-match), at what model/latency, and if not, is **phrase-level** achievable and good enough?

## TL;DR verdict (numbers below)

- **Word-SEQUENCE correctness — SOLVED on CPU, no GPU needed.** The Quran-fine-tuned `tarteel-ai/whisper-base-ar-quran` (Rung 1) hits **3.45% corpus WER at 0.46s median / 0.67s max per ayah** on this CPU (greedy/beam-1). That beats general *medium* (6.9% WER but 4s) and general *small* (24% WER at 1.3s). It clears the word-sequence-matching bar with large margin, on the existing CPU VPS.
- **True per-word real-time highlight (each word lights the instant it's said) — NOT achievable** with chunk-then-transcribe on CPU. Two hard walls: (1) a **fixed ~0.4–1.5s per-call latency floor** that does *not* shrink with shorter chunks, and (2) the Quran-tuned model **cannot self-provide reliable per-word timestamps** — turning on `word_timestamps` corrupts its output (41% WER, repetition hallucinations).
- **Phrase-level highlight (2–4 words) — SOLIDLY achievable now** on CPU with Rung 1 + a fuzzy (edit-distance) matcher: highlight each phrase the moment its VAD chunk resolves (~0.5s lag). This is the recommended v1 ship (matches the operator's resolved fallback).
- **Word-level highlight is reachable at v1.5** by adding **Rung 2 (forced alignment)** of the known text to the chunk audio — the spike shows this is *required*, not optional, because Whisper's built-in word timestamps are unusable with the Quran-tuned model.

---

## Test environment & material

| Item | Value |
|---|---|
| Machine | Apple Silicon **arm64**, 10 CPU cores, 16 GB RAM |
| Engine | **faster-whisper 1.2.1** / ctranslate2 4.8.1, `compute_type=int8`, `device=cpu`, `cpu_threads=4` (the production `tasmi-server` engine) |
| Python | 3.11.15 (venv; note the machine default 3.14 lacks ctranslate2 wheels) |
| Audio | Al-Fatihah ayat 1–7, **Abdul Basit murattal** (studio, slow, professional) — 4.0–13.1s per clip |
| Normalizer | exact parity with `tasmi-server/normalizer.py` (strip tashkeel, alef/taa/maqsura fold, punctuation strip) |
| Not run | `large-v3` (~3 GB; medium already shows general models are too slow on CPU — see §1), live-mic VAD streaming, error/mistake samples (see Risks) |

Raw harness + outputs: scratchpad `tasmi-spike/` (`harness.py`, `chunk_harness.py`, `alignment_probe.py`, `tarteel_wts_probe.py`, `results_*.json`, `run_*.log`).

---

## §1. LATENCY — measured wall-clock (seconds), CPU int8

Per-ayah transcription (the near-real-time unit: ayat 1–6 are already 2–5 word chunks). `beam5+wts` = beam_size 5 with word_timestamps (production-ish); `beam1` = greedy, no word_ts (fastest real-time candidate).

| Model | Load (incl. 1st-time DL) | beam5+wts median / max | beam1 median / max | RTF (5s clip) |
|---|---|---|---|---|
| **base** (general) | 15.7s | 0.43 / 0.54 | 0.34 / 0.39 | ~0.09 |
| **small** (general) | 55s | 1.33 / 1.58 | 1.08 / 1.19 | ~0.28 |
| **medium** (general) | 221s | 3.82 / 4.67 | 3.26 / 3.67 | ~0.83 |
| **tarteel-base-ar-quran** (Rung 1) | 0.08s (local) | 1.48 / 1.76 ⚠ | **0.40 / 0.67** | ~0.10 |

⚠ tarteel's `beam5+wts` number is a **broken config** — see §2.

### The fixed per-call floor (chunk-streaming probe)

Short VAD-like slices (1.5–3.5s, a few words each), median of 3 runs. **The key real-time finding:** latency is a near-flat per-call floor, *independent of chunk length* — because Whisper's encoder runs on a padded window regardless. Shortening chunks does **not** buy real-time.

| Model | 1.5s clip | 2.5s clip | 3.5s clip | Effective floor |
|---|---|---|---|---|
| base | 0.39 | 0.39 | ~0.44 | **~0.4s** |
| small | 1.18 | 1.33 | ~1.35 | **~1.2s** |
| medium | 4.67 | 5.04 | ~4.3 | **~3.5–4s** |
| tarteel-base (beam1) | — | ~0.40 | ~0.5 | **~0.45s** |

**Reading:** "can a 3–5 word chunk transcribe under ~1.5s?" → **Yes for base / tarteel-base (~0.4s) and small (~1.2s); No for medium (~4s).** But even the fastest floor (~0.4s) is longer than a single spoken word in normal recitation, so this confirms **you cannot light each word the instant it is uttered** — the engine can only resolve a *chunk* (a phrase) and then (optionally) back-fill the words inside it.

**Also critical:** slicing audio at arbitrary fixed-time boundaries (mid-word) *destroys* accuracy — a 3.5s cut through Ayah 7 produced garbage ("سراط الذين انا"). Chunks **must** be cut on VAD silence at natural phrase boundaries, not a fixed clock.

---

## §2. WORD TIMESTAMPS — does `word_timestamps=True` work for Arabic?

**General models (base / small / medium): YES — clean, monotonic, complete.** Every word gets a plausible start/end. Sample (general **small**, Ayah 7):

```
صراط[0.0-2.4] | الذين[2.4-3.18] | انعمت[3.18-4.0] | عليهم[4.0-4.86] |
غير[4.86-5.38]* | المغضوب[5.38-6.42]* | عليهم[6.42-7.44] | ...   (*transcription slip, timing still valid)
```

**Quran-tuned tarteel-base: NO (this is the sharp finding).** With `word_timestamps=True` the fine-tune's DTW word-alignment **injects repetition hallucinations** and wrecks the text:
- beam1 + word_ts → **41.4% corpus WER** (e.g. Ayah 1 "بسم الله الرحمن الرحيمبسم الله الرحمن"; Ayah 4 "مالك يوم الدينمال الدنيا والمؤمنين"), latency also up to ~1.5s.
- beam1, **no** word_ts → **3.45% corpus WER**, 0.46s (perfect text).

So the Quran-tuned model gives you **either** correct text (fast, no per-word times) **or** per-word times (broken text) — not both. **Conclusion: word-level highlight timing cannot come from the Rung-1 model's own timestamps.** It must come from either (a) a general model's word_timestamps used only for timing, (b) a dedicated forced aligner (Rung 2), or (c) proportional distribution of the highlight across the known phrase words by the chunk's audio span.

---

## §3. ACCURACY — normalized WER vs known Fatihah text

Corpus WER = one WER over all 7 ayat concatenated (the sequence-level number). Per-ayah range in the last column.

| Model | Corpus WER (beam5) | Corpus WER (beam1) | Per-ayah range | Verdict for word-sequence match |
|---|---|---|---|---|
| **base** (general) | 44.83% | 51.72% | 0% – 150% | ✗ too noisy (word splits, garbling) |
| **small** (general) | 24.14% | 24.14% | 0% – 56% | ~ borderline raw; good *after* fuzzy match (§4) |
| **medium** (general) | 6.90% | 10.34% | 0% – 22% | ✓ good, but 4s latency kills real-time |
| **tarteel-base-ar-quran** (Rung 1) | 34.48% ⚠ | **3.45%** | 0% – 11% | ✓✓ **best + fastest**; use beam1 no-ts |

**Error nature (why raw WER overstates the problem):** the misses are *not* random — they are word-boundary splits (مالك → "ما لك"), single-letter phonetic slips (نستعين → نستعيم, one ن→م), and garbling only on the hardest/longest ayah. Because the expected page text is **known and fixed**, most of these are near-misses recoverable by an edit-distance match (§4).

**Hamza-carrier weakness (audit T-11):** handled by normalization — Whisper emits hamza-carrier alef (إهدنا, إياك); the shared normalizer folds `[إأآٱ]→ا` on both sides, so it does not cause mismatches here. The residual Ayah-6 miss (اهدنا→اهدن, dropped final alef) is a genuine ASR slip, not a hamza-normalization gap. The Quran-tuned model removes it entirely.

---

## §4. ALIGNMENT PROTOTYPE — word-level exact vs fuzzy, on the real transcripts

Ported the `sequence-matcher.ts` forward+lookahead-2 logic to Python and fed each model's **real** transcripts (as a streaming word sequence) against the known 29-word Fatihah, under three equality tests. `advanced` = words correctly highlighted; `false_flags` = spurious mismatches that would **wrongly fire the "read 3 words + wait" correction** on a *correct* recitation.

| Model | EXACT (`===`, current rule) adv / false-flag | FUZZY Levenshtein≤2 adv / false-flag |
|---|---|---|
| base | 12 / 19 | 24 / 7 |
| **small** | 22 / **6** | **28 / 0** |
| medium | 27 / 2 | 28 / 1 |
| tarteel-base (beam1, 3.45% WER) | ≈ 28–29 / ~0 † | **≈ 29 / 0** |

† The alignment-probe's stored tarteel row reflects the *degraded* beam5+wts data (34% WER) and is not representative; the correct beam1 transcripts (3.45% WER) align essentially perfectly.

**The decisive alignment finding:** the current **exact-match matcher throws away the engine's real accuracy.** General-small under exact match false-flags **6** words on a clean recitation (unusable — the app would nag the reciter 6 times). The *same* small transcripts under **Levenshtein≤2 against the known word → 28/29 with ZERO false-flags.** Because the page text is fixed, fuzzy-matching against it absorbs the transcription noise: small's *effective* word-follow fidelity is **~97%, not 76%**. With the Quran-tuned model the raw text is already ~perfect, so fuzzy match is near-ideal.

→ **Word-level alignment IS robust given the measured WER — but only if (a) the model is Quran-tuned or fuzzy-matched, and (b) the matcher uses edit-distance, not `===`.** Phrase-level (2–4 words) is even more forgiving and is the safe floor. (This also motivates fixing audit **T-01**: don't discard correct words after a mid-chunk error.)

---

## VERDICT

**Word-level real-time follow, in the literal "each word lights the instant it is recited" sense, is NOT achievable on the current CPU chunk-then-transcribe stack** — blocked by the fixed ~0.4s+ per-call latency floor (longer than a spoken word) and by the Quran-tuned model's inability to emit reliable per-word timestamps. **A GPU is *not* the fix** for correctness (Rung 1 already clears the accuracy bar on CPU with huge margin); a GPU only helps if true sub-second live word-follow under concurrent load becomes a hard requirement (Rung 3).

**What IS achievable and recommended for v1: phrase-level live highlight on CPU, today.** Swap to the **Quran-tuned `tarteel-ai/whisper-base-ar-quran` (Rung 1)** running greedy/beam-1, no word_timestamps: **3.45% corpus WER at ~0.46s per VAD chunk** on this CPU. Cut chunks on VAD silence (phrase boundaries), match each chunk against the known page text with an **edit-distance (≤2) fuzzy matcher**, and highlight the matched phrase span. This delivers a responsive follow-along (~0.5s lag) and reliable divergence detection for the talqin correction loop — on the existing CPU VPS, no GPU. It maps exactly onto the operator's resolved **phrase-level fallback** and is honest to promise.

**Word-level highlight is a credible v1.5**, reached by adding **Rung 2 (forced alignment)** — align the *known* expected words to the chunk audio (whisperX / wav2vec2-CTC / MMS aligner, CPU-feasible) to get accurate per-word start/end times, then animate the highlight word-by-word within each resolved chunk. The spike shows this is the *necessary* route (the Rung-1 model can't self-time), confirming the ladder's Rung 2 as required-for-word-level rather than optional polish. Do **not** promise per-word live highlight in v1 until Rung 2 is measured on real reciters.

---

## Recommended v1 architecture

1. **Model:** `tarteel-ai/whisper-base-ar-quran`, converted to CTranslate2/int8 (done in the spike: `ct2-transformers-converter`, ~0.08s load), served via the existing faster-whisper `tasmi-server`. **beam_size=1, `word_timestamps=False`, `vad_filter=True`.** (Config change is small; the pipeline is unchanged — Rung 1 is a drop-in.)
2. **Chunking:** VAD-segmented on *silence* (natural phrase/word pauses), never fixed-time slices (fixed slices cut mid-word and produce garbage). Target ~1–3s phrase chunks.
3. **Matching:** upgrade `sequence-matcher.ts` from exact `===` to **edit-distance ≤2 against the known page word** (keep the forward + lookahead-2 restart logic; fix T-01 so correct words after an error aren't discarded). This is what converts raw WER into ~97–100% word-follow.
4. **Highlight (v1):** **phrase-level** — light the matched phrase span when its chunk resolves. Optional cheap "word sweep" within a resolved phrase by distributing the highlight across the known words proportionally to their length over the chunk's audio span (no aligner needed) — gives a word-by-word feel at ~0 extra cost.
5. **Highlight (v1.5):** add **Rung 2 forced alignment** for true per-word timing.
6. **Correction loop:** unchanged from vision — on a confirmed divergence, `talqin-player` reads 3 linked correct words, go silent, wait, resume.
7. **Concurrency (audit T-02):** a single `WhisperModel` is not safe for parallel `transcribe`; use a small worker pool / request queue. At 0.46s/chunk a 2–4 worker pool comfortably serves several concurrent reciters on CPU.

---

## Risks & unknowns (what real testing must still confirm)

- **BEST-CASE audio only.** Measured on Abdul Basit *murattal* — studio-clean, slow, professional. **Real tasmi = children/students, faster *hadr* pace, mic noise, room echo, varied accents.** Real-reciter WER will be higher than 3.45%. Must re-benchmark on real device recordings before promising fidelity.
- **Error-path untested.** Only *correct* recitation was measured. The product's other half — reciter says the *wrong* word → matcher must flag divergence and fire talqin without false-accepting — needs **deliberate-error samples**. Not measured here.
- **Live-mic VAD streaming untested.** The spike sliced files; real-time browser-mic VAD segmentation (chunk boundaries, endpointing, partial words) is the main integration risk (audit T-04 unbounded latency lives here).
- **VPS ≠ this Mac.** 0.46s is on Apple Silicon. A modest cloud CPU VPS (2–4 vCPU) will be slower — likely still under the bar for the tiny **base**-tuned model (huge headroom), but general small/medium would blow past. **Re-benchmark on the actual VPS.** Prefer the smallest Quran-tuned model that holds accuracy.
- **large-v3 not run** (~3 GB). Given general medium is already ~4s on CPU, large-v3 would be RTF > 1 (unusable real-time on CPU). Rung 1 makes it moot.
- **Bigger Quran fine-tunes not benchmarked.** Only `whisper-base-ar-quran` tested; it already clears the bar. `whisper-tiny-ar-quran` (even faster, for weak VPS) and any small/medium `*-ar-quran` (more accuracy headroom for hard surahs) are available upgrades if base proves insufficient on non-Fatihah, non-murattal material.
- **word_timestamps + fine-tune interaction** should be reconfirmed if a different Quran fine-tune or a newer faster-whisper is adopted; the repetition-hallucination behavior may differ.
