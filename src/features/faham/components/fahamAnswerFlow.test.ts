import assert from "node:assert/strict";
import test from "node:test";
import {
  beginFahamRetry,
  fahamRatingForAnswer,
  recordFahamAnswer,
  revealFahamAnswer,
} from "./fahamAnswerFlow";

test("a correct first attempt increments the score and saves a good rating", () => {
  const result = recordFahamAnswer({
    current: null,
    isCorrect: true,
    selectedIndex: 2,
  });

  assert.equal(result.shouldIncrementCorrectCount, true);
  assert.equal(result.answerState.revealAnswer, true);
  assert.equal(fahamRatingForAnswer(result.answerState), 3);
});

test("a corrected retry preserves the missed first attempt for scheduling", () => {
  const firstAttempt = recordFahamAnswer({
    current: null,
    isCorrect: false,
    selectedIndex: 0,
  });
  const retry = beginFahamRetry(firstAttempt.answerState);
  const secondAttempt = recordFahamAnswer({
    current: retry,
    isCorrect: true,
    selectedIndex: 1,
  });

  assert.equal(firstAttempt.answerState.revealAnswer, false);
  assert.ok(retry);
  assert.equal(secondAttempt.answerState.attemptCount, 2);
  assert.equal(secondAttempt.shouldIncrementCorrectCount, false);
  assert.equal(fahamRatingForAnswer(secondAttempt.answerState), 1);
});

test("revealing the answer ends the retry opportunity without changing rating", () => {
  const firstAttempt = recordFahamAnswer({
    current: null,
    isCorrect: false,
    selectedIndex: 3,
  });
  const revealed = revealFahamAnswer(firstAttempt.answerState);

  assert.ok(revealed);
  assert.equal(revealed.revealAnswer, true);
  assert.equal(beginFahamRetry(revealed), null);
  assert.equal(fahamRatingForAnswer(revealed), 1);
});
