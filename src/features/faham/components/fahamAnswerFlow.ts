export interface AnswerState {
  attemptCount: 1 | 2;
  initialIsCorrect: boolean;
  isCorrect: boolean;
  phase: "feedback" | "retry";
  revealAnswer: boolean;
  selectedIndex: number;
}

export function recordFahamAnswer(params: {
  current: AnswerState | null;
  isCorrect: boolean;
  selectedIndex: number;
}): {
  answerState: AnswerState;
  shouldIncrementCorrectCount: boolean;
} {
  const retrying = params.current?.phase === "retry";
  return {
    answerState: {
      attemptCount: retrying ? 2 : 1,
      initialIsCorrect: retrying
        ? params.current?.initialIsCorrect ?? false
        : params.isCorrect,
      isCorrect: params.isCorrect,
      phase: "feedback",
      revealAnswer: params.isCorrect || retrying,
      selectedIndex: params.selectedIndex,
    },
    shouldIncrementCorrectCount: params.isCorrect && !retrying,
  };
}

export function beginFahamRetry(
  answerState: AnswerState | null,
): AnswerState | null {
  if (
    !answerState ||
    answerState.phase !== "feedback" ||
    answerState.initialIsCorrect ||
    answerState.attemptCount !== 1 ||
    answerState.revealAnswer
  ) {
    return null;
  }
  return { ...answerState, phase: "retry" };
}

export function revealFahamAnswer(
  answerState: AnswerState | null,
): AnswerState | null {
  if (
    !answerState ||
    answerState.phase !== "feedback" ||
    answerState.revealAnswer
  ) {
    return null;
  }
  return { ...answerState, revealAnswer: true };
}

export function fahamRatingForAnswer(answerState: AnswerState): 1 | 3 {
  return answerState.initialIsCorrect ? 3 : 1;
}
