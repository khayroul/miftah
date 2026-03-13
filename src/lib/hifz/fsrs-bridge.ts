import type { Card } from "ts-fsrs";
import { State } from "ts-fsrs";
import type { FsrsFields } from "@/types/database";

/** Convert a database row's FSRS columns into a ts-fsrs Card object */
export function dbRowToCard(row: FsrsFields): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** Convert a ts-fsrs Card back to database columns */
export function cardToDbRow(card: Card): FsrsFields {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 0 | 1 | 2 | 3,
    due: card.due.toISOString(),
    last_review: card.last_review
      ? card.last_review instanceof Date
        ? card.last_review.toISOString()
        : String(card.last_review)
      : null,
  };
}

/** FSRS columns for an already-memorized (mature) card */
export function matureCardDbRow(): FsrsFields {
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    stability: 30,
    difficulty: 0.3,
    elapsed_days: 7,
    scheduled_days: 7,
    reps: 5,
    lapses: 0,
    state: 2, // Review
    due: sevenDaysLater.toISOString(),
    last_review: now.toISOString(),
  };
}

/** Default FSRS columns for a brand-new card */
export function newCardDbRow(): FsrsFields {
  return {
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    due: new Date().toISOString(),
    last_review: null,
  };
}
