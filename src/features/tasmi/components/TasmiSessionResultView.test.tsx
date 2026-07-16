import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TasmiSessionResult } from "../domain/tasmi-session";
import { TasmiSessionResultView } from "./TasmiSessionResultView";

const RESULT: TasmiSessionResult = {
  totalWords: 20,
  wordsCorrect: 18,
  talqinCount: 1,
  errorPositions: [6],
  accuracy: 90,
  durationSeconds: 42,
};

function renderResult(
  overrides: Partial<Parameters<typeof TasmiSessionResultView>[0]> = {},
): string {
  return renderToStaticMarkup(
    <TasmiSessionResultView
      result={RESULT}
      onRetry={vi.fn()}
      onSave={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TasmiSessionResultView save feedback", () => {
  it("keeps a failed result visible with an explicit save retry", () => {
    const markup = renderResult({
      saveState: "error",
      saveError: "Sambungan terputus. Keputusan belum disimpan.",
    });

    expect(markup).toContain("Sambungan terputus. Keputusan belum disimpan.");
    expect(markup).toContain("Cuba Simpan Semula");
    expect(markup).not.toContain("Sudah Disimpan");
  });

  it("shows a saved confirmation and disables duplicate actions", () => {
    const markup = renderResult({ saveState: "saved" });

    expect(markup).toContain("Keputusan telah disimpan");
    expect(markup).toContain("Sudah Disimpan");
    expect(markup).toContain("disabled");
  });

  it("does not offer to save an incomplete range", () => {
    const markup = renderResult({ endedEarly: true });

    expect(markup).toContain("Sesi dihentikan sebelum tamat");
    expect(markup).not.toContain("Simpan &amp; Teruskan");
  });
});
