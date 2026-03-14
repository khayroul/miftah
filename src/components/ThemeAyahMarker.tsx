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
      className={`relative inline-flex h-10 w-10 items-center justify-center text-stone-600 dark:text-stone-300 sm:h-12 sm:w-12 ${className}`.trim()}
      aria-label={`Ayat ${ayahNumber}`}
      title={`Ayat ${ayahNumber}`}
    >
      <span
        aria-hidden="true"
        className="font-arabic text-[2.2rem] leading-none sm:text-[2.55rem]"
      >
        ۝
      </span>
      <span
        aria-hidden="true"
        lang="ar"
        dir="rtl"
        className="font-arabic absolute inset-0 flex items-center justify-center text-[0.78rem] font-semibold leading-none sm:text-[0.92rem]"
      >
        {toArabicIndicNumerals(ayahNumber)}
      </span>
    </span>
  );
}
