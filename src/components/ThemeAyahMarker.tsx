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
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-stone-500 px-1.5 text-stone-600 dark:border-stone-400 dark:text-stone-300 ${className}`.trim()}
      aria-label={`Ayat ${ayahNumber}`}
      title={`Ayat ${ayahNumber}`}
    >
      <span
        aria-hidden="true"
        lang="ar"
        dir="rtl"
        className="font-arabic text-[0.72rem] font-semibold leading-none"
      >
        {toArabicIndicNumerals(ayahNumber)}
      </span>
    </span>
  );
}
