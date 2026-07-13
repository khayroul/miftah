# Understanding Coverage data-quality verdict — 2026-07-13

## Verdict: DO NOT sign off the current `96,219` denominator for a public coverage claim

`words.frequency` is documented in the schema as the word's “total occurrences in Quran” (`supabase/migrations/001_initial_schema.sql`). A frequency sum of **96,219** is therefore expected to reconcile to the canonical occurrence/token count. It does not.

| Evidence | Result |
| --- | ---: |
| Live-data audit recorded in `docs/superpowers/specs/2026-07-13-load-time-perf-audit.md` | `word_occurrences = 77,429` |
| Coverage strategy document's live-data reading | `SUM(words.frequency) = 96,219` across 21,977 rows |
| Reproducible canonical seed audit, `python3 scripts/seed/check_word_coverage.py` | 77,429 expected tokens; 77,429 occurrences; 0 mismatched ayat; 0 missing positions |
| Difference | 18,790 occurrences (24.27% above the canonical count) |

The often-cited 77,430 is a rounded/common canonical count. The tracked Tanzil/QUL tokenizer used by Miftah produces 77,429, so the one-token difference needs naming if it matters to copy, but it cannot explain an 18,790-occurrence surplus.

The tracked local `data/seed/words.json` is not a reproduction of the live data cited above (8,354 rows, frequency sum 20,298). It is therefore not evidence for the source of the production surplus. The likely failure modes are a stale imported frequency column, counting a token under multiple semantic/root rows, or a mismatch between the `words` identity model and `word_occurrences`; none is proven by the checked-in artifacts.

## `is_mastered` verdict: useful internal recall signal, not yet an “understood” bar

The migration comment promises `stability > 21 days AND 3 consecutive correct reviews` (`20260312081500_add_vocab_mastery_and_streaks.sql`). The live implementation in `src/lib/faham/vocab-progress.ts` currently flips `is_mastered` to true after **two** consecutive ratings greater than 1 and does not check stability. This discrepancy means the field is an implementation-level vocabulary-recall flag, not the documented durable-mastery rule. It also cannot, by itself, establish semantic comprehension of every occurrence of a polysemous word-form.

## Required sign-off before marquee copy

1. Run read-only production reconciliation: compare `SUM(words.frequency)` to `COUNT(*) FROM word_occurrences`, and group `word_occurrences` by `word_id` to locate every mismatched frequency.
2. Correct or explicitly redefine `words.frequency` so its denominator has one stated semantic: canonical token occurrences, not mixed word-form/root counts.
3. Decide and implement one mastered criterion; either align code with the documented durable threshold or revise the documentation and product copy.
4. Product/data owner signs off on the reconciled denominator and the claim wording. Until then, keep this engine behind a non-marquee/internal surface and describe it as frequency-weighted recognised vocabulary, not “you understand X% of the Quran.”

## Engine scope

The repository engine intentionally computes from the existing `words.frequency` field because it is the requested current source of truth. Its result is technically correct relative to that field, but this verdict blocks representing that result as canonical Quran-understanding coverage until the required sign-off is complete.
