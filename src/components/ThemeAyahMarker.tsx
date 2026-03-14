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
      className={`inline-flex items-center gap-1 text-stone-600 dark:text-stone-300 ${className}`.trim()}
      aria-label={`Ayat ${ayahNumber}`}
      title={`Ayat ${ayahNumber}`}
    >
      <span
        aria-hidden="true"
        className="font-arabic text-[2rem] leading-none sm:text-[2.4rem]"
      >
        ۝
      </span>
      <span
        aria-hidden="true"
        lang="ar"
        dir="rtl"
        className="font-arabic text-[1.4rem] font-semibold leading-none sm:text-[1.7rem]"
      >
        {toArabicIndicNumerals(ayahNumber)}
      </span>
    </span>
  );
}
