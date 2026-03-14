interface ThemeAyahMarkerProps {
  ayahNumber: number;
  className?: string;
}

function toArabicIndicNumerals(value: number): string {
  return String(value).replaceAll(/\d/g, (digit) =>
    String.fromCharCode(0x0660 + Number.parseInt(digit, 10)),
  );
}

export function ThemeAyahMarker({
  ayahNumber,
  className = "",
}: ThemeAyahMarkerProps) {
  return (
    <span
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-stone-400/70 bg-white px-2.5 text-stone-700 shadow-[0_6px_18px_-14px_rgba(28,25,23,0.45)] dark:border-stone-500/70 dark:bg-stone-900 dark:text-stone-200 sm:h-11 sm:min-w-11 sm:px-3 ${className}`.trim()}
      aria-label={`Ayat ${ayahNumber}`}
      title={`Ayat ${ayahNumber}`}
      lang="ar"
      dir="rtl"
    >
      <span
        aria-hidden="true"
        className="font-arabic text-[0.95rem] font-semibold leading-none sm:text-[1.05rem]"
      >
        {toArabicIndicNumerals(ayahNumber)}
      </span>
    </span>
  );
}
