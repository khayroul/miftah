/** PUBLIC lightweight Mushaf integration surface for pure Hifz domain logic. */
export {
  getDifficultAyahs,
  toggleDifficultAyah,
} from "./domain/difficultAyahs";
export { calculateHifzRevealStageByAyahKeys } from "./domain/pageReveal";
export type { HifzRevealStage } from "./domain/pageReveal";
