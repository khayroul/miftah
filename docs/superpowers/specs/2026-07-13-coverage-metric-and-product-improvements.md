# Quran-Coverage Metric + Product Improvements (Fable strategic pass)

**Date:** 2026-07-13 · **Source:** operator idea (frequency-weighted mastery + word tiering) + operator ask "go thru the plan and improvise". Validated with LIVE production data (read-only).

## The measured numbers (real, this DB)

`words` table: 21,977 word-forms, summing to **96,219 total occurrences** (⚠ see data-quality caveat — canonical Quran token count is ~77,430; verify the frequency source before this becomes a headline number).

**Tier coverage (the Zipfian curve — the killer insight):**
| Learn the top… | …and you understand this % of all Quran word-occurrences |
|---|---|
| 10 words | 7.6% |
| 100 words | 31.0% |
| 300 words | 45.1% |
| 500 words | **51.9% — half the Quran** |
| 1,000 words | 60.5% |
| 2,000 words | 68.9% |
| 5,000 words | 79.7% |

**Operator's own account:** 207 mastered words = 24,982 weighted occurrences = **25.96% of the Quran understood.** By raw count that's 207/21,977 ≈ 0.9% — the weighting turns "1%" into "26%". THAT reframing is the whole point.

## The metric (as requested)
- **Coverage % = Σ(frequency of a user's mastered words) / Σ(frequency of all Quran words) × 100.**
- **Tiering:** rank words by frequency DESC; for each tier (top 10/100/300/500/1000/2000/5000) show mastered/total in tier + the coverage % that tier unlocks.
- Cheap to compute now (leverages the `idx_words_frequency` index applied to prod 2026-07-13). One query, no per-request aggregation if cached.

## Fable's strategic read — this is bigger than a feature

**Elevate coverage to the app's NORTH-STAR metric.** Miftah's promise is "memorize by *understanding*." Coverage % is the only number that makes "understanding" measurable, honest, and motivating — and no competing Quran app surfaces it. Recommendations, ranked:

1. **Coverage % becomes the home hero number.** Replace scattered word/page/streak counts as the headline with "You understand X% of the Quran." It's the emotional core and the reason to return.
2. **Frequency-first curriculum (optional mode).** Faham currently selects words by exposure/context. Offer a path that teaches high-frequency words first → fastest coverage gain ("500 words → half the Quran"). Biggest differentiator; medium effort. CAVEAT: the very top words are particles (و/ال/في) — grammatically vital but dry; blend frequency with meaningfulness, don't rank on frequency alone.
3. **The tier map as the redesign's centerpiece.** A visual "Quran comprehension map" — tiers filling in as the user masters words — should anchor the Phase-2 redesign, not be a stat in a corner.
4. **Onboarding hook.** First-run: "The 10 most common words appear thousands of times — master them and you'll recognise 1 in 13 words of the Quran." Immediate, concrete value proposition.
5. **Relaunch / win-back lever (fits the dormant-beta-cohort reality).** Personalised: "You already understand 26% of the Quran — 40 words from 30%." Far stronger re-engagement than "come back."
6. **Two-axis progress spine.** Pair "understanding coverage" (Faham) with "memorisation coverage" (% of Quran memorised, Hifz) — a unified progress model across the app's modes.

## Plan-level improvements (the "improvise on the overall plan" ask)
- **Pull the coverage feature EARLY, not late.** It's cheap, validated, and could anchor the whole redesign — build the query + a basic surface soon (data-layer/faham wave), design the full tier-map in Phase 2. Don't bury it at the end.
- **Make the relaunch explicit in the plan.** The users are a dormant beta cohort; "launch" should include a coverage-driven win-back, not just a public switch-on.
- **Add a data-quality gate before coverage goes headline:** verify the frequency source (96,219 vs canonical ~77,430), confirm the `is_mastered` bar is meaningful (RF-4 fixed its gate), so the flagship number is defensible.
- Performance/cost is already elevated to a first-class pillar (the ledger) — keep it.

## Where each piece lands
- **Now:** query validated (this doc), index live.
- **Data-layer / faham wave (Wave 5):** productionise the coverage + tier query in the repository (cached, cheap), expose via a stats module.
- **Phase 2 redesign:** the tier-map visual as a centerpiece; coverage as home hero; onboarding hook.
- **Launch/relaunch:** coverage-driven win-back for dormant users.
- **Operator decisions:** frequency-first curriculum (yes/no + blend), and the data-quality verification of the frequency source.
