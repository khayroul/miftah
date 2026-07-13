"use client";

import dynamic from "next/dynamic";

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
      <MushafDownloadPrompt />
      <FeedbackButton />
    </>
  );
}
