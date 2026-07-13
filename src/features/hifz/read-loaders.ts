/**
 * PUBLIC lightweight Read integration surface.
 *
 * Keep this entry free of static component and Tasmi imports. Read uses these
 * loaders so Hifz exercise and recorder graphs remain separate lazy chunks.
 */
export const loadHifzInlineRating = () =>
  import("./components/HifzInlineRating").then((module) => module.HifzInlineRating);
export const loadHifzMemorizeStepper = () =>
  import("./components/HifzMemorizeStepper").then((module) => module.HifzMemorizeStepper);
export const loadHifzSessionBar = () =>
  import("./components/HifzSessionBar").then((module) => module.HifzSessionBar);
export const loadHifzSessionComplete = () =>
  import("./components/HifzSessionComplete").then((module) => module.HifzSessionComplete);
export const loadHifzTebukSession = () =>
  import("./components/sessions/HifzTebukSession").then((module) => module.HifzTebukSession);
export const loadHifzUnveilSession = () =>
  import("./components/sessions/HifzUnveilSession").then((module) => module.HifzUnveilSession);
