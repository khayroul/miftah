# Miftah Product Direction

Miftah helps Malaysian Muslims memorize the Quran through understanding, deliberate recall, and consistent review. Bahasa Malaysia is the primary cultural context, with a complete English experience rather than a mixed-language fallback.

## Product promises

- Reading mode remains a calm, sacred Mushaf experience with minimal chrome.
- Faham explains meaning; Tema provides thematic context; Hifz turns that understanding into active memorization.
- Quran Arabic uses the established QCF V2 rendering path. Product UI must never substitute an approximate Quran font.
- A selected language applies to the whole experience. Malay screens show Malay meaning; English screens show English meaning.
- The established warm-paper, deep-navy, muted-teal, and restrained-amber visual world is the default. New features extend it rather than introducing a separate dashboard aesthetic.

## Hifz product contract

Hifz is one memorization engine with two interchangeable views:

- **Ayah view** isolates the current passage and its meaning for focused practice.
- **Mushaf view** preserves page position and visual memory.

Both views share the same passage, reveal state, session, and progress. Switching views must not restart or duplicate a session.

Scheduled work is due-first: review is the primary action, new Sabak follows, and free passage practice is secondary. Scheduled results are graded through the existing FSRS path using `ts-fsrs`; no alternative scheduler or hand-written FSRS math is permitted. Free practice never writes a grade or changes memorization status.

The first feedback loop is **Hide → Recite → Reveal → self-grade**. Recording, teacher review, and automatic speech recognition are optional upgrades, not prerequisites for the dependable self-check loop. Their sequencing and data boundaries are maintained in `docs/HIFZ_PRACTICE_UPGRADE_PATH.md`.

## Delivery boundaries

- Local implementation and verification do not imply deployment.
- Missing content degrades gracefully and never crashes the reading or practice experience.
- Authentication protects saved progress, but unauthenticated visitors may safely explore free practice without creating records.
- Product, privacy, and schema changes for recorded voice require explicit review before implementation.
