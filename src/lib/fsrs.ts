import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type Grade,
  type RecordLog,
  Rating,
} from "ts-fsrs";

// Default FSRS parameters — will be optimized after 500+ review events
const params = generatorParameters();
const scheduler = fsrs(params);

export { Rating };
export type { Card, Grade, RecordLog };

/**
 * Create a new FSRS card (state=New, due=now)
 */
export function createNewCard(): Card {
  return createEmptyCard();
}

/**
 * Schedule a review and get the next card state for each possible rating.
 * Returns a RecordLog with entries for Again(1), Hard(2), Good(3), Easy(4).
 */
export function scheduleReview(card: Card, now?: Date): RecordLog {
  return scheduler.repeat(card, now ?? new Date());
}

/**
 * Apply a rating to a card and return the updated card + review log entry.
 */
export function applyRating(card: Card, rating: Grade, now?: Date) {
  const result = scheduler.repeat(card, now ?? new Date());
  return result[rating];
}
