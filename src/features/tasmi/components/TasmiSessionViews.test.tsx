import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  TasmiActiveView,
  TasmiBusyView,
  type TasmiActiveViewProps,
} from "./TasmiSessionViews";
import messages from "../../../../messages/ms.json";

const EXPECTED_TEXT = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
const FIRST_EXPECTED_WORD = "بِسْمِ";

function renderActive(
  overrides: Partial<TasmiActiveViewProps> = {},
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ms" messages={messages}>
      <TasmiActiveView
        errorMsg={null}
        hint={null}
        sessionMode="practice"
        streamMode="live"
        status="listening"
        expectedText={EXPECTED_TEXT}
        followIndex={-1}
        tentativeFollowIndex={null}
        errorPositions={new Set()}
        tentativeErrorPositions={new Set()}
        progress={0}
        onStop={vi.fn()}
        onCancel={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe("TasmiActiveView session-mode integrity", () => {
  it("hides expected Quran text and immediate mistake help in exam mode", () => {
    const markup = renderActive({
      sessionMode: "exam",
      status: "error",
    });

    expect(markup).not.toContain(FIRST_EXPECTED_WORD);
    expect(markup).not.toContain("Ada bahagian yang perlu diperbetulkan");
    expect(markup).toContain("Teks disembunyikan semasa ujian");
    expect(markup).toContain("Saya sedang mendengar");
  });

  it("keeps word-follow and corrective feedback in practice mode", () => {
    const markup = renderActive({ status: "error" });

    for (const word of EXPECTED_TEXT.split(" ")) {
      expect(markup).toContain(word);
    }
    expect(markup).toContain("Ada bahagian yang perlu diperbetulkan");
    expect(markup).toContain("Perlu diulang");
  });
});

describe("TasmiBusyView", () => {
  it("explains that capacity is full without grading the recitation", () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="ms" messages={messages}>
        <TasmiBusyView onRetry={vi.fn()} onCancel={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(markup).toContain("Tasmi&#x27; sedang penuh");
    expect(markup).toContain("Sesi anda belum bermula");
    expect(markup).toContain("bacaan tidak dinilai");
    expect(markup).toContain("Cuba Semula");
    expect(markup).toContain("Kembali");
  });
});
