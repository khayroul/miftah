"use client";

import dynamic from "next/dynamic";
import { FAHAM_PWA_CACHE_HOOKS } from "@/features/faham/client";

const MushafDownloadPrompt = dynamic(
  () =>
    import("@/mushaf/components/MushafDownloadPrompt").then(
      (module) => module.MushafDownloadPrompt,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const FeedbackButton = dynamic(
  () =>
    import("@/components/FeedbackButton").then(
      (module) => module.FeedbackButton,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

export function HomeDeferredUi() {
  return (
    <>
      <MushafDownloadPrompt optionalCache={FAHAM_PWA_CACHE_HOOKS} />
      <FeedbackButton />
    </>
  );
}
