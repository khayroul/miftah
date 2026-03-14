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
      className={`relative inline-flex h-32 w-32 items-center justify-center text-stone-600 dark:text-stone-300 sm:h-40 sm:w-40 ${className}`.trim()}
      aria-label={`Ayat ${ayahNumber}`}
      title={`Ayat ${ayahNumber}`}
    >
      <span
        aria-hidden="true"
        className="font-arabic text-[8.75rem] leading-none sm:text-[10.5rem]"
      >
        ۝
      </span>
      <span
        aria-hidden="true"
        lang="ar"
        dir="rtl"
        className="font-arabic absolute inset-0 flex items-center justify-center text-[2.45rem] font-semibold leading-none sm:text-[2.95rem]"
      >
        {toArabicIndicNumerals(ayahNumber)}
      </span>
    </span>
  );
}
