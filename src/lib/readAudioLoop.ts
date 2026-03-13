export interface ReadAudioLoopInput {
  currentIndex: number;
  rangeStartIndex: number;
  rangeEndIndex: number;
  repeatEachVerse: number;
  repeatSet: number;
  repeatEachStep: number;
  repeatSetStep: number;
}

export type ReadAudioLoopAction =
  | {
      type: "replay-current";
      nextRepeatEachStep: number;
      nextRepeatSetStep: number;
    }
  | {
      type: "play-index";
      nextIndex: number;
      nextRepeatEachStep: number;
      nextRepeatSetStep: number;
    }
  | {
      type: "stop";
      nextRepeatEachStep: number;
      nextRepeatSetStep: number;
    };

export function resolveReadAudioLoopAction(
  input: ReadAudioLoopInput,
): ReadAudioLoopAction {
  const {
    currentIndex,
    rangeStartIndex,
    rangeEndIndex,
    repeatEachVerse,
    repeatSet,
    repeatEachStep,
    repeatSetStep,
  } = input;

  if (repeatEachVerse === -1) {
    return {
      type: "replay-current",
      nextRepeatEachStep: repeatEachStep,
      nextRepeatSetStep: repeatSetStep,
    };
  }

  if (repeatEachStep < repeatEachVerse - 1) {
    return {
      type: "replay-current",
      nextRepeatEachStep: repeatEachStep + 1,
      nextRepeatSetStep: repeatSetStep,
    };
  }

  if (currentIndex < rangeEndIndex) {
    return {
      type: "play-index",
      nextIndex: currentIndex + 1,
      nextRepeatEachStep: 0,
      nextRepeatSetStep: repeatSetStep,
    };
  }

  if (repeatSet === -1) {
    if (rangeStartIndex === currentIndex) {
      return {
        type: "replay-current",
        nextRepeatEachStep: 0,
        nextRepeatSetStep: repeatSetStep,
      };
    }

    return {
      type: "play-index",
      nextIndex: rangeStartIndex,
      nextRepeatEachStep: 0,
      nextRepeatSetStep: repeatSetStep,
    };
  }

  if (repeatSetStep < repeatSet - 1) {
    if (rangeStartIndex === currentIndex) {
      return {
        type: "replay-current",
        nextRepeatEachStep: 0,
        nextRepeatSetStep: repeatSetStep + 1,
      };
    }

    return {
      type: "play-index",
      nextIndex: rangeStartIndex,
      nextRepeatEachStep: 0,
      nextRepeatSetStep: repeatSetStep + 1,
    };
  }

  return {
    type: "stop",
    nextRepeatEachStep: 0,
    nextRepeatSetStep: 0,
  };
}
