# Baseline re-validated post fix-now sprint

**Original capture:** SHA `6701568` (before the fix-now sprint).
**Re-validated at:** HEAD `a7d06c25` (after RF-1/2/3/4/5 merged), 2026-07-13.

A full re-capture (17 routes × 4 viewports) at the post-fix HEAD produced screenshots that are **byte-for-byte SHA-256 identical** to every PNG in this directory — 68/68, 0.0000% pixel change, no dynamic-region masking even needed.

**Conclusion:** the fix-now sprint (idempotency, faham engine gates, MCQ integrity, security fixes, tema/exposure migration) changed **zero rendering** on any logged-out route. This directory remains the valid Phase-1 zero-diff reference; no re-capture needed. The redundant byte-identical postfix corpus was discarded rather than committed (24MB of duplicate binaries).

Phase-1 wave gate compares against these PNGs via `docs/baseline/capture.mjs` + pixelmatch (≤0.1% changed, dynamic regions masked).
