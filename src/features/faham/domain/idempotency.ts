/**
 * Application-level idempotency helpers (RF-2).
 *
 * These guard the faham/hifz write paths against silent data-corruption from
 * duplicate or re-entrant POSTs (double-clicks, re-entrant auto-advance timers,
 * and network retries) WITHOUT requiring a database migration. They implement a
 * short-window dedup keyed on a row's most-recent write timestamp — a card that
 * was written moments ago is treated as "already handled", so a second submit of
 * the same review is a no-op instead of a double-apply.
 *
 * These are best-effort, not a hard guarantee: robust cross-instance dedup would
 * need a DB unique constraint (see repository.recordVocabExposureEvents for the
 * exposure follow-up). The windows are deliberately small — comfortably larger
 * than the sub-second re-entrancy / immediate-retry gap, yet far smaller than the
 * shortest legitimate re-review interval (FSRS reschedules even a lapse minutes
 * out, and a just-reviewed card is never re-served within the window), so a real
 * distinct review is never dropped.
 */

/** Dedup window for faham/hifz review submits (B1, B3). */
export const REVIEW_DEDUP_WINDOW_MS = 30_000;

/** Dedup window for faham exposure events (B6). */
export const EXPOSURE_DEDUP_WINDOW_MS = 30_000;

/**
 * True when `timestamp` sits within `windowMs` of `now` (in either direction, to
 * tolerate minor server clock skew on a just-written row). A null/undefined or
 * unparseable timestamp is never "within window" — so never-written rows (e.g. a
 * brand-new card whose last_review is null) never trip the guard.
 */
export function isWithinWindow(
  timestamp: string | null | undefined,
  now: Date,
  windowMs: number,
): boolean {
  if (!timestamp) {
    return false;
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return Math.abs(now.getTime() - parsed) < windowMs;
}

/**
 * B1/B3: true when a progress row was reviewed so recently that a new rating POST
 * is a duplicate submit rather than a distinct review. Keyed on `last_review` (not
 * `updated_at`) so a brand-new card — whose last_review is null until its first
 * rating — is never falsely deduped on that first rating.
 */
export function isRecentlyReviewed(
  lastReview: string | null | undefined,
  now: Date,
  windowMs: number = REVIEW_DEDUP_WINDOW_MS,
): boolean {
  return isWithinWindow(lastReview, now, windowMs);
}

/**
 * B6: true when an exposure event for the same natural key (user + source_key) was
 * recorded within the dedup window — i.e. this POST is a network-retry duplicate of
 * a batch that was already inserted.
 */
export function isRecentExposure(
  lastExposedAt: string | null | undefined,
  now: Date,
  windowMs: number = EXPOSURE_DEDUP_WINDOW_MS,
): boolean {
  return isWithinWindow(lastExposedAt, now, windowMs);
}

// Compatibility re-export. Persistence code owns this generic SQLSTATE concern.
export { isUniqueViolation } from "@/shared/postgres";
