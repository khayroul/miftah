# Hifz Practice Engine — Upgrade Path

Status: V1 self-check flow implemented locally. This file is the starting point for future Hifz practice sessions.

## Product contract

Miftah has one Hifz practice engine with two Quran presentations:

- Ayah view supports focused acquisition, meaning, and short chunks.
- Mushaf view supports page position and spatial recall.

Switching views must never reset the selected passage, audio position, conceal/reveal state, queue position, or FSRS outcome. The renderer may change; the practice session does not.

The dependable V1 feedback loop is:

1. Listen and follow.
2. Cover the Quran text.
3. Recite from memory.
4. Reveal and compare.
5. Self-grade.
6. Store the result through the existing `ts-fsrs` path.

Do not replace this fallback when recording or automatic speech recognition is added. Voice features enhance evidence; they must not become the only way to complete a session.

## What V1 now provides

| Capability | Current behavior | Source anchor |
| --- | --- | --- |
| Due-first entry | Scheduled Sabqi and Manzil review is the leading action | `src/features/hifz/components/HifzOverviewCards.tsx` |
| Continue Sabak | New memorization remains available after due review | `src/features/hifz/components/HifzOverviewCards.tsx` |
| Free practice | Any Mushaf page can be opened without changing the FSRS schedule | `src/features/hifz/components/HifzOverview.tsx` |
| Dual presentation | Ayah and Mushaf views share the same active session | `src/features/hifz/components/HifzPracticeView.tsx` |
| QCF V2 Ayah rendering | Ayah cards use the page-specific QCF V2 glyph stream, not runtime-shaped Quran text | `src/features/hifz/components/HifzPracticeView.tsx` |
| Locale-correct meaning | Malay shows `display_bm`; English shows `translation_en` | `src/features/hifz/components/HifzPracticeView.tsx` |
| FSRS scheduling | Self-grades continue through the existing rate APIs and `ts-fsrs` bridge | `src/app/api/hifz/rate/route.ts`, `src/app/api/hifz/rate-batch/route.ts` |
| Resume | Queue and step position remain locally resumable for 24 hours | `src/features/hifz/domain/sessionQueue.ts`, `src/features/hifz/domain/resumePoint.ts` |

V1 intentionally adds no database table. A scheduled self-grade is already represented by `study_progress`, `review_log`, and activity events. Free practice is deliberately unscheduled and does not write an FSRS grade.

## Upgrade sequence

### V1.1 — Recording and playback

Goal: let a learner hear their own attempt before self-grading.

- Add an optional record button during the covered phase.
- Keep audio on-device by default; make upload an explicit user action.
- Show duration, playback, delete, and re-record controls.
- Record consent and retention language before adding cloud storage.
- Do not change the FSRS grade automatically.

Database change only if cloud persistence is approved:

- Create `hifz_practice_sessions` for passage, view, timestamps, and completion state.
- Create `hifz_practice_attempts` for attempt metadata and an optional private storage path.
- Add ownership RLS with both `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)`.
- Create the migration with `supabase migration new <name>`; never invent or edit an already-applied migration.

### V1.2 — Teacher review

Goal: allow a chosen teacher to review a submitted recording without weakening user privacy.

- Add explicit share/revoke controls per attempt.
- Store teacher feedback separately from the learner's self-grade.
- Never silently overwrite FSRS history from teacher feedback.
- Add audit timestamps and an immutable reviewer identity.

### V2 — Automatic recitation feedback

Goal: align a recording to the expected ayat and highlight probable omissions, substitutions, and hesitation.

- Reuse the existing Tasmi text and alignment domain; do not couple the core practice controller to one speech provider.
- Return word-level confidence and timing, not only one accuracy percentage.
- Label low-confidence findings as uncertain and let the learner reveal/check manually.
- Keep self-grade available when the model, microphone, network, or Arabic dialect handling fails.
- Do not send audio to a third party without clear consent and a documented retention policy.
- Treat automatic feedback as evidence for the learner, not an infallible Quran correction.

FSRS policy for V2 must be decided explicitly before implementation. Recommended starting rule: the user confirms the final grade; automatic evidence may recommend but may not silently schedule.

### V2.1 — Weak-span practice

Goal: turn repeated difficulty into a focused next action.

- Aggregate difficult ayat and word spans from confirmed attempts.
- Offer smaller chunks, comparison with nearby mutashabihat, and targeted repeat counts.
- Preserve the due queue as the primary session entry.
- Keep recommendations explainable: show why a span appeared.

### V3 — Offline and cross-device session continuity

Goal: safely continue a practice attempt across devices and weak connectivity.

- Introduce server session IDs and idempotent attempt writes.
- Sync queue position without duplicating `review_log` entries.
- Resolve conflicts by preserving review history; never discard a completed grade.
- Cache only the passage assets needed for the current and next session.

## Architecture boundaries future sessions must keep

- FSRS only through `ts-fsrs`; never implement scheduler math in a component or route.
- `src/mushaf` remains the sacred QCF V2 rendering kernel. Wrap it; do not rewrite it.
- Ayah and Mushaf are renderers of one session state, not separate products.
- The due queue is authoritative for scheduled work. Free practice must remain unable to contaminate it accidentally.
- Missing audio, translation, manifest, or speech service must degrade to a usable self-check.
- Quran audio and recordings are separate concerns: reciter audio may be cached; user recordings require explicit privacy rules.

## Start-of-session checklist for the next implementation

1. Read this file and inspect the current Hifz graph before editing.
2. Verify the local V1 flow in both Malay and English, Ayah and Mushaf views.
3. Choose exactly one upgrade stage above; do not combine recording, teacher review, and speech recognition in one change.
4. If a schema change is required, inspect current migrations and official Supabase guidance first.
5. Add failure, retry, offline, privacy, and accessibility states before calling the stage complete.
6. Keep deployment, migration application, and live verification as separate explicit steps.
